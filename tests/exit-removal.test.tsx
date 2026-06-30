/**
 * Characterization tests for the layer-removal-after-exit path.
 *
 * When a `<Layer>` with a multi-frame exit transition is closed, the
 * exit animation plays first and ONLY THEN is the layer unregistered
 * from the host. That final unregistration is driven by the host-context
 * method `unregisterLayer` (provided by <OverlayHost> and invoked by
 * <LayerRenderer>'s `onExited` callback after the exit animation
 * completes).
 *
 * These tests pin down that observable behaviour end-to-end without
 * referencing the internal method name, and will FAIL if the wiring is
 * broken:
 *
 *  - If the host stops providing the function, the layer never gets
 *    removed after exit → content lingers → tests fail.
 *  - If LayerRenderer stops calling it, same outcome.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {test, expect, afterEach} from 'vitest';
import React, {useState} from 'react';
import {Text} from 'ink';
import {Layer} from '../src/layer.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Helpers ────────────────────────────────────────────────────────

// Tracks the rendered instance so it is always torn down between tests.
let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

function stripAnsi(input: string): string {
	// eslint-disable-next-line no-control-regex
	return input.replaceAll(/\u001B\[[\d;]*m/g, '');
}

/**
 * App whose open state is toggled externally via an exposed setter.
 */
function makeToggleApp({
	content,
	transition,
}: {
	content: string;
	transition?: 'slide-up' | 'fade' | 'none';
}) {
	let setOpen: (open: boolean) => void;

	function App() {
		const [open, setState] = useState(true);
		setOpen = setState;
		return (
			<>
				<Text>base</Text>
				<Layer open={open} anchor="center" transition={transition}>
					<Text>{content}</Text>
				</Layer>
			</>
		);
	}

	return {
		App,
		getSetOpen: () => setOpen!,
	};
}

// ── Tests ──────────────────────────────────────────────────────────

test('layer with exit transition is fully removed after the exit animation completes', async () => {
	const {App, getSetOpen} = makeToggleApp({
		content: 'removable',
		transition: 'slide-up',
	});

	const {lastFrame, unmount} = renderWithHost(<App />);
	unmountInstance = unmount;

	// Allow enter animation to settle.
	await delay(500);
	expect(stripAnsi(lastFrame())).toContain('removable');

	// Close — triggers exit animation (slide-up exit has 3 steps @80ms).
	getSetOpen()(false);

	// Mid-exit: content should still be visible.
	await delay(80);
	expect(stripAnsi(lastFrame())).toContain('removable');

	// Well after exit completes: content must be gone — the layer was
	// unregistered after the exit animation finished.
	await delay(500);
	expect(stripAnsi(lastFrame()).trim()).not.toContain('removable');
});

test('layer stays removed after exit (no lingering zombie frame)', async () => {
	const {App, getSetOpen} = makeToggleApp({
		content: 'zombie',
		transition: 'slide-up',
	});

	const {lastFrame, unmount} = renderWithHost(<App />);
	unmountInstance = unmount;

	await delay(500);
	expect(stripAnsi(lastFrame())).toContain('zombie');

	getSetOpen()(false);
	await delay(600);

	// Immediately after removal.
	expect(stripAnsi(lastFrame())).not.toContain('zombie');

	// Still gone after an additional render cycle — proves the removal
	// was permanent, not a transient frame.
	await delay(200);
	expect(stripAnsi(lastFrame())).not.toContain('zombie');
});

test('closing one layer with exit transition does not remove a sibling layer', async () => {
	let setA: (open: boolean) => void;
	let setB: (open: boolean) => void;

	function App() {
		const [openA, setOpenA] = useState(true);
		const [openB, setOpenB] = useState(true);
		setA = setOpenA;
		setB = setOpenB;
		return (
			<>
				<Text>base</Text>
				<Layer open={openA} anchor="top-left" transition="slide-up">
					<Text>ALPHA</Text>
				</Layer>
				<Layer open={openB} anchor="bottom-right" transition="slide-up">
					<Text>BETA</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame, unmount} = renderWithHost(<App />);
	unmountInstance = unmount;
	await delay(500);

	expect(stripAnsi(lastFrame())).toContain('ALPHA');
	expect(stripAnsi(lastFrame())).toContain('BETA');

	// Close only ALPHA — it animates out then is removed.
	setA!(false);
	await delay(600);

	// ALPHA removed after exit; BETA must remain untouched.
	expect(stripAnsi(lastFrame())).not.toContain('ALPHA');
	expect(stripAnsi(lastFrame())).toContain('BETA');

	// Now close BETA too.
	setB!(false);
	await delay(600);

	expect(stripAnsi(lastFrame())).not.toContain('ALPHA');
	expect(stripAnsi(lastFrame())).not.toContain('BETA');
	expect(stripAnsi(lastFrame())).toContain('base');
});

test('layer without exit transition is removed immediately on close', async () => {
	const {App, getSetOpen} = makeToggleApp({
		content: 'instant',
		transition: 'none',
	});

	const {lastFrame, unmount} = renderWithHost(<App />);
	unmountInstance = unmount;
	await delay(500);
	expect(stripAnsi(lastFrame())).toContain('instant');

	// No transition → removed synchronously via unregisterLayer,
	// without routing through the post-exit removal path.
	getSetOpen()(false);
	await delay(150);

	expect(stripAnsi(lastFrame())).not.toContain('instant');
});
