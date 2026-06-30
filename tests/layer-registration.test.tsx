/**
 * Characterization tests for the <Layer> registration lifecycle effect.
 *
 * ## Why these tests exist
 *
 * The `<Layer>` component drives the overlay host through three host
 * methods — `registerLayer`, `updateLayer`, and `unregisterLayer` —
 * from a single lifecycle `useEffect`. That effect (the "god effect")
 * is being split into focused effects:
 *
 *  1. An **open/register effect** keyed on `isOpen` transitions, which
 *     registers on open and handles close (exit-transition vs.
 *     immediate unregister).
 *  2. A **props-update effect** keyed on the structural props
 *     (`z`, `capture`, `backdrop`, `anchor`, etc.), which calls
 *     `updateLayer` when the layer is already registered.
 *
 * These tests pin down the *observable host interactions* so that any
 * refactor preserves them exactly:
 *
 *  - A single registration per open transition (no duplicates, no
 *    premature `updateLayer` before the first `registerLayer`).
 *  - Structural prop changes on an open layer produce `updateLayer`
 *    (NOT a re-registration), carrying the expected patch keys.
 *  - Content-only changes are pushed via the content-sync effect with
 *    a `content`-only patch — they must NOT trigger a full lifecycle
 *    update.
 *  - Close (no exit transition) calls `unregisterLayer` immediately.
 *  - Close (with exit transition) calls `updateLayer` with
 *    `{exiting: true}` (no immediate unregister).
 *  - Re-opening after close re-registers.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import React, {type ReactNode, useMemo, useState} from 'react';
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {Layer} from '../src/layer.js';
import {OverlayHost} from '../src/host.js';
import {OverlayHostContext, useOverlayHost} from '../src/host-context.js';
import type {OverlayDescriptor} from '../src/types.js';
import {delay} from './helpers/delay.js';

// ── Spy infrastructure ─────────────────────────────────────────────

// Tracks the rendered instance so it is always torn down between tests.
let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

type CallRecord =
	| {kind: 'register'; id: string}
	| {kind: 'update'; id: string; keys: string[]}
	| {kind: 'unregister'; id: string};

/**
 * Wraps the real host context so every `registerLayer` / `updateLayer`
 * / `unregisterLayer` call is recorded into `calls.current`. The calls
 * are still forwarded to the real host so rendering behaves normally.
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
			unregisterLayer(id: string) {
				calls.current.push({kind: 'unregister', id});
				real.unregisterLayer(id);
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

/** Return only the records for a given layer id. */
function forId(calls: CallRecord[], id: string): CallRecord[] {
	return calls.filter(c => c.id === id);
}

// ── Test 1: opening a layer registers exactly once ─────────────────

test('opening a layer calls registerLayer exactly once and no full update precedes registration', async () => {
	const {calls, unmount} = renderSpied(
		<Layer anchor="center" id="reg-once" open>
			<Text>content</Text>
		</Layer>,
	);
	unmountInstance = unmount;

	await delay(200);

	const records = forId(calls.current, 'reg-once');

	// Exactly one registration.
	expect(records.filter(r => r.kind === 'register')).toHaveLength(1);

	// No full lifecycle update may appear *before* the registration, and
	// none should appear at all on a stable open — only the single
	// register call (plus the eventual unregister on unmount, which is
	// filtered out by the stable-open scenario below).
	const beforeRegister = records.slice(
		0,
		records.findIndex(r => r.kind === 'register'),
	);
	expect(beforeRegister).toHaveLength(0);
});

// ── Test 2: closing a layer without an exit transition unregisters immediately ─

