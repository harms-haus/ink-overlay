/**
 * Tests for the `restoreFocus` deactivation path of `useFocusTrap`,
 * with emphasis on the **try/catch guard** around
 * `focusManager.focus(previousFocusIdReference.current)`.
 *
 * The previously-focused element may have **unmounted** between
 * activation and deactivation (e.g. a sibling overlay closed).  In that
 * case `focusManager.focus(id)` can throw — so the call must be guarded
 * so that a failing restore never surfaces an uncaught error inside
 * React's passive-effect cleanup.  See `src/focus-trap.tsx`
 * (`deactivateEffectEvent`).
 *
 * ## How errors are observed
 *
 * Two complementary mechanisms detect whether the throw propagated out
 * of the cleanup:
 *
 * 1. **FiberRoot `onCaughtError` / `onUncaughtError`** — Ink's reconciler
 *    is configured with **no-op** error handlers, but we temporarily
 *    replace `container.onCaughtError` with a capturing spy.  React
 *    routes errors from passive-effect cleanups through the root's error
 *    callbacks, so we can observe whether the throw escaped.
 *
 * 2. **`console.error` spy** — When React catches an error from a
 *    passive-effect cleanup it also calls `console.error` with the
 *    error details.  Spying on `console.error` provides a second,
 *    independent observation point that would catch a missing guard
 *    even if the FiberRoot callback mechanism were bypassed.
 *
 * Both paths confirm the same invariant:
 *
 * - **Without the guard:** the throw escapes the cleanup →
 *   `onCaughtError` / `onUncaughtError` is invoked AND `console.error`
 *   is called with the error.
 * - **With the guard (try/catch):** the throw is caught locally →
 *   neither observation point fires.
 *
 * Because Ink's real `FocusManager.focus()` is a silent no-op when the id
 * is unknown (it does not throw), the throwing scenario is exercised via
 * a stub focus manager injected through a partial mock of `ink`'s
 * `useFocusManager`.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {test, expect, vi, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {
	InputDispatcher,
} from '../src/input-dispatcher.js';
import {FocusTrap} from '../src/focus-trap.js';
import {delay} from './helpers/delay.js';

// Ink's internal instance registry — used to access the FiberRoot so we
// can observe passive-effect errors via `onCaughtError`.
// (Loaded via relative path since ink doesn't export it publicly.)
import inkInstances from '../node_modules/ink/build/instances.js';

// ── Mocks ────────────────────────────────────────────────────────────

// warnBunInput mock (vi.hoisted so it survives vi.mock hoisting)
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Stub focus manager ───────────────────────────────────────────────
//
// A mutable holder populated before each render.  The partial `ink` mock
// below returns whatever stub is currently in the holder from
// `useFocusManager()`, while leaving every other `ink` export untouched
// so `<InputDispatcher>` keeps working.

type StubFocusManager = {
	activeId: string | undefined;
	enableFocus: ReturnType<typeof vi.fn>;
	disableFocus: ReturnType<typeof vi.fn>;
	focus: ReturnType<typeof vi.fn>;
	focusNext: ReturnType<typeof vi.fn>;
	focusPrevious: ReturnType<typeof vi.fn>;
};

const stubHolder = vi.hoisted(() => ({
	current: null as StubFocusManager | null,
}));

vi.mock('ink', async importOriginal => {
	const actual = await importOriginal<typeof import('ink')>();
	return {
		...actual,
		useFocusManager: () => stubHolder.current,
	};
});

function makeStub(
	overrides: Partial<StubFocusManager> = {},
): StubFocusManager {
	return {
		activeId: 'prev-focused',
		enableFocus: vi.fn(),
		disableFocus: vi.fn(),
		focus: vi.fn(),
		focusNext: vi.fn(),
		focusPrevious: vi.fn(),
		...overrides,
	};
}

afterEach(async () => {
	mockWarnBunInput.mockClear();
	stubHolder.current = null;
	await delay(50);
});

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Render the trap inside an `<InputDispatcher>`, then replace the
 * FiberRoot's `onCaughtError` with a capturing array.  Returns the render
 * handle plus the `errors` array and a `restore` function.
 *
 * `onCaughtError` is the React reconciler callback invoked when an error
 * is thrown inside a passive-effect cleanup (or caught by an error
 * boundary).  Ink configures it as a no-op, so we temporarily replace it
 * to observe the throw.
 */
function renderTrapWithErrorHandler(active: boolean, restoreFocus?: boolean) {
	const errors: Array<Error | {value: unknown}> = [];

	const handle = render(
		<InputDispatcher>
			<FocusTrap active={active} restoreFocus={restoreFocus}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);

	const inkInstance = inkInstances.get(handle.stdout);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const container = inkInstance?.container;
	const originalOnCaughtError = container?.onCaughtError;

	if (container) {
		container.onCaughtError = (error: unknown) => {
			errors.push(error as Error);
		};
	}

	const restore = () => {
		if (container) {
			container.onCaughtError = originalOnCaughtError;
		}
	};

	return {handle, errors, restore};
}

// ════════════════════════════════════════════════════════════════════
// Characterization: activation snapshots activeId, disables focus
// ════════════════════════════════════════════════════════════════════

test('activation snapshots focusManager.activeId and disables global focus', async () => {
	const stub = makeStub();
	stubHolder.current = stub;

	const {handle, restore} = renderTrapWithErrorHandler(true);
	await delay(100);

	expect(stub.disableFocus).toHaveBeenCalledTimes(1);
	expect(stub.focus).not.toHaveBeenCalled();
	expect(stub.enableFocus).not.toHaveBeenCalled();

	restore();
	handle.unmount();
});

