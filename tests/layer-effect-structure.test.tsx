/**
 * Characterization tests for the three-effect lifecycle structure of
 * `<Layer>`, as documented in docs/concepts/architecture.md.
 *
 * ## What these tests pin down
 *
 * The `<Layer>` component splits its lifecycle across THREE distinct
 * effects (see architecture.md "There is one subtlety worth noting"):
 *
 *  1. **Open/close transition effect** — keyed on `[isOpen]` only.
 *     Registers on a false→true edge, tears down on a true→false edge,
 *     and re-registers under React.StrictMode's dev unmount-remount.
 *  2. **Structural props-update effect** — keyed on the structural
 *     props (z, capture, backdrop, anchor, etc.). Pushes
 *     shallow-merged patches via `updateLayer` whenever those props
 *     change. **Skips its initial run** because the open/close effect
 *     already pushes the full descriptor on first open.
 *  3. **Content-sync effect** — no dependency array (runs after every
 *     render). Compares the current children ref against a previously-
 *     synced snapshot; if they differ, pushes a `{content}`-only patch.
 *
 * The tests here focus on the EDGE CASES and BOUNDARIES of this
 * three-effect split — specifically the ones not already covered by
 * `layer-registration.test.tsx`:
 *
 *  - The props-update effect skips its initial run (no duplicate
 *    `updateLayer` immediately after `registerLayer`).
 *  - Structural prop changes on a CLOSED layer produce no `updateLayer`.
 *  - The content-sync effect is a no-op when content identity is
 *    unchanged across re-renders.
 *  - A combined structural + content change fires a STRUCTURAL update
 *    (carrying content), not a content-only patch.
 *  - The open/close effect does NOT re-run when only structural props
 *    change (isOpen is isolated from the structural effect).
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import React, {
	type ReactNode,
	useMemo,
	useState,
} from 'react';
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

let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

type CallRecord =
	| {kind: 'register'; id: string}
	| {kind: 'update'; id: string; keys: string[]}
	| {kind: 'unregister'; id: string};

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

function forId(calls: CallRecord[], id: string): CallRecord[] {
	return calls.filter(c => c.id === id);
}

// ── Effect 2: props-update skips its initial run ───────────────────

test('the props-update effect skips its initial run — no updateLayer fires immediately after the initial registerLayer', async () => {
	const {calls, unmount} = renderSpied(
		<Layer anchor="center" id="skip-init" open>
			<Text>content</Text>
		</Layer>,
	);
	unmountInstance = unmount;

	await delay(250);

	const records = forId(calls.current, 'skip-init');

	// Exactly one registration on open.
	const registers = records.filter(r => r.kind === 'register');
	expect(registers).toHaveLength(1);

	// No structural update should fire after registration on the
	// initial open — the props-update effect skips its first run
	// because the register descriptor already carries all props.
	const updates = records.filter(r => r.kind === 'update');
	expect(updates).toHaveLength(0);
});

// ── Effect 2: no updateLayer when structural props change while closed ─

test('changing structural props while the layer is closed does not fire updateLayer', async () => {
	let setOpen: (v: boolean) => void;
	let setZ: (v: number) => void;

	function App() {
		const [open, set] = useState(false);
		const [z, setZVal] = useState(0);
		setOpen = set;
		setZ = setZVal;
		return (
			<Layer anchor="center" id="closed-props" open={open} z={z}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);

	// Layer starts closed — no registration yet.
	expect(forId(calls.current, 'closed-props')).toHaveLength(0);

	// Change a structural prop while still closed.
	calls.current = [];
	setZ(99);
	await delay(250);

	// No register, no update — the layer is not registered.
	const records = forId(calls.current, 'closed-props');
	expect(records).toHaveLength(0);

	// Now open the layer — it should register with the latest z value.
	setOpen(true);
	await delay(250);

	const afterOpen = forId(calls.current, 'closed-props');
	expect(afterOpen.some(r => r.kind === 'register')).toBe(true);
	// The register was followed by no duplicate STRUCTURAL update
	// (the initial-run skip still applies even after a delayed open).
	// The content-sync effect may fire once (content was never synced
	// while closed), but that patch carries only `content` — never the
	// structural keys like `z`.
	const structuralUpdates = afterOpen.filter(
		r =>
			r.kind === 'update' &&
			r.keys.some(k => k !== 'content'),
	);
	expect(structuralUpdates).toHaveLength(0);
});

// ── Effect 3: content-sync is a no-op when content identity is unchanged ─

test('the content-sync effect is a no-op when children identity is stable across re-renders', async () => {
	// Use a ref-held, stable element so children identity does NOT change
	// across parent re-renders.  The content-sync effect compares refs;
	// if they are the same, it must not push any update.
	let triggerRerender: () => void;

	const stableContent = <Text>stable</Text>;

	function App() {
		const [, setTick] = useState(0);
		triggerRerender = () => {
			setTick(t => t + 1);
		};

		return (
			<Layer anchor="center" id="stable-content">
				{stableContent}
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	// Re-render the parent multiple times. Children identity is stable,
	// so the content-sync effect should detect no change and push nothing.
	for (let i = 0; i < 4; i++) {
		triggerRerender();
		await delay(50);
	}

	const records = forId(calls.current, 'stable-content');

	// No updates at all — content identity is unchanged.
	expect(records.some(r => r.kind === 'update')).toBe(false);
	// No register/unregister churn.
	expect(records.some(r => r.kind === 'register')).toBe(false);
	expect(records.some(r => r.kind === 'unregister')).toBe(false);
});

// ── Combined structural + content change fires a structural update ─

test('changing a structural prop AND children simultaneously fires a structural update carrying content, not a content-only patch', async () => {
	let mutate: () => void;

	function App() {
		const [z, setZ] = useState(0);
		const [count, setCount] = useState(0);
		mutate = () => {
			setZ(5);
			setCount(42);
		};
		return (
			<Layer anchor="center" id="combined-change" z={z}>
				<Text>count {count}</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	mutate();
	await delay(250);

	const updates = forId(calls.current, 'combined-change').filter(
		r => r.kind === 'update',
	);

	expect(updates.length).toBeGreaterThan(0);

	// At least one update must carry the structural `z` key (the
	// props-update effect fires). It also carries `content` because
	// the structural patch always includes contentRef.current.
	const structuralUpdates = updates.filter(u => u.keys.includes('z'));
	expect(structuralUpdates.length).toBeGreaterThan(0);
	expect(
		structuralUpdates.every(u => u.keys.includes('content')),
	).toBe(true);
});

// ── Effect 1 isolation: structural change does not re-run open/close effect ─

test('changing structural props on an open layer does not fire registerLayer or unregisterLayer (open/close effect isolation)', async () => {
	let setZ: (v: number) => void;

	function App() {
		const [z, set] = useState(0);
		setZ = set;
		return (
			<Layer anchor="center" id="iso-open-close" z={z}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);

	const initialRegisters = forId(calls.current, 'iso-open-close').filter(
		r => r.kind === 'register',
	);
	expect(initialRegisters).toHaveLength(1);

	calls.current = [];

	// Change structural prop multiple times.
	setZ(1);
	await delay(100);
	setZ(2);
	await delay(100);
	setZ(3);
	await delay(100);

	const records = forId(calls.current, 'iso-open-close');

	// The open/close effect must NOT re-run: no register, no unregister.
	expect(records.some(r => r.kind === 'register')).toBe(false);
	expect(records.some(r => r.kind === 'unregister')).toBe(false);

	// Only structural updates should appear.
	expect(records.every(r => r.kind === 'update')).toBe(true);
});

// ── Effect 3 isolation: content-only change does not re-run open/close or props-update ─

test('content-only change does not fire registerLayer, unregisterLayer, or a structural update', async () => {
	let setContent: (v: string) => void;

	function App() {
		const [text, setText] = useState('alpha');
		setContent = setText;
		return (
			<Layer anchor="center" id="content-iso">
				<Text>{text}</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	setContent('beta');
	await delay(250);

	const records = forId(calls.current, 'content-iso');

	// No register/unregister.
	expect(records.some(r => r.kind === 'register')).toBe(false);
	expect(records.some(r => r.kind === 'unregister')).toBe(false);

	// Only content-only patches (single key).
	const updates = records.filter(r => r.kind === 'update');
	expect(updates.length).toBeGreaterThan(0);
	expect(updates.every(u => u.keys.length === 1 && u.keys[0] === 'content')).toBe(true);
});

// ── Effect 2: changing the same structural prop to the same value is a no-op ─

test('setting a structural prop to the same value does not fire the props-update effect (React dep equality)', async () => {
	let setZ: (v: number) => void;

	function App() {
		const [z, set] = useState(5);
		setZ = set;
		return (
			<Layer anchor="center" id="same-value" z={z}>
				<Text>content</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	// Set z to the SAME value — React's Object.is comparison means the
	// effect deps don't change, so the props-update effect should not
	// fire (no update at all, including no content-only update because
	// children identity is stable too).
	setZ(5);
	await delay(250);

	const records = forId(calls.current, 'same-value');
	expect(records).toHaveLength(0);
});

// ── Effect 3: content-sync fires exactly once per content change ─

test('the content-sync effect fires exactly once for a single content change (no duplicate patches)', async () => {
	let setContent: (v: number) => void;

	function App() {
		const [n, set] = useState(0);
		setContent = set;
		return (
			<Layer anchor="center" id="single-content">
				<Text>val {n}</Text>
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	setContent(1);
	await delay(250);

	const contentUpdates = forId(calls.current, 'single-content').filter(
		r =>
			r.kind === 'update' &&
			r.keys.length === 1 &&
			r.keys[0] === 'content',
	);

	// Exactly one content-only patch for one content change.
	expect(contentUpdates).toHaveLength(1);
});

// ── Effect 2: structural update includes content even when content is unchanged ─

test('structural prop update always includes content in its patch, even when children have not changed', async () => {
	// Use stable content identity so the content-sync effect won't fire
	// on its own. The structural update should still carry `content`.
	let setZ: (v: number) => void;
	const stableChild = <Text>fixed</Text>;

	function App() {
		const [z, set] = useState(0);
		setZ = set;
		return (
			<Layer anchor="center" id="struct-with-content" z={z}>
				{stableChild}
			</Layer>
		);
	}

	const {calls, unmount} = renderSpied(<App />);
	unmountInstance = unmount;

	await delay(250);
	calls.current = [];

	setZ(10);
	await delay(250);

	const updates = forId(calls.current, 'struct-with-content').filter(
		r => r.kind === 'update',
	);

	expect(updates.length).toBeGreaterThan(0);

	// Every structural update must carry `content` (it always includes
	// contentRef.current) AND `z` (the prop that changed).
	expect(updates.every(u => u.keys.includes('z'))).toBe(true);
	expect(updates.every(u => u.keys.includes('content'))).toBe(true);
});
