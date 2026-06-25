/**
 * Characterization tests for the four slide transition configs produced by
 * `getTransitionSteps`.
 *
 * These tests pin down the *exact* enter/exit frame values for every slide
 * direction, catching regressions that would swap enter and exit, pick the
 * wrong margin key, emit extra style keys, or change the number of steps.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect} from 'vitest';
import {
	getTransitionSteps,
	FRAME_INTERVAL_MS,
	SLIDE_STEPS,
} from '../src/animation.js';
import type {TransitionConfig} from '../src/types.js';

// ── Expected constants (derived from src/animation.tsx exports) ────

/** Duration of every slide transition — the shared frame interval. */
const EXPECTED_DURATION = FRAME_INTERVAL_MS;
/** Full step distance a slide transition collapses from/to. */
const EXPECTED_STEPS = SLIDE_STEPS;
/** Half of SLIDE_STEPS — the midpoint value in the 3-frame slide. */
const EXPECTED_MID = SLIDE_STEPS / 2;
/** Number of frames per enter/exit for a slide transition. */
const EXPECTED_FRAME_COUNT = 3;

// ── Helpers ────────────────────────────────────────────────────────

/**
 * The complete set of margin keys a slide transition may set.
 * Used to assert that each frame sets exactly one key.
 */
const ALL_MARGIN_KEYS = [
	'marginTop',
	'marginBottom',
	'marginLeft',
	'marginRight',
] as const;

type MarginKey = (typeof ALL_MARGIN_KEYS)[number];

/** Extract the set of margin keys actually present on a step style. */
function presentMarginKeys(style: TransitionConfig['enter'] extends infer T
	? T extends Array<infer S>
		? S
		: never
	: never extends {style: infer K}
	? K
	: never): MarginKey[] {
	return ALL_MARGIN_KEYS.filter(k => k in style);
}

/**
 * Assert the *exact* shape of a complete slide transition config for a given
 * margin key: 3 enter frames stepping `steps → steps/2 → 0`, 3 exit frames
 * stepping `0 → steps/2 → steps`, with the configured duration, and every
 * frame carrying exactly one margin key (no leakage from the factory).
 */
function expectSlideConfig(
	config: TransitionConfig,
	marginKey: MarginKey,
): void {
	// ── Top-level shape ────────────────────────────────────────────
	expect(config.enter).toBeDefined();
	expect(config.exit).toBeDefined();
	expect(config.duration).toBe(EXPECTED_DURATION);

	// Exactly 3 frames per direction — no more, no less.
	expect(config.enter).toHaveLength(EXPECTED_FRAME_COUNT);
	expect(config.exit).toHaveLength(EXPECTED_FRAME_COUNT);

	// ── Enter: steps → steps/2 → 0 ────────────────────────────────
	expect(config.enter![0]!.style).toEqual({[marginKey]: EXPECTED_STEPS});
	expect(config.enter![1]!.style).toEqual({[marginKey]: EXPECTED_MID});
	expect(config.enter![2]!.style).toEqual({[marginKey]: 0});

	// ── Exit: 0 → steps/2 → steps ─────────────────────────────────
	expect(config.exit![0]!.style).toEqual({[marginKey]: 0});
	expect(config.exit![1]!.style).toEqual({[marginKey]: EXPECTED_MID});
	expect(config.exit![2]!.style).toEqual({[marginKey]: EXPECTED_STEPS});

	// ── No margin-key leakage: every frame sets exactly one key ────
	for (const frame of [...config.enter!, ...config.exit!]) {
		const keys = presentMarginKeys(frame.style);
		expect(keys).toEqual([marginKey]);
	}
}

// ── Duration & frame count shared across all slide transitions ─────

describe('slide transitions — shared duration & frame count', () => {
	const slideNames = [
		'slide-up',
		'slide-down',
		'slide-left',
		'slide-right',
	] as const;

	test('every slide transition has exactly 3 enter and 3 exit frames', () => {
		for (const name of slideNames) {
			const cfg = getTransitionSteps(name);
			expect(cfg.enter, `${name} enter`).toHaveLength(
				EXPECTED_FRAME_COUNT,
			);
			expect(cfg.exit, `${name} exit`).toHaveLength(
				EXPECTED_FRAME_COUNT,
			);
		}
	});

	test('every slide transition uses the shared frame interval (80ms) as duration', () => {
		for (const name of slideNames) {
			const cfg = getTransitionSteps(name);
			expect(cfg.duration, `${name} duration`).toBe(EXPECTED_DURATION);
		}
	});

	test('slide transitions step from SLIDE_STEPS (4) down to 0 and back', () => {
		for (const name of slideNames) {
			const cfg = getTransitionSteps(name);
			const marginKey = presentKey(cfg);
			// Enter first frame starts at the full step distance…
			expect(cfg.enter![0]!.style[marginKey]).toBe(EXPECTED_STEPS);
			// …and the last enter frame rests at 0.
			expect(cfg.enter!.at(-1)!.style[marginKey]).toBe(0);
		}
	});
});