// ════════════════════════════════════════════════════════════════════
// restoreFocus=true restores the snapshotted id
// ════════════════════════════════════════════════════════════════════

test('restoreFocus=true calls focus() with the snapshotted activeId on deactivation', async () => {
	const stub = makeStub();
	stubHolder.current = stub;

	const {handle, errors, restore} = renderTrapWithErrorHandler(true);
	await delay(100);

	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={false}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	expect(stub.enableFocus).toHaveBeenCalledTimes(1);
	expect(stub.focus).toHaveBeenCalledTimes(1);
	expect(stub.focus).toHaveBeenCalledWith('prev-focused');
	// No error should surface — the stub's focus() does not throw.
	expect(errors).toHaveLength(0);

	restore();
	handle.unmount();
});

// ════════════════════════════════════════════════════════════════════
// restoreFocus=false does NOT call focus()
// ════════════════════════════════════════════════════════════════════

test('restoreFocus=false does NOT call focus() on deactivation', async () => {
	const stub = makeStub();
	stubHolder.current = stub;

	const {handle, errors, restore} = renderTrapWithErrorHandler(true, false);
	await delay(100);

	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={false} restoreFocus={false}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	expect(stub.enableFocus).toHaveBeenCalledTimes(1);
	expect(stub.focus).not.toHaveBeenCalled();
	expect(errors).toHaveLength(0);

	restore();
	handle.unmount();
});

// ════════════════════════════════════════════════════════════════════
// GUARD: a throwing focus() must NOT surface as an uncaught error
// ════════════════════════════════════════════════════════════════════
//
// This is the primary regression test for the try/catch guard.  When the
// previously-focused element has unmounted, `focusManager.focus(id)` may
// throw.  Without the guard, that throw escapes the passive-effect
// cleanup, reaching both the FiberRoot error callback and `console.error`.
// With the guard, the throw is caught locally and neither fires.
//
// NOTE: Ink's real `FocusManager.focus()` is a silent no-op for unknown
// ids (it does not throw), so this scenario uses a stub whose `focus()`
// throws.  The assertions on `errors` AND `console.error` are what make
// this test FAIL if the try/catch guard is removed.

test('a throwing focus() does NOT surface an error when guarded (unmounted target)', async () => {
	const throwingFocus = vi.fn(() => {
		throw new Error('target element no longer mounted');
	});
	const stub = makeStub({focus: throwingFocus});
	stubHolder.current = stub;

	const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	const {handle, errors, restore} = renderTrapWithErrorHandler(true);
	await delay(100);
	expect(stub.disableFocus).toHaveBeenCalledTimes(1);

	// Deactivate — the restore call will throw IF unguarded.
	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={false}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(300);

	// The restore attempt was made with the snapshotted id…
	expect(throwingFocus).toHaveBeenCalledTimes(1);
	expect(throwingFocus).toHaveBeenCalledWith('prev-focused');
	// …and global focus navigation was STILL re-enabled (enableFocus runs
	// before focus, so it's unaffected by the throw either way).
	expect(stub.enableFocus).toHaveBeenCalledTimes(1);
	// CRITICAL: with the try/catch guard, the throw must NOT escape the
	// cleanup.  Without the guard, `onCaughtError` would capture it.
	expect(errors).toHaveLength(0);
	// Secondary check: the guard also prevents the error from reaching
	// `console.error` (which React calls for uncaught passive-effect
	// errors).  If this assertion fails, the try/catch guard is missing.
	expect(consoleErrorSpy).not.toHaveBeenCalledWith(
		expect.stringContaining('target element no longer mounted'),
	);

	consoleErrorSpy.mockRestore();
	restore();
	handle.unmount();
});

// ════════════════════════════════════════════════════════════════════
// GUARD: deactivation completes and trap-depth accounting stays correct
// ════════════════════════════════════════════════════════════════════
//
// Even when focus() throws, deactivation must complete cleanly so the
// trap can be re-activated (proving the trap-depth counter returned to 0).
// A second disableFocus call on re-activation confirms the counter isn't
// stuck at a stale non-zero value.

test('a trap that survived a throwing restore can be re-activated and deactivated again', async () => {
	const throwingFocus = vi.fn(() => {
		throw new Error('target element no longer mounted');
	});
	const stub = makeStub({focus: throwingFocus});
	stubHolder.current = stub;

	const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	const {handle, errors, restore} = renderTrapWithErrorHandler(true);
	await delay(100);

	// First deactivation — restore throws (caught by guard).
	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={false}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(300);
	expect(stub.enableFocus).toHaveBeenCalledTimes(1);
	expect(errors).toHaveLength(0);
	expect(consoleErrorSpy).not.toHaveBeenCalledWith(
		expect.stringContaining('target element no longer mounted'),
	);

	// Re-activate — disableFocus must be called again (depth 0→1).
	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={true}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);
	expect(stub.disableFocus).toHaveBeenCalledTimes(2);

	// Second deactivation — enableFocus + restore attempt again.
	handle.rerender(
		<InputDispatcher>
			<FocusTrap active={false}>
				<Text>trap-content</Text>
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(300);
	expect(stub.enableFocus).toHaveBeenCalledTimes(2);
	expect(throwingFocus).toHaveBeenCalledTimes(2);
	expect(errors).toHaveLength(0);
	expect(consoleErrorSpy).not.toHaveBeenCalledWith(
		expect.stringContaining('target element no longer mounted'),
	);

	consoleErrorSpy.mockRestore();
	restore();
	handle.unmount();
});
