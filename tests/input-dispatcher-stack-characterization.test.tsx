/**
 * Characterization tests for the InputDispatcher LIFO stack mutation
 * contract — specifically the behaviour of `registerInput` /
 * `unregisterInput` that the hot-path optimisation (replacing
 * `Array.prototype.filter` allocation with `findIndex` + `splice`) must
 * preserve bit-for-bit.
 *
 * These tests pin down the *observable* dispatch order after various
 * register / re-register / unregister sequences so that the
 * refactor is provably safe.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {test, expect, vi, afterEach} from 'vitest';
import {type ReactNode} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {
	InputDispatcher,
	useRegisterInput,
	useInputDispatcher,
} from '../src/input-dispatcher.js';
import {delay} from './helpers/delay.js';

// ── warnBunInput mock (vi.hoisted so it survives vi.mock hoisting) ──
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Helpers ──────────────────────────────────────────────────────────

function renderDispatcher(children: ReactNode) {
	return render(
		<InputDispatcher>
			<Text>root</Text>
			{children}
		</InputDispatcher>,
	);
}

afterEach(async () => {
	mockWarnBunInput.mockClear();
	await delay(50);
});

/**
 * Drive the dispatcher imperatively: returns a handle whose `register`
 * / `unregister` call straight through to the context API and whose
 * `press` simulates a keypress.
 */
function useImperativeDispatcher() {
	const api = useInputDispatcher();
	return api;
}

// ── Re-registration moves entry to TOP of stack (LIFO) ──────────────
//
// register A, B, C  →  stack bottom→top: [A, B, C]  (C is top)
// re-register A     →  stack should become [B, C, A]  (A is now top)
//
// Both the old `.filter()` + `push` and the new `findIndex` + `splice`
// + `push` implementations MUST move A to the top — not merely replace
// it in place.  This is the single most important invariant the
// refactor must not break.

test('re-registering an existing id moves it to the TOP of the stack (not in place)', async () => {
	const calls: string[] = [];

	// Build three handlers; none consume so the full walk happens and we
	// can observe the exact dispatch order.
	const handlerA = vi.fn(() => {
		calls.push('A');
	});
	const handlerB = vi.fn(() => {
		calls.push('B');
	});
	const handlerC = vi.fn(() => {
		calls.push('C');
	});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	// Initial registration: A, B, C in that order.
	api!.registerInput('a', handlerA);
	api!.registerInput('b', handlerB);
	api!.registerInput('c', handlerC);
	await delay(20);

	// First keypress: dispatch is top-down → C, B, A.
	stdin.write('1');
	await delay(100);
	expect(calls).toEqual(['C', 'B', 'A']);
	calls.length = 0;

	// Re-register A — it must move to the top.
	api!.registerInput('a', handlerA);
	await delay(20);

	// Second keypress: now A is top → A, C, B.
	stdin.write('2');
	await delay(100);
	expect(calls).toEqual(['A', 'C', 'B']);
});

// ── Re-registering the TOP entry keeps it on top ────────────────────

test('re-registering the current top entry keeps it on top and dispatches once', async () => {
	const calls: string[] = [];

	const handlerA = vi.fn(() => {
		calls.push('A');
	});
	const handlerB = vi.fn(() => {
		calls.push('B');
	});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	api!.registerInput('a', handlerA);
	api!.registerInput('b', handlerB); // B is top
	await delay(20);

	// Re-register B (already top).
	api!.registerInput('b', handlerB);
	await delay(20);

	stdin.write('x');
	await delay(100);

	// B is still top, called first; then A. Critically, B must be called
	// exactly ONCE — re-registration must not leave a duplicate entry.
	expect(calls).toEqual(['B', 'A']);
	expect(handlerB).toHaveBeenCalledOnce();
});

// ── Re-registering the ONLY entry ───────────────────────────────────

test('re-registering the only entry does not duplicate it', async () => {
	const handler = vi.fn(() => {
		/* no-op */
	});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	api!.registerInput('solo', handler);
	api!.registerInput('solo', handler); // re-register same id + handler
	await delay(20);

	stdin.write('k');
	await delay(100);

	// Must fire exactly once — dedup must collapse the duplicate id.
	expect(handler).toHaveBeenCalledOnce();
});

// ── Unregister mid-stack preserves relative order of survivors ──────

test('unregistering a middle entry preserves relative order of the rest', async () => {
	const calls: string[] = [];

	const handlerA = vi.fn(() => {
		calls.push('A');
	});
	const handlerB = vi.fn(() => {
		calls.push('B');
	});
	const handlerC = vi.fn(() => {
		calls.push('C');
	});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	api!.registerInput('a', handlerA);
	api!.registerInput('b', handlerB);
	api!.registerInput('c', handlerC);
	await delay(20);

	// Remove the middle entry.
	api!.unregisterInput('b');
	await delay(20);

	stdin.write('z');
	await delay(100);

	// Stack is now [A, C]; dispatch top-down → C, A. B never fires.
	expect(calls).toEqual(['C', 'A']);
	expect(handlerB).not.toHaveBeenCalled();
});

