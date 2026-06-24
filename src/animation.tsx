import {useState, useEffect, useRef} from 'react';
import type {
	TransitionName, TransitionStep, TransitionConfig,
} from './types.js';

// ── getTransitionSteps (cached) ────────────────────────────────────

/** Module-level cache: deterministic per TransitionName. */
const transitionCache = new Map<TransitionName, TransitionConfig>();

/**
 * Returns predefined enter/exit frame sequences for a named transition.
 *
 * Each step's `style` is a partial Box-style override applied per frame.
 * Terminal UIs have no real opacity — transitions are stepped style changes
 * (offset / width / dim).
 *
 * Results are cached per name since transition configs are deterministic.
 */
export function getTransitionSteps(name: TransitionName): TransitionConfig {
	const cached = transitionCache.get(name);
	if (cached) {
		return cached;
	}

	let config: TransitionConfig;

	switch (name) {
		case 'none': {
			config = {enter: [{style: {}}], exit: [{style: {}}], duration: 0};
			break;
		}

		case 'fade': {
			// Fade = stepped height grow (terminals have no real opacity).
			//
			// The previous implementation applied `dim`/`dimColor` to the
			// wrapper <Box> via the transition style, but those are <Text>
			// props — Ink silently ignores them on <Box>, so there was no
			// visible dimming. The name 'fade' is kept for API compatibility;
			// the visual effect is a 0→1 height grow (collapse/expand).
			config = {
				enter: [
					{style: {height: 0}},
					{style: {height: 1}},
				],
				exit: [
					{style: {height: 1}},
					{style: {height: 0}},
				],
				duration: 80,
			};
			break;
		}

		case 'slide-up': {
			const n = 4;
			config = {
				enter: [
					{style: {marginTop: n}},
					{style: {marginTop: n / 2}},
					{style: {marginTop: 0}},
				],
				exit: [
					{style: {marginTop: 0}},
					{style: {marginTop: n / 2}},
					{style: {marginTop: n}},
				],
				duration: 80,
			};
			break;
		}

		case 'slide-down': {
			const n = 4;
			config = {
				enter: [
					{style: {marginBottom: n}},
					{style: {marginBottom: n / 2}},
					{style: {marginBottom: 0}},
				],
				exit: [
					{style: {marginBottom: 0}},
					{style: {marginBottom: n / 2}},
					{style: {marginBottom: n}},
				],
				duration: 80,
			};
			break;
		}

		case 'slide-left': {
			const n = 4;
			config = {
				enter: [
					{style: {marginLeft: n}},
					{style: {marginLeft: n / 2}},
					{style: {marginLeft: 0}},
				],
				exit: [
					{style: {marginLeft: 0}},
					{style: {marginLeft: n / 2}},
					{style: {marginLeft: n}},
				],
				duration: 80,
			};
			break;
		}

		case 'slide-right': {
			const n = 4;
			config = {
				enter: [
					{style: {marginRight: n}},
					{style: {marginRight: n / 2}},
					{style: {marginRight: 0}},
				],
				exit: [
					{style: {marginRight: 0}},
					{style: {marginRight: n / 2}},
					{style: {marginRight: n}},
				],
				duration: 80,
			};
			break;
		}

		default: {
			config = {enter: [{style: {}}], exit: [{style: {}}], duration: 0};
		}
	}

	transitionCache.set(name, config);
	return config;
}

// ── resolveTransition ──────────────────────────────────────────────

/**
 * Resolve a `TransitionName | TransitionConfig | undefined` to a
 * `TransitionConfig | undefined`.
 *
 * - `undefined` → `undefined`
 * - string → `getTransitionSteps(name)`
 * - object → as-is
 */
export function resolveTransition(
	transition: TransitionName | TransitionConfig | undefined,
): TransitionConfig | undefined {
	if (transition === undefined) {
		return undefined;
	}

	if (typeof transition === 'string') {
		return getTransitionSteps(transition);
	}

	return transition;
}

// ── mergeTransitionStyle ───────────────────────────────────────────

/**
 * Shallow-merge a transition style on top of a base style.
 * Transition values override base values.
 */
export function mergeTransitionStyle(
	base: Record<string, unknown>,
	transition: Record<string, number | string>,
): Record<string, unknown> {
	return {...base, ...transition};
}

