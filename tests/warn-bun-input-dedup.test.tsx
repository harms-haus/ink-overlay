/**
 * Characterization tests for the `warnBunInput` de-duplication contract.
 *
 * Background: `warnBunInput` warns the developer (once per process) that
 * interactive keyboard input is non-functional under the Bun runtime
 * (bun#6862).  It is meant to fire exactly once the first time a
 * capturing layer engages input capture.
 *
 * Historically the warning was wired up in TWO places that fire on the
 * same trigger:
 *
 *   1. `src/host.tsx` — the raw-mode management effect calls
 *      `warnBunInput()` (unguarded) when `capturingCount` transitions
 *      from 0 to positive.
 *   2. `src/input-dispatcher.tsx` — an effect guarded by
 *      `bunWarnFiredReference` calls `warnBunInput()` when
 *      `captureDepth` first reaches 1.
 *
 * When a capturing layer mounts, BOTH conditions trip simultaneously,
 * so `warnBunInput()` was invoked twice on a single trigger.  The fix
 * is to keep only the `input-dispatcher.tsx` call (which owns the
 * capture-depth state and the proper de-dup guard) and remove the
 * redundant, unguarded call from `host.tsx`.
 *
 * These tests pin down the *contract* — `warnBunInput` fires exactly
 * once when a capturing layer engages through the full `<OverlayHost>`
 * pipeline — so the de-duplication refactor is provably safe: the
 * warning is neither lost (zero calls) nor duplicated (two calls).
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {test, expect, afterEach, vi} from 'vitest';
import {useState} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost} from '../src/host.js';
import {Layer} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── warnBunInput mock ───────────────────────────────────────────────
//
// `vi.hoisted` so the mock factory survives `vi.mock` hoisting.  Both
// `host.tsx` and `input-dispatcher.tsx` import from `./runtime.js`, so a
// single mock of `../src/runtime.js` intercepts calls from BOTH modules
// — which is exactly what we need to detect the duplicate invocation.
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Helpers ─────────────────────────────────────────────────────────

afterEach(async () => {
	// Reset the mock call-count between tests so each scenario starts clean.
	mockWarnBunInput.mockClear();
	// Clear any imperative layers left over from overlayStore-driven tests.
	overlayStore.closeAll();
	await delay(50);
});

/**
 * Stateful app shell with an exposed opener so we never need `rerender`
 * (which would replace the `<OverlayHost>` wrapper and reset context).
 * Mirrors the pattern used in input-capture.test.tsx / modal.test.tsx.
 */
function makeCapturingLayerApp() {
	let openLayer: () => void;
	let closeLayer: () => void;

	function App() {
		const [open, setOpen] = useState(false);
		openLayer = () => {
			setOpen(true);
		};

		closeLayer = () => {
			setOpen(false);
		};

		return (
			<>
				<Text>base</Text>
				<Layer open={open} capture backdrop="opaque">
					<Text>modal</Text>
				</Layer>
			</>
		);
	}

	return {
		App,
		open() {
			openLayer!();
		},
		close() {
			closeLayer!();
		},
	};
}

// ── Contract: warnBunInput fires exactly once on first capture ──────

test('warnBunInput fires exactly once when a capturing <Layer> first opens via <OverlayHost>', async () => {
	const {App, open} = makeCapturingLayerApp();

	render(
		<OverlayHost>
			<App />
		</OverlayHost>,
	);

	// Let the initial mount + subscription settle.  Before any capturing
	// layer opens, warnBunInput must NOT have been called.
	await delay(200);
	expect(mockWarnBunInput).not.toHaveBeenCalled();

	// Open the capturing layer — this simultaneously trips:
	//   - host.tsx raw-mode effect (capturingCount 0 → positive)
	//   - input-dispatcher.tsx capture-depth effect (captureDepth → 1)
	open();
	await delay(300);

	// The contract: exactly ONE call.  Two calls would indicate the
	// duplicate-firing bug; zero calls would indicate the warning was
	// accidentally removed entirely.
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);
});

// ── Contract: warning is de-duplicated across open/close cycles ─────

test('warnBunInput fires exactly once across repeated open/close cycles of a capturing layer', async () => {
	const {App, open, close} = makeCapturingLayerApp();

	render(
		<OverlayHost>
			<App />
		</OverlayHost>,
	);

	await delay(200);

	// First open — warning fires.
	open();
	await delay(300);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);

	// Close — no additional warning (capture-depth returns to 0, but the
	// input-dispatcher's bunWarnFiredReference guard prevents re-firing).
	close();
	await delay(300);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);

	// Re-open — still no additional warning.
	open();
	await delay(300);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);

	// Re-close — still exactly one.
	close();
	await delay(300);
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);
});

// ── Contract: imperative capturing layers also trigger the warning ──

test('warnBunInput fires exactly once when an imperative capturing layer opens via overlayStore', async () => {
	render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(200);
	expect(mockWarnBunInput).not.toHaveBeenCalled();

	// Open an imperative capturing overlay.
	overlayStore.open(<Text>imp-cap</Text>, {capture: true, anchor: 'center'});
	await delay(300);

	// Exactly one call — not two (the duplicate-firing bug), not zero.
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);
});

// ── Contract: non-capturing layers do NOT trigger the warning ───────

test('warnBunInput is NOT called when a non-capturing layer opens via <OverlayHost>', async () => {
	function NonCapturingApp() {
		return (
			<>
				<Text>base</Text>
				<Layer open capture={false} backdrop="none">
					<Text>plain</Text>
				</Layer>
			</>
		);
	}

	render(
		<OverlayHost>
			<NonCapturingApp />
		</OverlayHost>,
	);

	await delay(300);

	// A non-capturing layer never engages capture-depth or raw mode, so
	// warnBunInput must remain uncalled.
	expect(mockWarnBunInput).not.toHaveBeenCalled();
});

// ── Contract: multiple simultaneous capturing layers fire once ──────

test('warnBunInput fires exactly once when multiple capturing layers open at once', async () => {
	function App() {
		return (
			<>
				<Text>base</Text>
				<Layer open capture backdrop="none">
					<Text>first</Text>
				</Layer>
				<Layer open capture backdrop="none">
					<Text>second</Text>
				</Layer>
			</>
		);
	}

	render(
		<OverlayHost>
			<App />
		</OverlayHost>,
	);

	await delay(300);

	// Two capturing layers both trip the trigger on the same render, but
	// the de-dup guard must collapse them to a single warnBunInput call.
	expect(mockWarnBunInput).toHaveBeenCalledTimes(1);
});

// ── Contract: warnBunInput is not invoked merely by mounting host ────

test('warnBunInput is NOT called when <OverlayHost> mounts with no capturing layers', async () => {
	render(
		<OverlayHost>
			<Text>just-children</Text>
		</OverlayHost>,
	);

	await delay(300);

	expect(mockWarnBunInput).not.toHaveBeenCalled();
});
