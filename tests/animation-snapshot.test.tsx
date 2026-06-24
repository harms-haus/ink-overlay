/**
 * Animation snapshot tests for <Layer> transitions.
 *
 * Verifies that enter/exit transitions produce multiple rendered frames
 * whose positions visibly change between the first and final frame, and
 * that the 'none' transition is a single-step no-op. Uses REAL timers —
 * ink's rendering loop only advances under real timers.
 *
 * frames[] accumulates every rendered frame; transitions step on a
 * ~80ms setInterval so we `await delay(500)` after each state change.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React, {useState} from 'react';
import {Text} from 'ink';
import {Layer} from '../src/layer.js';
import {
	renderWithHost,
	type RenderWithHostResult,
} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Controlled wrapper for enter → exit toggling ───────────────────

type ToggleAppProperties = {
	anchor?: Parameters<typeof Layer>[0]['anchor'];
	transition?: Parameters<typeof Layer>[0]['transition'];
};

/**
 * Wrapper whose `setOpen` is exposed via a ref so tests can flip
 * between enter and exit without re-creating the component tree.
 */
function ToggleApp({
	anchor = 'center',
	transition = 'slide-up',
}: ToggleAppProperties) {
	const [open, setOpen] = useState(true);
	// Attach the setter to the component instance for the test to call.
	React.useImperativeHandle(React.useRef({}), () => ({setOpen}));
	return (
		<Layer open={open} anchor={anchor} transition={transition}>
			<Text>animated</Text>
		</Layer>
	);
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes and trailing whitespace so that string
 * comparisons focus on content + layout, not color codes.
 */
function stripAnsi(input: string): string {
	// eslint-disable-next-line no-control-regex
	return input.replaceAll(/\u001B\[[\d;]*m/g, '');
}

/**
 * Return a compact signature of a frame: the trimmed lines that contain
 * the content, joined by '⏎'. This collapses leading/trailing blank
 * rows so position shifts (extra marginTop) show up as a different
 * number of leading blank lines.
 */
function frameSignature(frame: string): string {
	return stripAnsi(frame)
		.split('\n')
		.map(line => line.replace(/\s+$/u, ''))
		.join('⏎');
}

afterEach(async () => {
	// Let ink's render loop settle between tests.
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// (1) Enter animation: slide-up
// ════════════════════════════════════════════════════════════════════

describe('enter animation: slide-up', () => {
	test('produces multiple frames whose first/last positions differ', async () => {
		const {lastFrame, frames}: RenderWithHostResult = renderWithHost(
			<Layer anchor="center" transition="slide-up">
				<Text>animated</Text>
			</Layer>,
		);

		await delay(500);

		// Multiple frames should have been captured during the enter.
		expect(frames.length).toBeGreaterThanOrEqual(2);

		// The first frame (start of slide-up) should differ in layout
		// from the final resting frame.
		const first = frameSignature(frames[0]!);
		const last = frameSignature(frames.at(-1)!);
		expect(first).not.toBe(last);

		// Content is present at rest.
		expect(stripAnsi(lastFrame())).toContain('animated');

		// Snapshot the resting frame.
		expect(lastFrame()).toMatchInlineSnapshot(`
			"











			                                              animated










			"
		`);
	});
});

// ════════════════════════════════════════════════════════════════════
// (2) Exit animation: close after entering
// ════════════════════════════════════════════════════════════════════

describe('exit animation: slide-up', () => {
	test('slides away before the layer is removed', async () => {
		let setOpen: (open: boolean) => void;

		function App() {
			const [open, setState] = useState(true);
			setOpen = setState;
			return (
				<Layer open={open} anchor="center" transition="slide-up">
					<Text>animated</Text>
				</Layer>
			);
		}

		const {lastFrame, frames}: RenderWithHostResult = renderWithHost(<App />);

		// Allow the enter animation to complete.
		await delay(500);
		const framesAfterEnter = frames.length;
		expect(stripAnsi(lastFrame())).toContain('animated');

		// Trigger the exit.
		setOpen!(false);
		await delay(500);

		// The exit produced additional frames (the layer slid away).
		expect(frames.length).toBeGreaterThan(framesAfterEnter);

		// The layer is eventually removed: content is gone from the
		// final frame.
		expect(stripAnsi(lastFrame())).not.toContain('animated');
	});
});

// ════════════════════════════════════════════════════════════════════
// (3) transition="none"
// ════════════════════════════════════════════════════════════════════

describe('transition="none"', () => {
	test('produces few frames with no position change', async () => {
		const {lastFrame, frames}: RenderWithHostResult = renderWithHost(
			<Layer anchor="center" transition="none">
				<Text>animated</Text>
			</Layer>,
		);

		await delay(500);

		// 'none' should produce very few frames (content appears at its
		// final position immediately) — distinctly fewer than slide-up.
		expect(frames.length).toBeLessThanOrEqual(2);
		expect(frames.length).toBeGreaterThanOrEqual(1);

		// Content is at rest and visible.
		expect(stripAnsi(lastFrame())).toContain('animated');
	});

	test('produces fewer frames than slide-up', async () => {
		const noneResult: RenderWithHostResult = renderWithHost(
			<Layer anchor="center" transition="none">
				<Text>animated</Text>
			</Layer>,
		);
		const slideResult: RenderWithHostResult = renderWithHost(
			<Layer anchor="center" transition="slide-up">
				<Text>animated</Text>
			</Layer>,
		);

		await delay(500);

		// 'none' clearly has fewer frames than 'slide-up'.
		expect(noneResult.frames.length).toBeLessThan(slideResult.frames.length);

		noneResult.cleanup();
		slideResult.cleanup();
	});
});

// ════════════════════════════════════════════════════════════════════
// (4) fade transition
// ════════════════════════════════════════════════════════════════════

describe('fade transition', () => {
	test('produces multiple frames ending with content at full height', async () => {
		const {lastFrame, frames}: RenderWithHostResult = renderWithHost(
			<Layer anchor="center" transition="fade">
				<Text>animated</Text>
			</Layer>,
		);

		await delay(500);

		// Fade steps through several dim/height-grow frames.
		expect(frames.length).toBeGreaterThanOrEqual(2);

		// First and final frames differ (early frame is dim/shorter).
		const first = frameSignature(frames[0]!);
		const last = frameSignature(frames.at(-1)!);
		expect(first).not.toBe(last);

		// Final resting frame shows content at full visibility.
		expect(stripAnsi(lastFrame())).toContain('animated');

		// Snapshot the resting frame.
		expect(lastFrame()).toMatchInlineSnapshot(`
			"











			                                              animated










			"
		`);
	});
});
