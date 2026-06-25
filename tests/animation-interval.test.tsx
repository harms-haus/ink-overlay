/**
 * Characterization tests for the `useEnterExit` frame-stepper interval.
 *
 * These tests pin down the *observable* behavior of the interval that
 * advances animation frames, so that the refactor — which moves
 * `clearInterval(id)` OUT of the state updater to fix a purity violation
 * and to stop wasted interval ticks — is provably behavior-preserving.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import {useEnterExit} from '../src/animation.js';
import type {TransitionConfig} from '../src/types.js';
import {delay} from './helpers/delay.js';

// ── Helpers ────────────────────────────────────────────────────────

type HookSnapshot = {
	stage: string;
	currentStyle: Record<string, number | string>;
	transitionKey: string;
};

/**
 * Test harness that drives `useEnterExit` and appends every render's
 * state snapshot to a shared `history` array passed in via props.
 *
 * Capturing during render (rather than via effect) means the array holds
 * the exact sequence of states the hook produced, in order, including
 * every intermediate frame.
 */
function HistoryHarness({
	visible,
	config,
	history,
	onExited,
}: {
	visible: boolean;
	config: TransitionConfig;
	history: HookSnapshot[];
	onExited?: () => void;
}) {
	const result = useEnterExit(visible, config, {onExited});
	// Record synchronously during render.
	history.push({
		stage: result.stage,
		currentStyle: {...result.currentStyle},
		transitionKey: result.transitionKey,
	});
	return <Text>content</Text>;
}

/** A 3-frame enter config with distinct, ordered styles and a fast interval. */
const THREE_FRAME_ENTER: TransitionConfig = {
	enter: [
		{style: {marginTop: 4}},
		{style: {marginTop: 2}},
		{style: {marginTop: 0}},
	],
	exit: [{style: {}}],
	duration: 25,
};

/** A 3-frame exit config with distinct, ordered styles. */
const THREE_FRAME_EXIT: TransitionConfig = {
	enter: [{style: {}}],
	exit: [
		{style: {marginTop: 0}},
		{style: {marginTop: 2}},
		{style: {marginTop: 4}},
	],
	duration: 25,
};