// ── Per-direction exact-value pinning ──────────────────────────────

describe('slide-up transition — exact config', () => {
	test('enter/exit use marginTop with the 4 → 2 → 0 / 0 → 2 → 4 pattern', () => {
		const cfg = getTransitionSteps('slide-up');
		expectSlideConfig(cfg, 'marginTop');
	});

	test('enter and exit are mirror images (same key, reversed values)', () => {
		const cfg = getTransitionSteps('slide-up');
		const enterValues = cfg.enter!.map(s => s.style.marginTop);
		const exitValues = cfg.exit!.map(s => s.style.marginTop);
		expect(exitValues).toStrictEqual([...enterValues].reverse());
	});
});

describe('slide-down transition — exact config', () => {
	test('enter/exit use marginBottom with the 4 → 2 → 0 / 0 → 2 → 4 pattern', () => {
		const cfg = getTransitionSteps('slide-down');
		expectSlideConfig(cfg, 'marginBottom');
	});

	test('enter and exit are mirror images (same key, reversed values)', () => {
		const cfg = getTransitionSteps('slide-down');
		const enterValues = cfg.enter!.map(s => s.style.marginBottom);
		const exitValues = cfg.exit!.map(s => s.style.marginBottom);
		expect(exitValues).toStrictEqual([...enterValues].reverse());
	});
});

describe('slide-left transition — exact config', () => {
	test('enter/exit use marginLeft with the 4 → 2 → 0 / 0 → 2 → 4 pattern', () => {
		const cfg = getTransitionSteps('slide-left');
		expectSlideConfig(cfg, 'marginLeft');
	});

	test('enter and exit are mirror images (same key, reversed values)', () => {
		const cfg = getTransitionSteps('slide-left');
		const enterValues = cfg.enter!.map(s => s.style.marginLeft);
		const exitValues = cfg.exit!.map(s => s.style.marginLeft);
		expect(exitValues).toStrictEqual([...enterValues].reverse());
	});
});

describe('slide-right transition — exact config', () => {
	test('enter/exit use marginRight with the 4 → 2 → 0 / 0 → 2 → 4 pattern', () => {
		const cfg = getTransitionSteps('slide-right');
		expectSlideConfig(cfg, 'marginRight');
	});

	test('enter and exit are mirror images (same key, reversed values)', () => {
		const cfg = getTransitionSteps('slide-right');
		const enterValues = cfg.enter!.map(s => s.style.marginRight);
		const exitValues = cfg.exit!.map(s => s.style.marginRight);
		expect(exitValues).toStrictEqual([...enterValues].reverse());
	});
});

// ── Each direction uses a distinct margin key ──────────────────────

describe('slide transitions — each direction targets a unique margin key', () => {
	test('no two slide directions share the same margin key', () => {
		const keys = {
			'slide-up': presentKey(getTransitionSteps('slide-up')),
			'slide-down': presentKey(getTransitionSteps('slide-down')),
			'slide-left': presentKey(getTransitionSteps('slide-left')),
			'slide-right': presentKey(getTransitionSteps('slide-right')),
		};
		const uniqueKeys = new Set(Object.values(keys));
		expect(uniqueKeys.size).toBe(4);
	});

	test('the four directions map to top/bottom/left/right respectively', () => {
		expect(presentKey(getTransitionSteps('slide-up'))).toBe('marginTop');
		expect(presentKey(getTransitionSteps('slide-down'))).toBe('marginBottom');
		expect(presentKey(getTransitionSteps('slide-left'))).toBe('marginLeft');
		expect(presentKey(getTransitionSteps('slide-right'))).toBe('marginRight');
	});
});

/** Return the single margin key present in a slide config's first enter frame. */
function presentKey(config: TransitionConfig): MarginKey {
	const style = config.enter![0]!.style;
	return presentMarginKeys(style)[0]!;
}
