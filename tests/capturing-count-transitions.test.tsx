/**
 * Characterization tests for the capturing-count transition logic in
 * `<OverlayHost>`.
 *
 * These tests pin down the observable behaviour driven by `capturingCount`
 * — the number of layers with `capture: true` that are not currently
 * exiting.  The host currently uses TWO refs
 * (`previousCapturingCountReference` for raw-mode and
 * `previousFocusCountReference` for focus) that both track the same
 * previous value.  A planned refactor will consolidate these into a
 * single ref / merged effect.  These tests prove the refactor is safe by
 * asserting the capture/release behaviour is identical regardless of the
 * internal ref structure.
 *
 * ## Observable signal
 *
 * We assert on `useInputCaptureState()` — the public boolean that
 * background components use to gate their own `useInput` / `useFocus`.
 * It is `true` while at least one capturing layer is open and `false`
 * otherwise.  This is the most reliable end-to-end signal because:
 *
 *  - It is driven by `FocusTrap` which mounts inside a capturing
 *    `<Layer>`; the host's `capturingCount` transition (0→positive)
 *    triggers `disableFocus()` + `setRawMode(true)` which enables the
 *    trap to function.
 *  - It does NOT depend on counting internal `setRawMode` /
 *    `enableFocus` calls (which are also issued by Ink's own `useInput`
 *    / `useFocus` hooks, making spy-count assertions unreliable).
 *
 * The probe writes its capture state to an outer variable rather than
 * the rendered frame — overlay content is absolutely positioned and
 * would otherwise garble any in-frame text assertion.
 *
 * ## Scenarios pinned down
 *
 *  - Capture toggles to `true` when a capturing layer opens.
 *  - Capture toggles back to `false` when the capturing layer closes.
 *  - Opening a second capturing layer (1 → 2) keeps capture `true`.
 *  - Closing one of two capturing layers (2 → 1) keeps capture `true`.
 *  - Closing the last capturing layer (1 → 0) releases capture.
 *  - Multiple open/close cycles each toggle correctly — the headline
 *    test for previous-value ref correctness.
 *  - Non-capturing layers never engage capture.
 *  - Mixed capturing / non-capturing layer transitions.
 *  - Unmounting while capturing does not throw.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost, useInputCaptureState} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── Isolation: clear imperative store between tests ─────────────────

afterEach(async () => {
	overlayStore.closeAll();
	await delay(50);
});

// ── Helper: a background component that reports capture state ───────
//
// Writes the current capture state to an outer variable so we can assert
// on it directly without worrying about overlay text overlapping the
// rendered frame.

function makeProbe() {
	let captured = false;

	function Probe() {
		captured = useInputCaptureState();
		return <Text>probe</Text>;
	}

	return {
		Probe,
		isCaptured: () => captured,
	};
}

// ── Helper: render host with the probe as background ────────────────

function renderWithProbe() {
	const probe = makeProbe();
	const instance = render(
		<OverlayHost>
			<probe.Probe />
		</OverlayHost>,
	);
	return {...instance, probe};
}

// ════════════════════════════════════════════════════════════════════
// 0 → positive: capture engages
// ════════════════════════════════════════════════════════════════════

test('0 → positive: capture state becomes true when a capturing layer opens', async () => {
	const {probe} = renderWithProbe();

	await delay(100);
	expect(probe.isCaptured()).toBe(false);

	overlayStore.open(<Text>cap</Text>, {capture: true, anchor: 'center'});
	await delay(200);

	expect(probe.isCaptured()).toBe(true);
});

// ════════════════════════════════════════════════════════════════════
// positive → 0: capture releases
// ════════════════════════════════════════════════════════════════════

test('positive → 0: capture state returns to false when the capturing layer closes', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	const id = overlayStore.open(<Text>cap</Text>, {
		capture: true,
		anchor: 'center',
	});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	overlayStore.close(id);
	await delay(200);

	expect(probe.isCaptured()).toBe(false);
});

// ════════════════════════════════════════════════════════════════════
// 1 → 2: opening a second capturing layer keeps capture true
// ════════════════════════════════════════════════════════════════════

test('1 → 2: opening a second capturing layer keeps capture true', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	overlayStore.open(<Text>cap1</Text>, {capture: true, anchor: 'center'});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	// Open a second capturing layer — capture should remain engaged.
	overlayStore.open(<Text>cap2</Text>, {capture: true, anchor: 'top-left'});
	await delay(200);

	expect(probe.isCaptured()).toBe(true);
});

// ════════════════════════════════════════════════════════════════════
// 2 → 1: closing one of two capturing layers keeps capture true
// ════════════════════════════════════════════════════════════════════

test('2 → 1: closing one of two capturing layers keeps capture true', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	const id1 = overlayStore.open(<Text>cap1</Text>, {
		capture: true,
		anchor: 'center',
	});
	await delay(200);
	overlayStore.open(<Text>cap2</Text>, {capture: true, anchor: 'top-left'});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	// Close one — capture should remain engaged (still one left).
	overlayStore.close(id1);
	await delay(200);

	expect(probe.isCaptured()).toBe(true);
});

// ════════════════════════════════════════════════════════════════════
// 2 → 0 (closeAll): capture releases
// ════════════════════════════════════════════════════════════════════

test('2 → 0: closeAll releases capture when all capturing layers close', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	overlayStore.open(<Text>cap1</Text>, {capture: true, anchor: 'center'});
	await delay(200);
	overlayStore.open(<Text>cap2</Text>, {capture: true, anchor: 'top-left'});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	overlayStore.closeAll();
	await delay(200);

	expect(probe.isCaptured()).toBe(false);
});

// ════════════════════════════════════════════════════════════════════
// Multiple open/close cycles: each cycle toggles correctly
// ════════════════════════════════════════════════════════════════════
//
// This is the headline test for ref correctness. If the previous-value
// ref is not updated correctly (e.g. two effects sharing a single ref
// but only one writes it, or a merged effect that reads stale data),
// the SECOND open→close cycle would fail to detect the 0→positive edge
// and capture would never re-engage.

test('multiple open/close cycles each toggle capture correctly', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	for (let cycle = 0; cycle < 4; cycle++) {
		const id = overlayStore.open(<Text>cap-{cycle}</Text>, {
			capture: true,
			anchor: 'center',
		});
		await delay(200);
		expect(probe.isCaptured()).toBe(true);

		overlayStore.close(id);
		await delay(200);
		expect(probe.isCaptured()).toBe(false);
	}
});

// ════════════════════════════════════════════════════════════════════
// Non-capturing layer does NOT engage capture
// ════════════════════════════════════════════════════════════════════

test('non-capturing layer does not engage capture', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	overlayStore.open(<Text>plain</Text>, {anchor: 'center'});
	await delay(200);

	expect(probe.isCaptured()).toBe(false);
});

// ════════════════════════════════════════════════════════════════════
// Mixed capturing and non-capturing layers
// ════════════════════════════════════════════════════════════════════

test('non-capturing layer added while capturing layer is open does not release capture', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	// Open a capturing layer.
	overlayStore.open(<Text>cap</Text>, {capture: true, anchor: 'center'});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	// Open a non-capturing layer on top — capture should remain engaged.
	overlayStore.open(<Text>plain</Text>, {anchor: 'top-left'});
	await delay(200);

	expect(probe.isCaptured()).toBe(true);
});

// ════════════════════════════════════════════════════════════════════
// Closing a non-capturing layer while a capturing layer is open
// keeps capture engaged; then closing the capturing layer releases it.
// ════════════════════════════════════════════════════════════════════

test('closing a non-capturing layer while a capturing layer is open keeps capture engaged', async () => {
	const {probe} = renderWithProbe();

	await delay(100);

	const capId = overlayStore.open(<Text>cap</Text>, {
		capture: true,
		anchor: 'center',
	});
	await delay(200);
	const plainId = overlayStore.open(<Text>plain</Text>, {anchor: 'top-left'});
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	// Close the non-capturing layer — capture should remain engaged.
	overlayStore.close(plainId);
	await delay(200);
	expect(probe.isCaptured()).toBe(true);

	// Now close the capturing layer — capture releases.
	overlayStore.close(capId);
	await delay(200);
	expect(probe.isCaptured()).toBe(false);
});

// ════════════════════════════════════════════════════════════════════
// Unmount while capturing does not throw
// ════════════════════════════════════════════════════════════════════

test('unmount while capturing does not throw', async () => {
	const {unmount} = renderWithProbe();

	await delay(100);

	overlayStore.open(<Text>cap</Text>, {capture: true, anchor: 'center'});
	await delay(200);

	expect(() => {
		unmount();
	}).not.toThrow();
});