test('closing a layer without an exit transition calls unregisterLayer immediately (no exiting patch)', async () => {
	let setOpen: (v: boolean) => void;

	function App() {
		const [open, set] = useState(true);
		setOpen = set;
		return (
			<Layer anchor="center" id="quick-close" open={open}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);
	calls.current = [];

	setOpen(false);
	await delay(200);

	const records = forId(calls.current, 'quick-close');

	// No exit transition → the layer is unregistered directly, with no
	// intermediate `{exiting: true}` update.
	expect(records.some(r => r.kind === 'unregister')).toBe(true);
	expect(
		records.some(r => r.kind === 'update' && r.keys.includes('exiting')),
	).toBe(false);
});

// ── Test 3: closing a layer with an exit transition sets exiting=true ─

test('closing a layer with a multi-frame exit transition calls updateLayer with exiting=true (no immediate unregister)', async () => {
	let setOpen: (v: boolean) => void;

	function App() {
		const [open, set] = useState(true);
		setOpen = set;
		return (
			<Layer anchor="center" id="exit-close" open={open} transition="slide-up">
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(300);
	calls.current = [];

	setOpen(false);
	await delay(100); // shortly after close, before animation completes

	const records = forId(calls.current, 'exit-close');

	// An exiting=true update must have fired.
	expect(
		records.some(r => r.kind === 'update' && r.keys.includes('exiting')),
	).toBe(true);

	// At this point (mid-animation) the layer should NOT yet be
	// unregistered by the Layer component — the renderer drives the
	// final unregister after the exit animation completes.
	expect(records.some(r => r.kind === 'unregister')).toBe(false);
});

// ── Test 4: re-opening a closed layer re-registers it ──────────────

test('re-opening a previously closed layer calls registerLayer again (controlled toggle)', async () => {
	let setOpen: (v: boolean) => void;

	function App() {
		const [open, set] = useState(true);
		setOpen = set;
		return (
			<Layer anchor="center" id="reopen" open={open}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);

	// Close then reopen.
	setOpen(false);
	await delay(200);
	setOpen(true);
	await delay(200);

	const registers = forId(calls.current, 'reopen').filter(
		r => r.kind === 'register',
	);

	// Two registrations: initial open + reopen.
	expect(registers).toHaveLength(2);
});

// ── Test 5: re-open after exit-transition close re-registers ───────

test('re-opening after an exit-transition close re-registers the layer', async () => {
	let setOpen: (v: boolean) => void;

	function App() {
		const [open, set] = useState(true);
		setOpen = set;
		return (
			<Layer anchor="center" id="reopen-exit" open={open} transition="slide-up">
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(300);

	// Close (exit animation), wait for completion, then reopen.
	setOpen(false);
	await delay(600);
	setOpen(true);
	await delay(300);

	const registers = forId(calls.current, 'reopen-exit').filter(
		r => r.kind === 'register',
	);

	expect(registers).toHaveLength(2);
});

// ── Test 6: structural prop change on an open layer fires updateLayer ─

test('changing z on an open layer fires updateLayer (not registerLayer)', async () => {
	let setZ: (v: number) => void;

	function App() {
		const [z, set] = useState(0);
		setZ = set;
		return (
			<Layer anchor="center" id="prop-z" z={z}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);

	calls.current = [];
	setZ(5);
	await delay(200);

	const records = forId(calls.current, 'prop-z');

	// An update carrying `z` must have fired.
	expect(records.some(r => r.kind === 'update' && r.keys.includes('z'))).toBe(
		true,
	);

	// No additional registration — the layer was already registered.
	expect(records.some(r => r.kind === 'register')).toBe(false);
});

// ── Test 7: structural update carries the full structural patch ────

test('structural prop change produces a full update patch with structural keys', async () => {
	let setBackdrop: (v: 'none' | 'opaque') => void;

	function App() {
		const [backdrop, set] = useState<'none' | 'opaque'>('none');
		setBackdrop = set;
		return (
			<Layer anchor="center" id="prop-backdrop" backdrop={backdrop}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);
	calls.current = [];

	setBackdrop('opaque');
	await delay(200);

	// The full lifecycle update should carry backdrop AND the other
	// structural keys (z, capture, anchor, transition, …).  We assert
	// the presence of a representative subset that the Layer always
	// includes in its update patch.
	const updates = forId(calls.current, 'prop-backdrop').filter(
		r => r.kind === 'update',
	);

	expect(updates.length).toBeGreaterThan(0);

	const fullUpdates = updates.filter(u =>
		(['z', 'capture', 'backdrop', 'anchor', 'transition'] as const).every(key =>
			u.keys.includes(key),
		),
	);
	expect(fullUpdates.length).toBeGreaterThan(0);
});

// ── Test 8: content-only change pushes content patch, not full update ─

test('changing only children fires a content-only update, not a full structural update', async () => {
	let setCount: (v: number) => void;

	function App() {
		const [count, set] = useState(0);
		setCount = set;
		return (
			<Layer anchor="center" id="content-only">
				<Text>count {count}</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);
	calls.current = [];

	setCount(7);
	await delay(200);

	const updates = forId(calls.current, 'content-only').filter(
		r => r.kind === 'update',
	);

	// At least one content patch.
	expect(updates.length).toBeGreaterThan(0);

	// The content-sync effect pushes ONLY `content`; no full structural
	// update (with z/anchor/etc.) should fire from a children-only change.
	const fullUpdates = updates.filter(u => u.keys.length > 1);
	expect(fullUpdates).toHaveLength(0);

	expect(updates.every(u => u.keys.includes('content'))).toBe(true);
});

// ── Test 9: parent re-render without prop changes does not update the host ─

test('parent re-renders with unchanged Layer props produce no registration and no full structural update', async () => {
	// NOTE: parent re-renders DO produce `content`-only updates via the
	// content-sync effect, because `<Text>content</Text>` is a new
	// element each render.  What must NOT happen is a full structural
	// update (carrying z/anchor/backdrop/…) or a re-registration.
	let triggerRerender: () => void;

	function App() {
		const [, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<Layer anchor="center" id="stable-render">
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);
	calls.current = [];

	for (let i = 0; i < 4; i++) {
		triggerRerender();
		await delay(50);
	}

	const records = forId(calls.current, 'stable-render');

	// No registration, no unregister.
	expect(records.some(r => r.kind === 'register')).toBe(false);
	expect(records.some(r => r.kind === 'unregister')).toBe(false);

	// Any updates must be content-only — never a full structural patch.
	const fullUpdates = records.filter(
		r => r.kind === 'update' && r.keys.length > 1,
	);
	expect(fullUpdates).toHaveLength(0);
});

// ── Test 10: unmounting an open layer calls unregisterLayer ─────────

test('unmounting an open layer calls unregisterLayer exactly once', async () => {
	const {calls, unmount} = renderSpied(
		<Layer anchor="center" id="unmount-open" open>
			<Text>content</Text>
		</Layer>,
	);

	await delay(200);

	calls.current = [];
	unmount();
	await delay(200);

	const unregisters = forId(calls.current, 'unmount-open').filter(
		r => r.kind === 'unregister',
	);

	expect(unregisters).toHaveLength(1);
});

// ── Test 11: StrictMode keeps the layer registered (recovery path) ──

test('under React.StrictMode the layer is registered exactly once in the final state', async () => {
	const {calls, lastFrame, unmount} = renderSpied(
		<React.StrictMode>
			<Layer anchor="center" id="strict-reg" open>
				<Text>strict</Text>
			</Layer>
		</React.StrictMode>,
	);
	unmountInstance = unmount;

	await delay(400);

	// Content is visible — the recovery path re-registered the layer.
	expect(lastFrame()).toContain('strict');

	// The final, settled registration count is 1. (StrictMode may
	// produce transient register/unregister pairs during the dev
	// double-invoke, but after settling exactly one registration must
	// remain effective — verified by the visible content above.  We
	// also assert that the number of net registrations minus
	// unregisters is exactly 1.)
	const registers = forId(calls.current, 'strict-reg').filter(
		r => r.kind === 'register',
	).length;
	const unregisters = forId(calls.current, 'strict-reg').filter(
		r => r.kind === 'unregister',
	).length;

	expect(registers - unregisters).toBe(1);
});

// ── Test 12: multiple sequential structural changes each update ─────

test('multiple sequential structural prop changes each produce an update', async () => {
	let setZ: (v: number) => void;

	function App() {
		const [z, set] = useState(0);
		setZ = set;
		return (
			<Layer anchor="center" id="multi-update" z={z}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(200);
	calls.current = [];

	setZ(1);
	await delay(100);
	setZ(2);
	await delay(100);
	setZ(3);
	await delay(100);

	const updates = forId(calls.current, 'multi-update').filter(
		r => r.kind === 'update' && r.keys.includes('z'),
	);

	// Each change should propagate an update.
	expect(updates.length).toBeGreaterThanOrEqual(3);
});
