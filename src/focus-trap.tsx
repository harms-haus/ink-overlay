/**
 * Focus-trap primitives for ink-overlay.
 *
 * Provides {@link useFocusTrap} (hook) and {@link FocusTrap} (component)
 * that confine Tab / Shift+Tab cycling to a fixed set of children,
 * disabling Ink's global focus navigation while the trap is active.
 *
 * ## Cooperative scoping (documented limitation)
 *
 * Ink's focus system is **global** — `focusNext` / `focusPrevious` cycle
 * through **all** active focusables.  Correct scoping depends on
 * **background** components deactivating their `useFocus` with
 * `isActive: false` when `isCaptured` (from
 * {@link useInputCaptureState}) is `true`.  The trap disables global
 * Tab nav via `disableFocus` and cycles via its own handler; background
 * components that check `isCaptured` will have `isActive: false` and
 * be skipped by `focusNext`.  This cooperative requirement is a
 * documented limitation.
 *
 * @module focus-trap
 */

import {
	type ReactNode,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useId,
} from 'react';
import {useFocusManager} from 'ink';
import {
	useRegisterInput,
	useInputDispatcher,
	useInputCaptureState,
} from './input-dispatcher.js';

// ── Focus-gate ref counter ──────────────────────────────────────────

/**
 * Per-focus-manager trap-depth counter.
 *
 * `disableFocus()` / `enableFocus()` on Ink's `FocusManager` are NOT
 * ref-counted — they set a single boolean flag.  Without this counter,
 * an inner trap's deactivation would call `enableFocus()` while an outer
 * trap is still confining, prematurely re-enabling global Tab navigation.
 *
 * Only the **first** trap to activate (0 → 1) calls `disableFocus()`, and
 * only the **last** to deactivate (1 → 0) calls `enableFocus()`.  This
 * mirrors the `captureDepth` ref-counting in the {@link InputDispatcher}.
 *
 * A `WeakMap` keyed by the `FocusManager` instance is used (rather than a
 * single module-level integer) because each Ink `<App>` root has its own
 * `FocusManager` singleton.  This keeps counters isolated across
 * independent render roots — e.g. in tests — without leaking memory.
 */
const focusTrapDepths = new WeakMap<object, number>();

// ── Types ────────────────────────────────────────────────────────────

export type FocusTrapOptions = {
	/** Called when the user presses Escape while the trap is active. */
	onEscape?: () => void;
	/**
	 * When `true` (default), focus returns to the element that was
	 * focused before the trap activated.  Set to `false` to leave
	 * focus wherever it happens to be after deactivation.
	 */
	restoreFocus?: boolean;
};

export type UseFocusTrapResult = {
	/** Stable, unique identifier for this trap instance. */
	trapId: string;
	/** `true` while the trap is active. */
	isTrapped: boolean;
};

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Confine Tab / Shift+Tab focus cycling to a set of children managed
 * by this trap.
 *
 * @param active  When `true`, the trap is engaged: global Tab navigation
 *                is disabled, and the handler registered via
 *                {@link useRegisterInput} forwards Tab / Shift+Tab to
 *                {@link FocusManager.focusNext | focusNext} /
 *                {@link FocusManager.focusPrevious | focusPrevious}
 *                (which still operate on Ink's internal focusable list,
 *                but only children with `isActive: true` are visited —
 *                background components that gate on
 *                {@link useInputCaptureState} are skipped).
 * @param options Optional configuration (see {@link FocusTrapOptions}).
 *
 * @returns An object with `trapId` (stable unique string) and
 *          `isTrapped` (mirrors `active`).
 */
export function useFocusTrap(
	active: boolean,
	options?: FocusTrapOptions,
): UseFocusTrapResult {
	const trapId = useId();
	const focusManager = useFocusManager();
	const {captureEnter, captureExit} = useInputDispatcher();

	// Snapshot of the focused element before the trap engaged.
	const previousFocusIdReference = useRef<string | undefined>(undefined);

	// Stable option accessors (latest value without re-subscribing).
	const onEscapeReference = useRef(options?.onEscape);
	onEscapeReference.current = options?.onEscape;
	const restoreFocus = options?.restoreFocus ?? true;

	// ── Activation / deactivation ──────────────────────────────────

	const activateEffectEvent = useEffectEvent(() => {
		// Snapshot current focus before we disable global navigation.
		previousFocusIdReference.current = focusManager.activeId;
		const depth = (focusTrapDepths.get(focusManager) ?? 0) + 1;
		focusTrapDepths.set(focusManager, depth);
		if (depth === 1) {
			focusManager.disableFocus();
		}
	});

	const deactivateEffectEvent = useEffectEvent(() => {
		const depth = Math.max(0, (focusTrapDepths.get(focusManager) ?? 0) - 1);
		focusTrapDepths.set(focusManager, depth);
		if (depth === 0) {
			focusManager.enableFocus();
			if (restoreFocus && previousFocusIdReference.current) {
				// Guard against a stale focus target that may have
				// unmounted while the trap was active.  Ink's
				// FocusManager.focus() can throw when the id is
				// unknown — we must not let that propagate out of the
				// passive-effect cleanup.
				try {
					focusManager.focus(previousFocusIdReference.current);
				} catch {
					// Target no longer exists — nothing to restore.
				}
			}
		}
	});

	useEffect(() => {
		if (active) {
			activateEffectEvent();
			return () => {
				deactivateEffectEvent();
			};
		}

		return () => {};
	}, [active]);

	// ── Input handler ──────────────────────────────────────────────

	const handleInput = useCallback(
		(
			_input: string,
			key: {tab?: boolean; shift?: boolean; escape?: boolean},
		) => {
			// Ink's useInput clears `input` to '' for non-alphanumeric keys
			// (Tab, Shift+Tab, Escape) and puts identity in the key object.
			if (key.tab && !key.shift) {
				focusManager.focusNext();
				return true;
			}

			if (key.tab && key.shift) {
				focusManager.focusPrevious();
				return true;
			}

			if (key.escape) {
				onEscapeReference.current?.();
				return true;
			}

			return false;
		},
		[focusManager],
	);

	// Register only while active.
	useRegisterInput(trapId, handleInput, active);

	// ── Capture depth ──────────────────────────────────────────────
	//
	// Increment the InputDispatcher capture depth while the trap is
	// active so cooperative background components see isCaptured=true
	// and deactivate their useFocus.

	useEffect(() => {
		if (active) {
			captureEnter();
			return () => {
				captureExit();
			};
		}

		return () => {};
	}, [active, captureEnter, captureExit]);

	return useMemo(() => ({trapId, isTrapped: active}), [trapId, active]);
}

// ── Component ────────────────────────────────────────────────────────

export type FocusTrapProps = {
	/** Whether the trap is active. Default `true`. */
	active?: boolean;
	/** Called when Escape is pressed inside the trap. */
	onEscape?: () => void;
	/**
	 * When `true` (default), focus returns to the previously-focused
	 * element on deactivation.
	 */
	restoreFocus?: boolean;
	children: ReactNode;
};

/**
 * Convenience wrapper around {@link useFocusTrap}.
 *
 * ```tsx
 * <FocusTrap active={isOpen} onEscape={close}>
 *   <MyDialog />
 * </FocusTrap>
 * ```
 *
 * @see {@link useFocusTrap} for the cooperative scoping limitation.
 */
export function FocusTrap({
	active = true,
	onEscape,
	restoreFocus = true,
	children,
}: FocusTrapProps) {
	useFocusTrap(active, {onEscape, restoreFocus});
	return <>{children}</>;
}
