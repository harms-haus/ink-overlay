/**
 * Probe test: verify that parent re-renders WITHOUT changing Layer
 * structural props do NOT cause extra OverlayHost render cycles via
 * the Layer registration effect.
 *
 * The fix removes `children` from the Layer effect's dependency array
 * so that child identity churn (new React element refs on every parent
 * render) does not trigger host.updateLayer() + bumpVersion().
 */
import {useState} from 'react';
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {Layer} from '../src/layer.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// Tracks the rendered instance so it is always torn down between tests.
let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

// ── Test 1: N parent re-renders do not cause extra effect work ──────

test('parent re-renders without changing Layer props do not cause extra effect cycles', async () => {
	let triggerRerender: () => void;
	const RERENDER_COUNT = 5;

	function Parent() {
		const [, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<>
				<Text>base</Text>
				<Layer anchor="center" id="stable-layer">
					<Text>static content</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame, unmount} = renderWithHost(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	// Layer should be visible.
	expect(lastFrame()).toContain('static content');
	expect(lastFrame()).toContain('base');

	// Trigger N re-renders — none of which change any Layer prop.
	for (let i = 0; i < RERENDER_COUNT; i++) {
		triggerRerender();
		await delay(50);
	}

	await delay(200);

	// Content is still visible and correct — no errors, no stale rendering.
	const frame = lastFrame();
	expect(frame).toContain('static content');
	expect(frame).toContain('base');
});

// ── Test 2: structural prop changes DO still update the layer ──────

test('changing a structural prop (z) on an open Layer still works', async () => {
	let triggerRerender: () => void;

	function Parent() {
		const [z, setZ] = useState(0);
		triggerRerender = () => {
			setZ(1);
		};

		return (
			<>
				<Text>base</Text>
				<Layer anchor="center" id="z-change-layer" z={z}>
					<Text>z-content</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame, unmount} = renderWithHost(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	expect(lastFrame()).toContain('z-content');

	// Change a structural prop.
	triggerRerender();
	await delay(200);

	// Content is still visible after structural update.
	expect(lastFrame()).toContain('z-content');
	expect(lastFrame()).toContain('base');
});

// ── Test 3: Layer content renders correctly and parent state updates ─

test('parent state updates alongside Layer are reflected in the frame', async () => {
	let triggerRerender: () => void;

	function Parent() {
		const [tick, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<>
				<Text>base</Text>
				<Layer anchor="center" id="content-probe">
					<Text>overlay</Text>
				</Layer>
				<Text>tick:{tick}</Text>
			</>
		);
	}

	const {lastFrame, unmount} = renderWithHost(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('base');
	expect(frame).toContain('overlay');
	expect(frame).toContain('tick:0');

	// Trigger several re-renders of the parent.
	for (let i = 0; i < 3; i++) {
		triggerRerender();
		await delay(50);
	}

	await delay(200);

	// The frame should show the updated tick count.
	const finalFrame = lastFrame();
	expect(finalFrame).toContain('tick:3');
	expect(finalFrame).toContain('base');
	expect(finalFrame).toContain('overlay');
});

// ── Test 4: dynamic Layer children re-render after parent state change ─

test('Layer children update when parent state changes the children identity', async () => {
	let setCount: (n: number) => void;

	function Parent() {
		const [count, setCount_] = useState(0);
		setCount = setCount_;

		return (
			<>
				<Text>base</Text>
				<Layer anchor="center" id="dynamic-content">
					<Text>count is {count}</Text>
				</Layer>
			</>
		);
	}

	const {lastFrame, unmount} = renderWithHost(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	expect(lastFrame()).toContain('count is 0');

	// Change the count — this changes children identity but not structural
	// props.  The layer content must reflect the new value.
	setCount(42);
	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('base');
	expect(frame).toContain('count is 42');
});
