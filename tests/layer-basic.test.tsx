/**
 * Tests for the <Layer> primitive and internal <LayerRenderer>.
 *
 * Covers: basic rendering, controlled/uncontrolled open, overflow clipping,
 * and capturing layer dismissal via Escape.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import React, {useState} from 'react';
import {test, expect, vi} from 'vitest';
import {Box, Text} from 'ink';
import {Layer} from '../src/layer.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Test 1: basic rendering ─────────────────────────────────────────

test('Layer renders overlay content over base content', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<Layer anchor="center">
				<Text>overlay</Text>
			</Layer>
		</>,
	);

	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('base');
	expect(frame).toContain('overlay');
});

// ── Test 2: controlled open={false} hides layer ─────────────────────

test('Layer with open={false} renders nothing; open={true} shows content', async () => {
	let triggerOpen: () => void;

	function App() {
		const [open, setOpen] = useState(false);
		triggerOpen = () => {
			setOpen(true);
		};

		return (
			<>
				<Text>base</Text>
				<Layer open={open}>
					<Text>hidden</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame} = renderWithHost(<App />);

	await delay(200);

	// Initially hidden — "hidden" should NOT appear in the frame.
	expect(lastFrame()).not.toContain('hidden');
	expect(lastFrame()).toContain('base');

	// Now open the layer via internal state.
	triggerOpen();

	await delay(200);

	// Now "hidden" should appear.
	expect(lastFrame()).toContain('hidden');
	expect(lastFrame()).toContain('base');
});

// ── Test 3: overflow="hidden" clips content ─────────────────────────

test('Layer with overflow="hidden" clips content exceeding box width', async () => {
	// Render a Layer with a constrained-width inner Box (5 cols)
	// containing text far wider than 5 chars. With overflow='hidden',
	// only the first 5 characters should be visible.
	// Uses anchor="top-left" so the content is positioned at a known
	// location where ink's clipping is effective.
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<Layer anchor="top-left" overflow="hidden" id="clip-test">
				<Box width={5} height={1} flexDirection="row">
					<Text>ABCDEFGHIJKLMNOPQRSTUVWXYZ</Text>
				</Box>
			</Layer>
		</>,
	);

	await delay(200);

	const frame = lastFrame();
	// The visible portion (first 5 chars) should appear.
	expect(frame).toContain('ABCDE');
	// The overflowed tail must NOT appear — proves clipping.
	expect(frame).not.toContain('FGHIJ');
	expect(frame).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

// ── Test 4: capturing layer dismisses on Escape ─────────────────────

test('Capturing Layer calls onDismiss on Escape', async () => {
	const onDismiss = vi.fn();

	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<Layer open={true} capture onDismiss={onDismiss}>
				<Text>dialog</Text>
			</Layer>
		</>,
	);

	await delay(200);

	expect(lastFrame()).toContain('dialog');

	// Send Escape character.
	stdin.write('\u001B');
	await delay(200);

	expect(onDismiss).toHaveBeenCalled();
});

// ── Test 5: margin actually offsets content ────────────────────────

test('Layer with marginLeft shifts content right vs. no margin', async () => {
	// Render a layer with marginLeft and verify the content is shifted
	// rightward by comparing column positions in the frame.
	// We test marginLeft rather than marginTop because ink's Yoga
	// layout engine has a rendering limitation with marginTop in
	// absolutely-positioned flexbox containers.
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<Layer anchor="top-left" id="with-margin" margin={{left: 5}}>
				<Text>MARGINED</Text>
			</Layer>
		</>,
	);

	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('MARGINED');

	// The margin prop is applied via marginTop/marginLeft/etc. on the
	// content Box. marginLeft shifts the content rightward from the
	// left edge. Verify 'MARGINED' doesn't start at column 0.
	const lines = frame.split('\n');
	let marginLine = -1;

	for (const [i, line_] of lines.entries()) {
		if (line_.includes('MARGINED') && marginLine === -1) {
			marginLine = i;
		}
	}

	expect(marginLine).toBeGreaterThanOrEqual(0);

	// The content must NOT start at column 0 — marginLeft=5 should
	// push it rightward. The line should have leading spaces.
	const line = lines[marginLine]!;
	const contentIndex = line.indexOf('MARGINED');
	expect(contentIndex).toBeGreaterThan(0);
});

// ── Test 6: React StrictMode re-mount keeps layer registered ─────

test('Layer re-registers after React StrictMode unmount-remount cycle', async () => {
	// React.StrictMode double-invokes effects in dev mode: mount → cleanup → mount.
	// Without the re-register guard, the cleanup clears registeredRef and
	// the second mount's effect skips registration (wasOpen=true, registered=false).
	// The fix adds an else branch that re-registers in this case.
	const {lastFrame} = renderWithHost(
		<React.StrictMode>
			<Text>base</Text>
			<Layer anchor="center" open={true} id="strict-test">
				<Text>strict-content</Text>
			</Layer>
		</React.StrictMode>,
	);

	// StrictMode may need extra time for the double-effect cycle.
	await delay(400);

	const frame = lastFrame();
	expect(frame).toContain('base');
	expect(frame).toContain('strict-content');
});

// ── Test 7: exit transition fires before layer disappears ──────────

test('Layer with exit transition remains visible during exit phase', async () => {
	let setOpen: (v: boolean) => void;

	function App() {
		const [open, setOpen_] = useState(true);
		setOpen = setOpen_;
		return (
			<>
				<Text>base</Text>
				<Layer open={open} anchor="center" transition="slide-up">
					<Text>fading</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame} = renderWithHost(<App />);

	await delay(200);
	expect(lastFrame()).toContain('fading');

	// Close the layer — slide-up exit has 3 frames at 80ms each (~240ms total).
	setOpen(false);

	// Mid-exit: content should still be visible.
	await delay(100);
	expect(lastFrame()).toContain('fading');

	// Post-exit: content should be gone.
	await delay(400);
	expect(lastFrame()).not.toContain('fading');
});

// ── Test 8: backdrop is rendered when backdrop != 'none' ───────────

test('Layer with backdrop="opaque" renders a background block', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<Layer anchor="center" backdrop="opaque">
				<Text>overlay</Text>
			</Layer>
		</>,
	);

	await delay(200);

	const frame = lastFrame();
	// The overlay content should be visible.
	expect(frame).toContain('overlay');
	// When backdrop='opaque', the renderer paints a solid background.
	// In a terminal, this means the backdrop covers the base text.
	// Verify that 'base' is NOT visible (the opaque backdrop hides it).
	expect(frame).not.toContain('base');
});
