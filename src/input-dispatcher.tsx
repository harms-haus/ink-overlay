/**
 * Core modal input-capture mechanism for ink-overlay.
 *
 * Provides a LIFO (last-in, first-out) handler stack so overlay-internal
 * components (Esc dismiss, Tab cycling, backdrop) get first crack at every
 * keypress, and a `captureDepth` counter that cooperative background
 * components can read via {@link useInputCaptureState} to gate their own
 * `useInput` / `useFocus` calls.
 *
 * ## Cooperative model (documented limitation)
 *
 * Every **active** `useInput` hook fires on **every** keypress via one
 * shared `EventEmitter` inside Ink's `<App>`. There is **no**
 * `consumed`-boolean, propagation-stop, or priority mechanism.
 *
 * **Consequence:** the framework's own `useInput` fires *independently*
 * of any consumer's standalone `useInput`. The dispatcher **cannot**
 * block an *uncooperative* standalone `useInput`.
 *
 * The supported pattern is **cooperative**: background components gate
 * their `useInput` / `useFocus` with `useInputCaptureState().isCaptured`
 * (set `isActive: !isCaptured`). The LIFO stack is for
 * overlay-internal routing (Esc dismiss, Tab cycling, backdrop) and
 * provides the `isCaptured` signal for cooperative background gating.
 *
 * ## SSR / non-TTY
 *
 * When `useStdin().isRawModeSupported` is `false`, the dispatcher's own
 * `useInput` has `isActive: false` (no `setRawMode` call, no throw).
 * Capture is effectively a no-op for input — layers still render their
 * backdrops but do not trap input.
 *
 * @module input-dispatcher
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from 'react';
import {useInput, useStdin, type Key} from 'ink';
import {warnBunInput} from './runtime.js';

// ── Types ────────────────────────────────────────────────────────────

/** Handler signature: return `true` to consume the input, `false`/void to pass through. */
type InputHandler = (input: string, key: Key) => boolean | void;

type StackEntry = {
	id: string;
	handler: InputHandler;
};

/**
 * Context value exposed by {@link InputDispatcher}.
 *
 * Callers interact with the LIFO handler stack through
 * `registerInput` / `unregisterInput`, and with the capture depth
 * through `captureEnter` / `captureExit`.
 */
type InputDispatcherContextValue = {
	/** Register a handler at the top of the LIFO stack (replaces any existing entry with the same id). */
	registerInput: (id: string, handler: InputHandler) => void;
	/** Remove the handler with the given id from the stack. */
	unregisterInput: (id: string) => void;
	/** Increment the capture depth counter. */
	captureEnter: () => void;
	/** Decrement the capture depth counter (floored at 0). */
	captureExit: () => void;
	/** Current capture depth. */
	captureDepth: number;
	/** `true` when `captureDepth > 0`. Background components gate their `useInput` on `!isCaptured`. */
	isCaptured: boolean;
};

const InputDispatcherContext =
	createContext<InputDispatcherContextValue | null>(null);

// ── InputDispatcher component ────────────────────────────────────────

/**
 * Root input dispatcher — mount **once** inside `<OverlayHost>`.
 *
 * Owns a single `useInput` (from Ink) whose `isActive` is gated by
 * `useStdin().isRawModeSupported`. On each keypress the internal LIFO
 * handler stack is walked top-down (most-recently-registered first).
 * If a handler returns `true` the walk stops; otherwise it continues
 * to the next handler.
 *
 * Exposes its API via {@link InputDispatcherContext}.
 */