afterEach(async () => {
	// Let ink's render loop settle between tests.
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// (1) Enter frame-by-frame progression
// ════════════════════════════════════════════════════════════════════

describe('useEnterExit interval — enter progression', () => {
	test('steps through every enter frame style in order, then reaches visible', async () => {
		const history: HookSnapshot[] = [];

		const {unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_ENTER}
				history={history}
			/>,
		);

		// 3 frames × 25ms = 75ms + buffer for effect-driven stage change.
		await delay(250);

		// The sequence of styles observed during the 'entering' stage must
		// be exactly the three enter-frame styles, in order.
		const enteringStyles = history
			.filter(s => s.stage === 'entering')
			.map(s => s.currentStyle.marginTop);

		// Must contain the full ordered sequence 4 → 2 → 0.
		expect(enteringStyles).toContain(4);
		expect(enteringStyles).toContain(2);
		expect(enteringStyles).toContain(0);

		// The styles must appear in strictly decreasing order (frame 0 first).
		const indexOf4 = enteringStyles.indexOf(4);
		const indexOf2 = enteringStyles.indexOf(2);
		const indexOf0 = enteringStyles.indexOf(0);
		expect(indexOf4).toBeLessThan(indexOf2);
		expect(indexOf2).toBeLessThan(indexOf0);

		// Final state: visible, holding the last enter frame's style.
		const last = history.at(-1)!;
		expect(last.stage).toBe('visible');
		expect(last.currentStyle).toEqual({marginTop: 0});

		unmount();
	});

	test('the first render is already entering (frame 0), never skips it', async () => {
		const history: HookSnapshot[] = [];

		const {unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_ENTER}
				history={history}
			/>,
		);

		await delay(15);

		// The very first recorded snapshot must be the entering stage at
		// frame 0 — the interval has not yet advanced.
		expect(history[0]!.stage).toBe('entering');
		expect(history[0]!.currentStyle).toEqual({marginTop: 4});

		unmount();
	});

	test('frame value never overshoots beyond the last enter frame', async () => {
		const history: HookSnapshot[] = [];

		const {unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_ENTER}
				history={history}
			/>,
		);

		await delay(250);

		// During entering, the style must always be one of the defined
		// enter-frame styles — the frame index must never exceed the last
		// valid index (no out-of-bounds access, no undefined style).
		for (const snapshot of history.filter(s => s.stage === 'entering')) {
			const top = snapshot.currentStyle.marginTop;
			expect([4, 2, 0]).toContain(top);
		}

		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// (2) Exit frame-by-frame progression
// ════════════════════════════════════════════════════════════════════

describe('useEnterExit interval — exit progression', () => {
	test('steps through every exit frame style in order, then reaches exited', async () => {
		const history: HookSnapshot[] = [];
		let exitedCount = 0;

		const {rerender, unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_EXIT}
				history={history}
				onExited={() => {
					exitedCount++;
				}}
			/>,
		);

		// Enter immediately (single-frame enter → visible).
		await delay(50);
		expect(history.at(-1)!.stage).toBe('visible');

		// Reset history so we observe only the exit sequence cleanly.
		const enterCount = history.length;
		history.length = 0;

		// Trigger exit.
		rerender(
			<HistoryHarness
				visible={false}
				config={THREE_FRAME_EXIT}
				history={history}
				onExited={() => {
					exitedCount++;
				}}
			/>,
		);

		await delay(250);

		// The 'exiting' styles must be the three exit-frame styles, in order.
		const exitingStyles = history
			.filter(s => s.stage === 'exiting')
			.map(s => s.currentStyle.marginTop);

		expect(exitingStyles).toContain(0);
		expect(exitingStyles).toContain(2);
		expect(exitingStyles).toContain(4);

		// Strictly increasing order (frame 0 first).
		const indexOf0 = exitingStyles.indexOf(0);
		const indexOf2 = exitingStyles.indexOf(2);
		const indexOf4 = exitingStyles.indexOf(4);
		expect(indexOf0).toBeLessThan(indexOf2);
		expect(indexOf2).toBeLessThan(indexOf4);

		// Final state: exited, empty style.
		const last = history.at(-1)!;
		expect(last.stage).toBe('exited');
		expect(last.currentStyle).toEqual({});

		// The onExited callback is called exactly once for the exit.
		expect(exitedCount).toBe(1);

		// Sanity: enter history was non-zero (proves we reset, not empty app).
		expect(enterCount).toBeGreaterThan(0);

		unmount();
	});

	test('frame value never overshoots beyond the last exit frame', async () => {
		const history: HookSnapshot[] = [];

		const {rerender, unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_EXIT}
				history={history}
			/>,
		);

		await delay(50);
		history.length = 0;

		rerender(
			<HistoryHarness
				visible={false}
				config={THREE_FRAME_EXIT}
				history={history}
			/>,
		);

		await delay(250);

		for (const snapshot of history.filter(s => s.stage === 'exiting')) {
			const top = snapshot.currentStyle.marginTop;
			expect([0, 2, 4]).toContain(top);
		}

		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// (3) Stability after completion — interval stops, no spurious renders
// ════════════════════════════════════════════════════════════════════

describe('useEnterExit interval — stops ticking after completion', () => {
	test('after enter completes, no further renders occur (stage stays visible)', async () => {
		const history: HookSnapshot[] = [];

		const {unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_ENTER}
				history={history}
			/>,
		);

		// Let the enter animation finish.
		await delay(250);
		const lengthAtCompletion = history.length;
		const snapshotAtCompletion = {...history.at(-1)!};

		expect(snapshotAtCompletion.stage).toBe('visible');

		// Wait well past the interval duration — the frame-stepper must
		// have stopped, so no additional renders should be produced.
		await delay(200);
		expect(history.length).toBe(lengthAtCompletion);

		// State unchanged.
		expect(history.at(-1)!.stage).toBe('visible');
		expect(history.at(-1)!.currentStyle).toEqual(
			snapshotAtCompletion.currentStyle,
		);

		unmount();
	});

	test('after exit completes, no further renders occur (stage stays exited)', async () => {
		const history: HookSnapshot[] = [];

		const {rerender, unmount} = render(
			<HistoryHarness
				visible={true}
				config={THREE_FRAME_EXIT}
				history={history}
			/>,
		);

		await delay(50);

		rerender(
			<HistoryHarness
				visible={false}
				config={THREE_FRAME_EXIT}
				history={history}
			/>,
		);

		// Let the exit animation finish.
		await delay(250);
		const lengthAtCompletion = history.length;

		expect(history.at(-1)!.stage).toBe('exited');

		// No more renders after completion.
		await delay(200);
		expect(history.length).toBe(lengthAtCompletion);
		expect(history.at(-1)!.stage).toBe('exited');

		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// (4) Interval lifecycle — cleared exactly when last frame reached,
//     no wasted ticks beyond the boundary.
//
// ink / ink-testing-library do NOT use setInterval, so every
// setInterval/clearInterval call during these tests originates from the
// hook's frame-stepper effect. We spy on the globals to verify the
// interval fires no more than `frames.length` times and is cleared.
// ════════════════════════════════════════════════════════════════════

describe('useEnterExit interval — lifecycle (setInterval spy)', () => {
	test('frame-stepper interval is cleared and fires at most frames.length times', async () => {
		// Track every interval: id → {delay, fireCount, cleared}.
		const trackers = new Map<
			ReturnType<typeof setInterval>,
			{delay: number; fireCount: number; cleared: boolean}
		>();

		const originalSetInterval = globalThis.setInterval;
		const originalClearInterval = globalThis.clearInterval;

		globalThis.setInterval = ((
			callback: (...args: unknown[]) => void,
			delay?: number,
			...args: unknown[]
		) => {
			const id = originalSetInterval(
				(...a: unknown[]) => {
					const tracker = trackers.get(id);
					if (tracker) {
						tracker.fireCount++;
					}

					callback(...a);
				},
				delay,
				...args,
			);
			trackers.set(id, {delay: delay ?? 0, fireCount: 0, cleared: false});
			return id;
		}) as typeof setInterval;

		globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
			const tracker = trackers.get(id);
			if (tracker) {
				tracker.cleared = true;
			}

			originalClearInterval(id);
		}) as typeof clearInterval;

		const frameCount = THREE_FRAME_ENTER.enter!.length;

		try {
			const history: HookSnapshot[] = [];

			const {unmount} = render(
				<HistoryHarness
					visible={true}
					config={THREE_FRAME_ENTER}
					history={history}
				/>,
			);

			// Wait long enough for the enter animation to complete AND for any
			// potential wasted ticks to have fired (many interval periods).
			await delay(400);

			expect(history.at(-1)!.stage).toBe('visible');

			// Find our frame-stepper interval: the one created with our
			// configured duration (25ms).
			const stepper = [...trackers.values()].find(
				t => t.delay === THREE_FRAME_ENTER.duration,
			);

			expect(stepper).toBeDefined();
			// The interval must have been cleared.
			expect(stepper!.cleared).toBe(true);
			// It must have fired exactly frameCount times: (frameCount - 1)
			// successful advances plus one boundary tick that clears it.
			// No wasted ticks beyond the boundary.
			expect(stepper!.fireCount).toBeLessThanOrEqual(frameCount);
			expect(stepper!.fireCount).toBeGreaterThanOrEqual(frameCount - 1);

			unmount();
		} finally {
			globalThis.setInterval = originalSetInterval;
			globalThis.clearInterval = originalClearInterval;
		}
	});

	test('across a full enter→exit cycle, every stepper interval is cleared with bounded ticks', async () => {
		// Track every interval: delay → list of {fireCount, cleared}.
		const trackers = new Map<
			ReturnType<typeof setInterval>,
			{delay: number; fireCount: number; cleared: boolean}
		>();

		const originalSetInterval = globalThis.setInterval;
		const originalClearInterval = globalThis.clearInterval;

		globalThis.setInterval = ((
			callback: (...args: unknown[]) => void,
			delay?: number,
			...args: unknown[]
		) => {
			const id = originalSetInterval(
				(...a: unknown[]) => {
					const tracker = trackers.get(id);
					if (tracker) {
						tracker.fireCount++;
					}

					callback(...a);
				},
				delay,
				...args,
			);
			trackers.set(id, {delay: delay ?? 0, fireCount: 0, cleared: false});
			return id;
		}) as typeof setInterval;

		globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
			const tracker = trackers.get(id);
			if (tracker) {
				tracker.cleared = true;
			}

			originalClearInterval(id);
		}) as typeof clearInterval;

		// A config where BOTH enter and exit are multi-frame.
		const bothMulti: TransitionConfig = {
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
			duration: 25,
		};

		const frameCount = bothMulti.enter!.length;

		try {
			const history: HookSnapshot[] = [];
			let exitedCount = 0;

			const {rerender, unmount} = render(
				<HistoryHarness
					visible={true}
					config={bothMulti}
					history={history}
					onExited={() => {
						exitedCount++;
					}}
				/>,
			);

			// Enter.
			await delay(250);
			expect(history.at(-1)!.stage).toBe('visible');

			// Exit.
			rerender(
				<HistoryHarness
					visible={false}
					config={bothMulti}
					history={history}
					onExited={() => {
						exitedCount++;
					}}
				/>,
			);
			await delay(250);
			expect(history.at(-1)!.stage).toBe('exited');
			expect(exitedCount).toBe(1);

			// Wait extra to allow any leaked ticks to fire.
			await delay(150);

			// Every interval we created must be cleared (no leaks).
			for (const tracker of trackers.values()) {
				expect(tracker.cleared).toBe(true);
			}

			// Each stepper interval (created at our duration) must have fired
			// no more than frameCount times — the boundary tick clears it, so
			// there must be no wasted ticks beyond the last frame.
			const steppers = [...trackers.values()].filter(
				t => t.delay === bothMulti.duration,
			);
			expect(steppers.length).toBeGreaterThanOrEqual(2);
			for (const stepper of steppers) {
				expect(stepper.fireCount).toBeLessThanOrEqual(frameCount);
			}

			unmount();

			// After unmount, still every interval is cleared.
			for (const tracker of trackers.values()) {
				expect(tracker.cleared).toBe(true);
			}
		} finally {
			globalThis.setInterval = originalSetInterval;
			globalThis.clearInterval = originalClearInterval;
		}
	});
});
