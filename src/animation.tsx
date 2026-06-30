import {useState, useEffect, useRef} from 'react';
import type {
	TransitionName,
	TransitionStep,
	TransitionConfig,
} from './types.js';

/** Milliseconds between animation frames for all built-in transitions. */
export const FRAME_INTERVAL_MS = 80;

/** Maximum margin (character cells) used by slide transitions. */
export const SLIDE_STEPS = 4;

// ── getTransitionSteps (cached) ────────────────────────────────────

/** Module-level cache: deterministic per TransitionName. */
const transitionCache = new Map<TransitionName, TransitionConfig>();

/** Margin keys a slide transition may target. */
type MarginKey = 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight';

/**
 * Build a slide transition config for the given margin key.
 *
 * Enter steps the margin `steps → steps/2 → 0` (collapse in); exit reverses
 * it `0 → steps/2 → steps` (slide away). Identical structure for every
 * direction — only the margin key differs.
 */
function createSlideTransition(
	marginKey: MarginKey,
	steps: number,
	interval: number,
): TransitionConfig {
	return {
		enter: [
			{style: {[marginKey]: steps}},
			{style: {[marginKey]: steps / 2}},
			{style: {[marginKey]: 0}},
		],
		exit: [
			{style: {[marginKey]: 0}},
			{style: {[marginKey]: steps / 2}},
			{style: {[marginKey]: steps}},
		],
		duration: interval,
	};
}

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
			config = {
				enter: [{style: {height: 0}}, {style: {height: 1}}],
				exit: [{style: {height: 1}}, {style: {height: 0}}],
				duration: FRAME_INTERVAL_MS,
			};
			break;
		}

		case 'slide-up':
			config = createSlideTransition(
				'marginTop',
				SLIDE_STEPS,
				FRAME_INTERVAL_MS,
			);
			break;

		case 'slide-down':
			config = createSlideTransition(
				'marginBottom',
				SLIDE_STEPS,
				FRAME_INTERVAL_MS,
			);
			break;

		case 'slide-left':
			config = createSlideTransition(
				'marginLeft',
				SLIDE_STEPS,
				FRAME_INTERVAL_MS,
			);
			break;

		case 'slide-right':
			config = createSlideTransition(
				'marginRight',
				SLIDE_STEPS,
				FRAME_INTERVAL_MS,
			);
			break;

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
	transitionKey: string;
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
	const interval = config.duration ?? FRAME_INTERVAL_MS;
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
	const frameReference = useRef(frame);
	frameReference.current = frame;

	// ── Frame-stepper interval ──────────────────────────────────────

	const isActive = stage === 'entering' || stage === 'exiting';
	const activeFrames = stage === 'entering' ? enterFrames : exitFrames;

	useEffect(() => {
		if (!isActive) {
			return;
		}

		setFrame(0);

		const id = setInterval(() => {
			const next = frameReference.current + 1;
			if (next >= activeFrames.length) {
				clearInterval(id);
				return;
			}

			setFrame(next);
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
		transitionKey: String(transitionKey),
	};
}