// ── useEnterExit ───────────────────────────────────────────────────

type Stage = 'entering' | 'visible' | 'exiting' | 'exited';

export type UseEnterExitResult = {
	stage: Stage;
	currentStyle: Record<string, number | string>;
	key: string;
};

/**
 * Drives an enter/exit transition for an element driven by a `visible` boolean.
 *
 * Uses a plain setInterval + useEffect for frame stepping. This is a deliberate
 * choice over ink's `useAnimation` hook: useAnimation depends on the
 * AnimationContext provider (only present inside ink's `<App>`) and the shared
 * timer / render-throttle semantics make frame-counting hard to drive
 * deterministically in tests. A self-contained interval is trivially testable
 * with real timers and `await delay()`.
 */
export function useEnterExit(
	visible: boolean,
	config: TransitionConfig,
	options?: {onExited?: () => void},
): UseEnterExitResult {
	const enterFrames: TransitionStep[] = config.enter ?? [{style: {}}];
	const exitFrames: TransitionStep[] = config.exit ?? [{style: {}}];
	const interval = config.duration ?? 80;
	const canSkip = enterFrames.length <= 1 && exitFrames.length <= 1;

	// ── State ───────────────────────────────────────────────────────

	const [stage, setStage] = useState<Stage>(() => {
		if (visible) {
			return canSkip ? 'visible' : 'entering';
		}

		return 'exited';
	});

	const [transitionKey, setTransitionKey] = useState(0);
	const [frame, setFrame] = useState(0);

	// ── Refs (stale-closure avoidance) ──────────────────────────────

	const previousVisibleReference = useRef(visible);
	const onExitedReference = useRef(options?.onExited);
	onExitedReference.current = options?.onExited;

	// ── Frame-stepper interval ──────────────────────────────────────

	const isActive = stage === 'entering' || stage === 'exiting';
	const activeFrames = stage === 'entering' ? enterFrames : exitFrames;

	useEffect(() => {
		if (!isActive) {
			return;
		}

		setFrame(0);

		const id = setInterval(() => {
			setFrame(f => {
				const next = f + 1;
				if (next >= activeFrames.length) {
					clearInterval(id);
					return f;
				}

				return next;
			});
		}, interval);

		return () => {
			clearInterval(id);
		};
	}, [isActive, interval, activeFrames.length]);

	// ── Detect animation completion ─────────────────────────────────

	useEffect(() => {
		if (stage === 'entering' && frame >= enterFrames.length - 1) {
			setStage('visible');
		}
	}, [stage, frame, enterFrames.length]);

	useEffect(() => {
		if (stage === 'exiting' && frame >= exitFrames.length - 1) {
			setStage('exited');
			onExitedReference.current?.();
		}
	}, [stage, frame, exitFrames.length]);

	// ── Handle visible prop changes ─────────────────────────────────

	useEffect(() => {
		const previousVisible = previousVisibleReference.current;

		if (visible && !previousVisible) {
			// False → true: start entering
			setFrame(0);
			setTransitionKey(k => k + 1);
			setStage(canSkip ? 'visible' : 'entering');
		} else if (!visible && previousVisible) {
			// True → false: start exiting
			setFrame(0);
			setTransitionKey(k => k + 1);
			if (canSkip) {
				setStage('exited');
				onExitedReference.current?.();
			} else {
				setStage('exiting');
			}
		}

		previousVisibleReference.current = visible;
	}, [visible, canSkip]);

	// ── Compute currentStyle ────────────────────────────────────────

	let currentStyle: Record<string, number | string> = {};

	switch (stage) {
		case 'entering': {
			const index = Math.min(frame, enterFrames.length - 1);
			currentStyle = enterFrames[index]?.style ?? {};
			break;
		}

		case 'visible': {
			// Hold the final enter frame's style.
			currentStyle = enterFrames.at(-1)?.style ?? {};
			break;
		}

		case 'exiting': {
			const index = Math.min(frame, exitFrames.length - 1);
			currentStyle = exitFrames[index]?.style ?? {};
			break;
		}

		case 'exited': {
			currentStyle = {};
			break;
		}
	}

	return {
		stage,
		currentStyle,
		key: String(transitionKey),
	};
}
