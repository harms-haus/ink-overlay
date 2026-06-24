/**
 * Tests for animation helpers: getTransitionSteps, useEnterExit, mergeTransitionStyle.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {
	describe, test, expect, afterEach,
} from 'vitest';
import React, {type ReactElement} from 'react';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import {
	getTransitionSteps,
	useEnterExit,
	mergeTransitionStyle,
} from '../src/animation.js';
import type {TransitionConfig} from '../src/types.js';
import {delay} from './helpers/delay.js';

// ── Helpers ────────────────────────────────────────────────────────

/** Snapshot of useEnterExit's return value, captured per render. */
type HookSnapshot = {
	stage: string;
	currentStyle: Record<string, number | string>;
	key: string;
};

/**
 * Test harness component that drives `useEnterExit` and exposes its state
 * via an `onState` callback.
 */
function Harness({
	visible,
	config,
	onState,
	onExited,
}: {
	visible: boolean;
	config: TransitionConfig;
	onState: (snapshot: HookSnapshot) => void;
	onExited?: () => void;
}) {
	const result = useEnterExit(visible, config, {onExited});

	// Report the current state synchronously during render so tests can
	// capture it after a single `await delay()` flush.
	onState(result);

	return <Text>content</Text>;
}

afterEach(async () => {
	// Small delay between tests to let ink's rendering loop settle.
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// (a) getTransitionSteps
// ════════════════════════════════════════════════════════════════════

describe('getTransitionSteps', () => {
	test('\'none\' returns single-frame enter/exit with duration 0', () => {
		const cfg = getTransitionSteps('none');
		expect(cfg.enter).toHaveLength(1);
		expect(cfg.exit).toHaveLength(1);
		expect(cfg.duration).toBe(0);
	});

	test('\'slide-up\' enter has 3+ frames with strictly decreasing marginTop', () => {
		const cfg = getTransitionSteps('slide-up');
		expect(cfg.enter!.length).toBeGreaterThanOrEqual(3);

		const margins = cfg.enter!.map(s => (s.style.marginTop as number) ?? 0);
		for (let i = 1; i < margins.length; i++) {
			expect(margins[i]!).toBeLessThan(margins[i - 1]!);
		}
	});

	test('\'slide-up\' exit has 3+ frames with strictly increasing marginTop', () => {
		const cfg = getTransitionSteps('slide-up');
		expect(cfg.exit!.length).toBeGreaterThanOrEqual(3);

		const margins = cfg.exit!.map(s => (s.style.marginTop as number) ?? 0);
		for (let i = 1; i < margins.length; i++) {
			expect(margins[i]!).toBeGreaterThan(margins[i - 1]!);
		}
	});

	test('\'slide-down\' enter has 3+ frames with strictly decreasing marginBottom', () => {
		const cfg = getTransitionSteps('slide-down');
		expect(cfg.enter!.length).toBeGreaterThanOrEqual(3);

		const values = cfg.enter!.map(s => (s.style.marginBottom as number) ?? 0);
		for (let i = 1; i < values.length; i++) {
			expect(values[i]!).toBeLessThan(values[i - 1]!);
		}
	});

	test('\'slide-left\' enter has 3+ frames with strictly decreasing marginLeft', () => {
		const cfg = getTransitionSteps('slide-left');
		expect(cfg.enter!.length).toBeGreaterThanOrEqual(3);

		const values = cfg.enter!.map(s => (s.style.marginLeft as number) ?? 0);
		for (let i = 1; i < values.length; i++) {
			expect(values[i]!).toBeLessThan(values[i - 1]!);
		}
	});

	test('\'slide-right\' enter has 3+ frames with strictly decreasing marginRight', () => {
		const cfg = getTransitionSteps('slide-right');
		expect(cfg.enter!.length).toBeGreaterThanOrEqual(3);

		const values = cfg.enter!.map(s => (s.style.marginRight as number) ?? 0);
		for (let i = 1; i < values.length; i++) {
			expect(values[i]!).toBeLessThan(values[i - 1]!);
		}
	});

	test('\'fade\' is a 2-frame height-grow (terminals have no real opacity)', () => {
		const cfg = getTransitionSteps('fade');
		expect(cfg.enter).toHaveLength(2);
		expect(cfg.exit).toHaveLength(2);

		// The 'fade' transition steps height 0→1 (enter) and 1→0 (exit).
		// It must NOT carry `dim`/`dimColor` keys — those are <Text> props
		// and are silently dropped when spread onto the wrapper <Box>.
		expect(cfg.enter![0]!.style).not.toHaveProperty('dim');
		expect(cfg.enter![0]!.style).not.toHaveProperty('dimColor');
		expect(cfg.enter![1]!.style).not.toHaveProperty('dim');
		expect(cfg.exit![0]!.style).not.toHaveProperty('dim');
		expect(cfg.exit![1]!.style).not.toHaveProperty('dim');

		// Enter grows: height 0 → 1.
		expect(cfg.enter![0]!.style).toHaveProperty('height', 0);
		expect(cfg.enter![1]!.style).toHaveProperty('height', 1);

		// Exit shrinks: height 1 → 0.
		expect(cfg.exit![0]!.style).toHaveProperty('height', 1);
		expect(cfg.exit![1]!.style).toHaveProperty('height', 0);
	});

	test('all named transitions have an enter and exit array', () => {
		for (const name of [
			'none',
			'fade',
			'slide-up',
			'slide-down',
			'slide-left',
			'slide-right',
		] as const) {
			const cfg = getTransitionSteps(name);
			expect(cfg.enter).toBeDefined();
			expect(cfg.exit).toBeDefined();
			expect(cfg.enter!.length).toBeGreaterThanOrEqual(1);
			expect(cfg.exit!.length).toBeGreaterThanOrEqual(1);
		}
	});
});

// ════════════════════════════════════════════════════════════════════
// (b) mergeTransitionStyle
// ════════════════════════════════════════════════════════════════════

describe('mergeTransitionStyle', () => {
	test('shallow-merges transition over base', () => {
		const result = mergeTransitionStyle(
			{color: 'red', bold: true},
			{color: 'blue'},
		);
		expect(result).toEqual({color: 'blue', bold: true});
	});

	test('transition overrides base keys', () => {
		const result = mergeTransitionStyle({marginTop: 10}, {marginTop: 0});
		expect(result.marginTop).toBe(0);
	});

	test('base keys not in transition are preserved', () => {
		const result = mergeTransitionStyle(
			{width: 20, height: 10},
			{height: 5},
		);
		expect(result).toEqual({width: 20, height: 5});
	});

	test('returns a new object (not the same reference)', () => {
		const base = {a: 1};
		const result = mergeTransitionStyle(base, {b: 2});
		expect(result).not.toBe(base);
		expect(result).toEqual({a: 1, b: 2});
	});

	test('handles empty base', () => {
		expect(mergeTransitionStyle({}, {x: 1})).toEqual({x: 1});
	});

	test('handles empty transition', () => {
		expect(mergeTransitionStyle({x: 1}, {})).toEqual({x: 1});
	});
});

// ════════════════════════════════════════════════════════════════════
// (c) useEnterExit
// ════════════════════════════════════════════════════════════════════

describe('useEnterExit', () => {
	// ── 'none' transition: instant skip ─────────────────────────────

	test('with \'none\' (single-frame) config, visible=true goes straight to \'visible\'', async () => {
		const config = getTransitionSteps('none');
		let snapshot: HookSnapshot | undefined;

		const {rerender, unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		await delay(100);

		expect(snapshot).toBeDefined();
		expect(snapshot!.stage).toBe('visible');

		unmount();
	});

	test('with \'none\' (single-frame) config, visible=false is \'exited\'', async () => {
		const config = getTransitionSteps('none');
		let snapshot: HookSnapshot | undefined;

		const {unmount} = render(
			<Harness
				visible={false}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		await delay(100);

		expect(snapshot).toBeDefined();
		expect(snapshot!.stage).toBe('exited');

		unmount();
	});

	// ── Multi-frame enter progression ───────────────────────────────

	test('with 3-frame enter, visible=true progresses entering→visible', async () => {
		const config: TransitionConfig = {
			enter: [
				{style: {marginTop: 4}},
				{style: {marginTop: 2}},
				{style: {marginTop: 0}},
			],
			exit: [{style: {}}],
			duration: 40,
		};

		let snapshot: HookSnapshot | undefined;

		const {unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		// Initially entering
		await delay(10);
		expect(snapshot!.stage).toBe('entering');

		// Wait for animation to complete: 3 frames × 40ms = 120ms + buffer
		await delay(200);
		expect(snapshot!.stage).toBe('visible');
		expect(snapshot!.currentStyle).toEqual({marginTop: 0});

		unmount();
	});

	// ── currentStyle matches the last enter frame when visible ──────

	test('currentStyle matches last enter frame style at visible stage', async () => {
		const config: TransitionConfig = {
			enter: [
				{style: {marginLeft: 10}},
				{style: {marginLeft: 5}},
				{style: {marginLeft: 0}},
			],
			exit: [{style: {}}],
			duration: 30,
		};

		let snapshot: HookSnapshot | undefined;

		const {unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		await delay(300);

		expect(snapshot!.stage).toBe('visible');
		expect(snapshot!.currentStyle).toEqual({marginLeft: 0});

		unmount();
	});

	// ── Enter then exit: entering→visible→exiting→exited ────────────

	test('set visible=false after entering triggers exiting→exited and calls onExited', async () => {
		const config: TransitionConfig = {
			enter: [
				{style: {marginTop: 4}},
				{style: {marginTop: 2}},
				{style: {marginTop: 0}},
			],
			exit: [
				{style: {marginTop: 0}},
				{style: {marginTop: 2}},
				{style: {marginTop: 4}},
			],
			duration: 30,
		};

		let snapshot: HookSnapshot | undefined;
		let exitedCalled = 0;

		const {rerender, unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
				onExited={() => {
					exitedCalled++;
				}}
			/>,
		);

		// Wait for enter to finish
		await delay(300);
		expect(snapshot!.stage).toBe('visible');

		// Toggle to false
		rerender(
			<Harness
				visible={false}
				config={config}
				onState={s => {
					snapshot = s;
				}}
				onExited={() => {
					exitedCalled++;
				}}
			/>,
		);

		await delay(10);
		expect(snapshot!.stage).toBe('exiting');

		// Wait for exit to finish
		await delay(300);
		expect(snapshot!.stage).toBe('exited');
		expect(exitedCalled).toBe(1);

		unmount();
	});

	// ── key changes on each transition restart ───────────────────────

	test('key changes when transition restarts', async () => {
		const config: TransitionConfig = {
			enter: [
				{style: {marginTop: 4}},
				{style: {marginTop: 2}},
				{style: {marginTop: 0}},
			],
			exit: [{style: {}}],
			duration: 30,
		};

		let snapshot: HookSnapshot | undefined;

		const {rerender, unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		await delay(300);
		const key1 = snapshot!.key;

		// Toggle false → true to restart
		rerender(
			<Harness
				visible={false}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);
		await delay(50);

		rerender(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);
		await delay(50);

		const key2 = snapshot!.key;
		expect(key2).not.toBe(key1);

		unmount();
	});

	// ── Missing enter/exit arrays handled gracefully ─────────────────

	test('handles missing enter/exit arrays (treats as single-frame)', async () => {
		const config: TransitionConfig = {
			// Enter and exit are undefined
			duration: 30,
		};

		let snapshot: HookSnapshot | undefined;

		const {unmount} = render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		await delay(100);

		// Should go straight to 'visible' since both enter and exit default to length 1
		expect(snapshot!.stage).toBe('visible');

		unmount();
	});
});
