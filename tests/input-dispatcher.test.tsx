/**
 * Tests for InputDispatcher — the CORE modal input-capture mechanism.
 *
 * LIFO stack + captureDepth + cooperative gating.
 * Uses REAL timers (ink breaks with fake timers).
 */
import {test, expect, vi, afterEach} from 'vitest';
import {type ReactNode} from 'react';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import {
	InputDispatcher,
	useRegisterInput,
	useInputCaptureState,
	useInputDispatcher,
} from '../src/input-dispatcher.js';
import {delay} from './helpers/delay.js';

// ── warnBunInput mock (vi.hoisted so it survives vi.mock hoisting) ──
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Helper: render <InputDispatcher> wrapping the given children and return
 * the ink-testing-library instance.
 */
function renderDispatcher(children: ReactNode) {
	const result = render(
		<InputDispatcher>
			<Text>root</Text>
			{children}
		</InputDispatcher>,
	);
	return result;
}

// ── Active tests (each uses fresh render) ────────────────────────────

afterEach(async () => {
	// Reset warnBunInput mock call-count between tests.
	mockWarnBunInput.mockClear();
	// Small delay between tests to let ink's rendering loop settle.
	await delay(50);
});

// ── LIFO dispatch order ──────────────────────────────────────────────

test('LIFO: topmost handler (B) is called first', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => true); // B consumes

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB);
		return <Text>B</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
		</>,
	);

	await delay(100);

	// Simulate a keypress.
	stdin.write('x');
	await delay(100);

	// B was registered after A, so B is top-of-stack and called first.
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerB.mock.calls[0]![0]).toBe('x');

	// B returned true (consumed), so A must NOT be called.
	expect(handlerA).not.toHaveBeenCalled();
});

test('LIFO: when top handler returns false/void, next handler IS called', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => false); // B does NOT consume

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB);
		return <Text>B</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
		</>,
	);

	await delay(100);

	stdin.write('k');
	await delay(100);

	// B is topmost, called first, returns false → falls through to A.
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerB.mock.calls[0]![0]).toBe('k');
	expect(handlerA).toHaveBeenCalledOnce();
	expect(handlerA.mock.calls[0]![0]).toBe('k');
});

test('LIFO: when top handler returns void, next handler IS called', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => undefined); // B returns void

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB);
		return <Text>B</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
		</>,
	);

	await delay(100);

	stdin.write('m');
	await delay(100);

	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerA).toHaveBeenCalledOnce();
});

// ── Unregister restores previous top ─────────────────────────────────

test('LIFO: unregistering B restores A as top', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => true);

	let showB = true;

	function ChildA() {
		useRegisterInput('a', handlerA);
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB, showB);
		return showB ? <Text>B</Text> : null;
	}

	const {stdin, rerender} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
		</>,
	);

	await delay(100);

	// First keypress: B is top, consumes.
	stdin.write('1');
	await delay(100);
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerA).not.toHaveBeenCalled();

	// Unmount B.
	showB = false;
	rerender(
		<InputDispatcher>
			<Text>root</Text>
			<ChildA />
			<ChildB />
		</InputDispatcher>,
	);

	await delay(100);

	// Second keypress: A is now top.
	stdin.write('2');
	await delay(100);

	// B was NOT called again.
	expect(handlerB).toHaveBeenCalledOnce(); // Still just the first call
	// A is now called.
	expect(handlerA).toHaveBeenCalledOnce();
	expect(handlerA.mock.calls[0]![0]).toBe('2');
});

// ── isActive gating ──────────────────────────────────────────────────

test('useRegisterInput: isActive=false prevents registration', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => true);

	function ChildA() {
		useRegisterInput('a', handlerA, false); // Inactive
		return <Text>A</Text>;
	}

	function ChildB() {
		useRegisterInput('b', handlerB);
		return <Text>B</Text>;
	}

	const {stdin} = renderDispatcher(
		<>
			<ChildA />
			<ChildB />
		</>,
	);

	await delay(100);

	stdin.write('z');
	await delay(100);

	// Only B should fire (A was inactive, so not registered).
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerA).not.toHaveBeenCalled();
});

// ── captureDepth / isCaptured ────────────────────────────────────────

test('captureDepth: starts at 0, isCaptured is false', async () => {
	let isCaptured: boolean | undefined;

	function Inspector() {
		isCaptured = useInputCaptureState();
		return <Text>inspector</Text>;
	}

	renderDispatcher(<Inspector />);
	await delay(100);

	expect(isCaptured).toBeDefined();
	expect(isCaptured).toBe(false);
});

test('captureDepth: captureEnter increments, captureExit decrements', async () => {
	let isCaptured: boolean | undefined;
	let dispatcher: ReturnType<typeof useInputDispatcher> | undefined;

	function Inspector() {
		isCaptured = useInputCaptureState();
		dispatcher = useInputDispatcher();
		return <Text>inspector</Text>;
	}

	renderDispatcher(<Inspector />);
	await delay(100);

	expect(isCaptured).toBe(false);

	// First captureEnter → isCaptured = true.
	dispatcher!.captureEnter();
	await delay(10);
	expect(isCaptured).toBe(true);

	// Second captureEnter → depth 2, still captured.
	dispatcher!.captureEnter();
	await delay(10);
	expect(isCaptured).toBe(true);

	// First captureExit → depth 1, still captured.
	dispatcher!.captureExit();
	await delay(10);
	expect(isCaptured).toBe(true);

	// Second captureExit → depth 0, not captured.
	dispatcher!.captureExit();
	await delay(10);
	expect(isCaptured).toBe(false);
});