export function InputDispatcher({children}: {children: ReactNode}) {
	const {isRawModeSupported} = useStdin();

	// ── LIFO handler stack (ref — mutations don't trigger re-renders) ──
	const stackReference = useRef<StackEntry[]>([]);

	// ── capture depth (state — drives isCaptured re-renders) ─────────
	const [captureDepth, setCaptureDepth] = useState<number>(0);

	// Guard: warnBunInput fires at most once per process.
	const bunWarnFiredReference = useRef(false);

	// Warn Bun on first captureEnter (effect runs after state update).
	useEffect(() => {
		if (captureDepth >= 1 && !bunWarnFiredReference.current) {
			bunWarnFiredReference.current = true;
			warnBunInput();
		}
	}, [captureDepth]);

	// ── Dispatch walk — uses useEffectEvent so the latest stack is read
	//    without re-subscribing to the event emitter. ──────────────────
	const dispatchWalk = useEffectEvent((input: string, key: Key) => {
		const stack = stackReference.current;
		for (let i = stack.length - 1; i >= 0; i--) {
			const entry = stack[i]!;
			try {
				const consumed = entry.handler(input, key);
				if (consumed === true) {
					return; // Consumed — stop walking.
				}
			} catch (error: unknown) {
				console.error(
					`[@harms-haus/ink-overlay] Input handler "${entry.id}" threw; continuing dispatch.`,
					error,
				);
				// Continue walking so unconsumed input still reaches lower handlers.
			}
		}
	});

	// Single useInput — isActive gated by isRawModeSupported (no setRawMode in non-TTY).
	useInput(dispatchWalk, {isActive: isRawModeSupported});

	// ── Context API ───────────────────────────────────────────────────
	const registerInput = useCallback((id: string, handler: InputHandler) => {
		// Dedupe: remove any existing entry with the same id first.
		stackReference.current = stackReference.current.filter(e => e.id !== id);
		stackReference.current.push({id, handler});
	}, []);

	const unregisterInput = useCallback((id: string) => {
		stackReference.current = stackReference.current.filter(e => e.id !== id);
	}, []);

	const captureEnter = useCallback(() => {
		setCaptureDepth(previous => previous + 1);
	}, []);

	const captureExit = useCallback(() => {
		setCaptureDepth(previous => Math.max(0, previous - 1));
	}, []);

	const value: InputDispatcherContextValue = useMemo(
		() => ({
			registerInput,
			unregisterInput,
			captureEnter,
			captureExit,
			captureDepth,
			isCaptured: captureDepth > 0,
		}),
		[registerInput, unregisterInput, captureEnter, captureExit, captureDepth],
	);

	return (
		<InputDispatcherContext.Provider value={value}>
			{children}
		</InputDispatcherContext.Provider>
	);
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Register an input handler with the LIFO stack.
 *
 * - Registered on mount (or when `isActive` transitions to `true`).
 * - Unregistered on cleanup (or when `isActive` transitions to `false`).
 * - The handler reference is stabilised via {@link useEffectEvent} so
 *   the consumer's changing handler identity does not churn the stack.
 *
 * @param id        Stable unique identifier for this registration.
 * @param handler   Callback invoked when this entry is at the top of the stack.
 * @param isActive  When `false` the handler is not registered. Default `true`.
 */
export function useRegisterInput(
	id: string,
	handler: InputHandler,
	isActive = true,
): void {
	const {registerInput, unregisterInput} = useInputDispatcher();

	// Stable wrapper — always invokes the latest handler via useEffectEvent.
	const stableHandler = useEffectEvent((input: string, key: Key) =>
		handler(input, key),
	);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		registerInput(id, stableHandler);

		return () => {
			unregisterInput(id);
		};
	}, [id, isActive, registerInput, unregisterInput]);
}

/**
 * Read the current capture state.
 *
 * Returns `true` when at least one layer has called `captureEnter` and
 * not yet balanced it with `captureExit`.
 *
 * Background components use this to gate their own input handling:
 *
 * ```tsx
 * const isCaptured = useInputCaptureState();
 * useInput(myHandler, {isActive: !isCaptured});
 * ```
 */
export function useInputCaptureState(): boolean {
	return useInputDispatcher().isCaptured;
}

/**
 * Access the full {@link InputDispatcherContextValue}.
 *
 * @throws {Error} If used outside an `<InputDispatcher>` provider.
 */
export function useInputDispatcher(): InputDispatcherContextValue {
	const context = useContext(InputDispatcherContext);
	if (context === null) {
		throw new Error(
			'useInputDispatcher must be used within an <InputDispatcher>. ' +
				'Mount <InputDispatcher> once (typically inside <OverlayHost>).',
		);
	}

	return context;
}

// Re-export the context value type for downstream consumers.
export type {InputDispatcherContextValue};