// ── Unregister unknown id is a no-op ────────────────────────────────

test('unregistering an unknown id is a silent no-op', async () => {
	const calls: string[] = [];

	const handlerA = vi.fn(() => {
		calls.push('A');
	});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	api!.registerInput('a', handlerA);
	await delay(20);

	// Removing a never-registered id must not throw or disturb the stack.
	expect(() => api!.unregisterInput('does-not-exist')).not.toThrow();
	await delay(20);

	stdin.write('q');
	await delay(100);

	expect(calls).toEqual(['A']);
});

// ── Mid-walk consumption stops the walk at the right handler ────────
//
// With three handlers [A, B, C] (C top), if B consumes, C is called
// first (top-down), then B consumes → A is never reached. This pins
// down that the walk is strictly top-down and stops on the first
// `true`.

test('mid-stack consume stops the walk; upper handlers fire, lower do not', async () => {
	const handlerA = vi.fn(() => true);
	const handlerB = vi.fn(() => true); // consumes
	const handlerC = vi.fn(() => false); // passes through

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB);
		return <Text>B</Text>;
	}

	function ChildC() {
		useRegisterInput('c', handlerC);
		return <Text>C</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
			<ChildC />
		</>,
	);
	await delay(100);

	stdin.write('m');
	await delay(100);

	// Stack bottom→top: A, B, C. Walk top-down: C (passes), B (consumes).
	expect(handlerC).toHaveBeenCalledOnce();
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerA).not.toHaveBeenCalled();
});

// ── Throwing handler is swallowed and walk continues ────────────────

test('a throwing handler is logged and the walk continues to lower handlers', async () => {
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

	const handlerA = vi.fn(() => true);
	const throwingHandler = vi.fn(() => {
		throw new Error('boom');
	});

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildThrow() {
		useRegisterInput('throw', throwingHandler);
		return <Text>throw</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildThrow />
		</>,
	);
	await delay(100);

	stdin.write('x');
	await delay(100);

	// The throwing handler (top) was invoked, errored, and the walk
	// continued down to A.
	expect(throwingHandler).toHaveBeenCalledOnce();
	expect(handlerA).toHaveBeenCalledOnce();
	expect(errorSpy).toHaveBeenCalled();
	errorSpy.mockRestore();
});

// ── registerInput with a brand-new handler function replaces in-place semantics ─
//
// When re-registering id 'x' with a DIFFERENT handler, the OLD handler
// must never fire afterwards.  This pins the dedup contract: there is
// never more than one entry per id.

test('re-registering an id with a new handler prevents the old handler from firing', async () => {
	const oldHandler = vi.fn(() => true);
	const newHandler = vi.fn(() => true);

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	api!.registerInput('x', oldHandler);
	await delay(20);
	api!.registerInput('x', newHandler);
	await delay(20);

	stdin.write('p');
	await delay(100);

	expect(newHandler).toHaveBeenCalledOnce();
	expect(oldHandler).not.toHaveBeenCalled();
});

// ── Interleaved register / unregister keeps a consistent LIFO order ─

test('interleaved register/unregister sequences keep consistent LIFO order', async () => {
	const calls: string[] = [];

	const mk = (label: string) =>
		vi.fn(() => {
			calls.push(label);
		});

	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	const hA = mk('A');
	const hB = mk('B');
	const hC = mk('C');
	const hD = mk('D');

	api!.registerInput('a', hA);
	api!.registerInput('b', hB);
	api!.registerInput('c', hC);
	await delay(20);

	// Stack: [A, B, C] → dispatch C, B, A
	stdin.write('1');
	await delay(100);
	expect(calls).toEqual(['C', 'B', 'A']);
	calls.length = 0;

	api!.unregisterInput('c'); // remove top → [A, B]
	api!.registerInput('d', hD); // push D → [A, B, D]
	await delay(20);

	// Dispatch: D, B, A
	stdin.write('2');
	await delay(100);
	expect(calls).toEqual(['D', 'B', 'A']);
	calls.length = 0;

	api!.unregisterInput('a'); // remove bottom → [B, D]
	api!.registerInput('a', hA); // re-add A on top → [B, D, A]
	await delay(20);

	// Dispatch: A, D, B
	stdin.write('3');
	await delay(100);
	expect(calls).toEqual(['A', 'D', 'B']);
});

// ── Empty stack dispatch is a safe no-op ────────────────────────────

test('keypress with an empty handler stack is a safe no-op', async () => {
	let api: ReturnType<typeof useImperativeDispatcher> | undefined;

	function Inspector() {
		api = useImperativeDispatcher();
		return <Text>inspector</Text>;
	}

	const {stdin} = renderDispatcher(<Inspector />);
	await delay(100);

	// No handlers registered — must not throw.
	expect(() => {
		stdin.write('x');
	}).not.toThrow();
	await delay(100);
});