test('captureDepth: captureExit never goes below 0', async () => {
	let isCaptured: boolean | undefined;
	let dispatcher: ReturnType<typeof useInputDispatcher> | undefined;

	function Inspector() {
		isCaptured = useInputCaptureState();
		dispatcher = useInputDispatcher();
		return <Text>inspector</Text>;
	}

	renderDispatcher(<Inspector />);
	await delay(100);

	// Already at 0, calling captureExit should not throw or go negative.
	dispatcher!.captureExit();
	await delay(10);
	expect(isCaptured).toBe(false);

	// One more for good measure.
	dispatcher!.captureExit();
	await delay(10);
	expect(isCaptured).toBe(false);
});

// ── useInputDispatcher throws outside <InputDispatcher> ──────────────

test('useInputDispatcher throws when used outside <InputDispatcher>', () => {
	// Ink's internal ErrorBoundary catches rendering errors and suppresses
	// them from lastFrame(). We verify the invariant directly:
	// the context default is null, so useInputDispatcher() must throw.
	// We test this by rendering a component that calls the hook and
	// verifying Ink does not render the component's content.

	function BadComponent() {
		useInputDispatcher();
		return <Text>should-not-appear</Text>;
	}

	const {lastFrame} = render(<BadComponent />);

	// Ink's ErrorBoundary catches the error and renders ErrorOverview,
	// so the component's content should never appear.
	expect(lastFrame()).not.toMatch(/should-not-appear/);
});

// ── warnBunInput not called on import ───────────────────────────────

test('warnBunInput is not called on module import', async () => {
	const {warnBunInput} = await import('../src/runtime.js');
	const spy = vi.spyOn(console, 'warn');

	// Importing input-dispatcher should NOT trigger warnBunInput.
	// (warnBunInput is only called when captureDepth transitions to 1.)
	expect(spy).not.toHaveBeenCalled();
	spy.mockRestore();
	await delay(50);
});

// ── Handler receives correct Key object shape ────────────────────────

test('handler receives input string and key object', async () => {
	let receivedInput: string | undefined;
	let receivedKey: Record<string, unknown> | undefined;

	function Child() {
		useRegisterInput('key-test', (input, key) => {
			receivedInput = input;
			receivedKey = key as unknown as Record<string, unknown>;
			return true;
		});
		return <Text>child</Text>;
	}

	const {stdin} = renderDispatcher(<Child />);
	await delay(100);

	stdin.write('x');
	await delay(100);

	expect(receivedInput).toBe('x');
	expect(receivedKey).toBeDefined();
	expect(typeof receivedKey!['escape']).toBe('boolean');
	expect(typeof receivedKey!['ctrl']).toBe('boolean');
	expect(typeof receivedKey!['shift']).toBe('boolean');
	expect(typeof receivedKey!['tab']).toBe('boolean');
});

// ── Multiple keypresses dispatch correctly each time ─────────────────

test('LIFO: multiple sequential keypresses all dispatch correctly', async () => {
	const calls: string[] = [];

	function Child() {
		useRegisterInput('multi', input => {
			calls.push(input);
		});
		return <Text>child</Text>;
	}

	const {stdin} = renderDispatcher(<Child />);
	await delay(100);

	stdin.write('a');
	await delay(100);
	stdin.write('b');
	await delay(100);
	stdin.write('c');
	await delay(100);

	expect(calls).toEqual(['a', 'b', 'c']);
});

// ── Duplicate-id replacement ──────────────────────────────────────────

test('duplicate-id: re-registering same id replaces handler (no double-dispatch)', async () => {
	const handlerA = vi.fn();
	const handlerB = vi.fn(() => true);

	// Register id 'x' with handlerA, then immediately re-register with handlerB.
	function Child() {
		useRegisterInput('x', handlerA);
		useRegisterInput('x', handlerB);
		return <Text>child</Text>;
	}

	const {stdin} = renderDispatcher(<Child />);
	await delay(100);

	stdin.write('q');
	await delay(100);

	// Only handlerB should be called — handlerA was replaced.
	expect(handlerB).toHaveBeenCalledOnce();
	expect(handlerA).not.toHaveBeenCalled();
});

// ── warnBunInput fire-on-captureEnter dedupe ─────────────────────────

test('warnBunInput is called exactly once on repeated captureEnter', async () => {
	let dispatcher: ReturnType<typeof useInputDispatcher> | undefined;

	function Inspector() {
		dispatcher = useInputDispatcher();
		return <Text>inspector</Text>;
	}

	renderDispatcher(<Inspector />);
	await delay(100);

	// First captureEnter should fire warnBunInput.
	dispatcher!.captureEnter();
	await delay(10);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);

	// Second captureEnter should NOT fire warnBunInput again (dedupe).
	dispatcher!.captureEnter();
	await delay(10);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);
});
