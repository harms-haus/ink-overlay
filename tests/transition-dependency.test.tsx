/**
 * Characterization tests for the `transition` prop dependency behaviour
 * inside <Layer>'s lifecycle effect.
 *
 * Background
 * ----------
 * The Layer lifecycle `useEffect` pushes a full descriptor update
 * (containing `transition`) to the host whenever its dependency array
 * changes.  The component pre-computes `resolvedTransition` via
 *
 *   useMemo(() => resolveTransition(transition), [transition])
 *
 * and the lifecycle effect should depend on the *resolved* value so
 * that reference churn on the raw prop does not cause spurious full
 * updates.
 *
 * These tests pin down the *observable* host interaction (register /
 * update calls) for several `transition` shapes:
 *
 *  - string name          → stable, no full updates on parent re-render
 *  - hoisted stable object → stable, no full updates on parent re-render
 *  - inline object literal → documented current behaviour
 *  - value actually changes → full update propagates the new transition
 *
 * They wrap the real <OverlayHost> context with a spy that records the
 * patch keys of every `updateLayer` call so we can distinguish a full
 * lifecycle update (contains `transition`) from a content-only sync.
 */
import React, {useMemo, useState, type ReactNode} from 'react';
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {Layer} from '../src/layer.js';
import {OverlayHost} from '../src/host.js';
import {
	OverlayHostContext,
	useOverlayHost,
} from '../src/host-context.js';
import type {OverlayDescriptor} from '../src/types.js';
import {delay} from './helpers/delay.js';

// ── Spy infrastructure ─────────────────────────────────────────────

// Tracks the rendered instance so it is always torn down between tests.
let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

type CallRecord = {kind: 'register'; id: string} | {
	kind: 'update';
	id: string;
	keys: string[];
};

/**
 * Wraps the real host context so every `registerLayer` / `updateLayer`
 * call is recorded into `calls.current`.  The calls are still forwarded
 * to the real host so rendering behaves normally.
 */
function SpiedHost({
	children,
	calls,
}: {
	children: ReactNode;
	calls: React.MutableRefObject<CallRecord[]>;
}) {
	const real = useOverlayHost();
	const value = useMemo(
		() => ({
			...real,
			registerLayer(descriptor: Omit<OverlayDescriptor, 'order'>) {
				calls.current.push({kind: 'register', id: descriptor.id});
				real.registerLayer(descriptor);
			},
			updateLayer(id: string, patch: Partial<OverlayDescriptor>) {
				calls.current.push({
					kind: 'update',
					id,
					keys: Object.keys(patch).sort(),
				});
				real.updateLayer(id, patch);
			},
		}),
		[real, calls],
	);

	return (
		<OverlayHostContext.Provider value={value}>
			{children}
		</OverlayHostContext.Provider>
	);
}

function renderSpied(tree: ReactNode) {
	const calls: {current: CallRecord[]} = {current: []};
	const result = render(
		<OverlayHost>
			<SpiedHost calls={calls}>{tree}</SpiedHost>
		</OverlayHost>,
	);
	return {...result, calls};
}

/** Count lifecycle (full) updates that carry a `transition` patch. */
function countTransitionUpdates(calls: CallRecord[], id: string): number {
	return calls.filter(
		c => c.kind === 'update' && c.id === id && c.keys.includes('transition'),
	).length;
}

// ── Test 1: string transition is stable across parent re-renders ───

test('string transition prop does not trigger full updates on parent re-render', async () => {
	let triggerRerender: () => void;

	function Parent() {
		const [, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<Layer anchor="center" id="str-transition" transition="slide-up">
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, lastFrame, unmount} = renderSpied(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	// After mount: exactly one registration, no full update yet.
	expect(calls.current.filter(c => c.kind === 'register')).toHaveLength(1);
	expect(countTransitionUpdates(calls.current, 'str-transition')).toBe(0);

	// Clear and trigger several parent re-renders that do NOT change the
	// transition prop.
	calls.current = [];
	for (let i = 0; i < 4; i++) {
		triggerRerender();
		await delay(50);
	}

	// No full lifecycle update should fire — the string transition is a
	// stable primitive and resolveTransition caches it to a stable ref.
	expect(countTransitionUpdates(calls.current, 'str-transition')).toBe(0);

	// Content remains visible.
	expect(lastFrame()).toContain('content');
});

// ── Test 2: hoisted stable object transition is stable ─────────────

const STABLE_OBJECT_TRANSITION = {
	enter: [{style: {marginTop: 4}}, {style: {marginTop: 0}}],
	exit: [{style: {marginTop: 0}}, {style: {marginTop: 4}}],
	duration: 80,
};

test('stable (hoisted) object transition does not trigger full updates on parent re-render', async () => {
	let triggerRerender: () => void;

	function Parent() {
		const [, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<Layer
				anchor="center"
				id="stable-obj-transition"
				transition={STABLE_OBJECT_TRANSITION}
			>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, lastFrame, unmount} = renderSpied(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	expect(calls.current.filter(c => c.kind === 'register')).toHaveLength(1);

	calls.current = [];
	for (let i = 0; i < 4; i++) {
		triggerRerender();
		await delay(50);
	}

	// Because the object reference is stable (hoisted out of render),
	// neither `transition` nor `resolvedTransition` changes identity, so
	// no full lifecycle update should fire.
	expect(countTransitionUpdates(calls.current, 'stable-obj-transition')).toBe(0);
	expect(lastFrame()).toContain('content');
});

// ── Test 3: inline object transition still functions correctly ────

test('inline object transition renders content and drives an animation', async () => {
	const {lastFrame, frames, unmount} = renderSpied(
		<Layer
			anchor="center"
			id="inline-obj-transition"
			transition={{
				enter: [{style: {marginTop: 4}}, {style: {marginTop: 0}}],
				exit: [{style: {marginTop: 0}}, {style: {marginTop: 4}}],
				duration: 80,
			}}
		>
			<Text>animated-inline</Text>
		</Layer>,
	);
	unmountInstance = unmount;

	await delay(500);

	// Content is visible at rest.
	expect(lastFrame()).toContain('animated-inline');

	// The inline enter config has 2 frames, so the animation produces
	// multiple rendered frames.
	expect(frames.length).toBeGreaterThanOrEqual(2);
});

// ── Test 4: changing the transition value propagates a full update ─

test('changing the transition value triggers a full update with the new transition', async () => {
	let setTransitionName: (v: 'none' | 'slide-up') => void;

	function Parent() {
		const [name, setName] = useState<'none' | 'slide-up'>('none');
		setTransitionName = setName;
		return (
			<Layer anchor="center" id="change-transition" transition={name}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, lastFrame, unmount} = renderSpied(<Parent />);
	unmountInstance = unmount;

	await delay(200);

	// Initially registered with no full update.
	expect(countTransitionUpdates(calls.current, 'change-transition')).toBe(0);

	// Switch to a different transition.
	calls.current = [];
	setTransitionName('slide-up');
	await delay(200);

	// A full lifecycle update carrying the new transition MUST fire —
	// the dependency is not over-removed.
	expect(countTransitionUpdates(calls.current, 'change-transition')).toBe(1);
	expect(lastFrame()).toContain('content');
});
