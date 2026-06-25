/**
 * Characterization tests for stale `currentOverlayId` recovery via the
 * **dismissToast path** in `src/manager.tsx`.
 *
 * The task-2 fix added a guard in `publishToasts()`:
 *
 *   if (currentOverlayId === null || overlayStore.get(currentOverlayId) === undefined) {
 *       currentOverlayId = overlayStore.open(content, opts);
 *   } else {
 *       overlayStore.update(currentOverlayId, opts, content);
 *   }
 *
 * The existing `toast-service.test.tsx` "stale overlay entry recovery"
 * suite exercises the `addToast` path (show → external close → show).
 * However the **dismissToast path** — triggered by auto-dismiss timers,
 * `toasts.dismiss(id)`, eviction, and same-id replacement — also calls
 * `publishToasts()`. When a toast's dismiss fires AFTER the overlay
 * entry was externally removed, `currentOverlayId` is stale. These
 * tests pin down that the dismissToast path recovers correctly in both
 * the "map still has entries" (must re-open) and "map drained to empty"
 * (must reset id to null) branches.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {toasts} from '../src/manager.js';
import {overlayStore, type OverlayStore} from '../src/store.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';
import {waitForFrame} from './helpers/wait-for-frame.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Matches the combined toast-container overlay entry (TOAST_BASE_OPTS). */
function isToastEntry(entry: {
	opts: {z?: number; capture?: boolean; backdrop?: string};
}): boolean {
	return (
		entry.opts.z === 90 &&
		entry.opts.capture === false &&
		entry.opts.backdrop === 'none'
	);
}

function toastEntries(): ReturnType<OverlayStore['getAll']> {
	return overlayStore.getAll().filter(isToastEntry);
}

// ── Isolation ────────────────────────────────────────────────────────

afterEach(async () => {
	toasts.dismissAll();
	overlayStore.closeAll();
	await delay(50);
});

// ═══════════════════════════════════════════════════════════════════
// (1) Auto-dismiss timer (dismissToast) fires after external closeAll
//     while OTHER toasts remain in the map → publishToasts must
//     RE-OPEN a fresh entry via the stale-id guard.
// ═══════════════════════════════════════════════════════════════════

describe('dismissToast path — stale id recovery with remaining toasts', () => {
	test('auto-dismiss of one toast after external closeAll re-opens entry for the survivor', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		// Two toasts: A expires quickly, B survives a long time.
		toasts.success('short-lived', {id: 'short', duration: 300});
		toasts.error('survivor', {id: 'surv', duration: 100_000});
		await waitForFrame(lastFrame, 'short-lived');
		expect(lastFrame()).toContain('survivor');
		expect(toastEntries()).toHaveLength(1);

		// Externally wipe the overlay entry — currentOverlayId goes stale
		// but both toasts remain in the internal toastMap.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'survivor', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// When the short toast's auto-dismiss timer fires it triggers
		// dismissToast → publishToasts with a stale currentOverlayId but a
		// NON-EMPTY map. publishToasts must detect the stale id and OPEN a
		// fresh entry so the survivor re-appears.
		await delay(500); // let the 300ms timer fire + re-render settle
		await waitForFrame(lastFrame, 'survivor');
		expect(lastFrame()).toContain('survivor');
		expect(lastFrame()).not.toContain('short-lived');
		expect(toastEntries()).toHaveLength(1);
	});

	test('explicit toasts.dismiss after external closeAll re-opens entry for remaining toast', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.info('keep-me', {id: 'keep', duration: 100_000});
		toasts.warn('drop-me', {id: 'drop', duration: 100_000});
		await waitForFrame(lastFrame, 'keep-me');
		expect(lastFrame()).toContain('drop-me');

		// Stale the overlay id externally.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'keep-me', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// Explicit dismiss goes through dismissToast → publishToasts with a
		// stale id but the 'keep' toast still in the map. A fresh entry
		// must be opened.
		toasts.dismiss('drop');
		await waitForFrame(lastFrame, 'keep-me');
		expect(lastFrame()).toContain('keep-me');
		expect(lastFrame()).not.toContain('drop-me');
		expect(toastEntries()).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (2) Auto-dismiss timer (dismissToast) fires after external closeAll
//     draining the LAST toast → publishToasts must hit the empty-map
//     branch, call close() on the stale id (a no-op), and reset
//     currentOverlayId to null so a subsequent toast opens fresh.
// ═══════════════════════════════════════════════════════════════════

describe('dismissToast path — stale id recovery when map drains to empty', () => {
	test('auto-dismiss of the last toast after external closeAll resets state cleanly', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('only-one', {id: 'only', duration: 300});
		await waitForFrame(lastFrame, 'only-one');
		expect(toastEntries()).toHaveLength(1);

		// Stale the overlay id externally while the toast is still in the map.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'only-one', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// Let the auto-dismiss timer fire → dismissToast empties the map →
		// publishToasts sees currentOverlayId !== null and calls
		// overlayStore.close(staleId). That is a no-op (entry already gone)
		// and must NOT throw; currentOverlayId is reset to null.
		await delay(500);
		expect(toastEntries()).toHaveLength(0);

		// A subsequent toast must open a brand-new entry (proving the id
		// was reset, not left pointing at the stale id).
		toasts.error('after-drain', {id: 'after', duration: 100_000});
		await waitForFrame(lastFrame, 'after-drain');
		expect(lastFrame()).toContain('after-drain');
		expect(lastFrame()).toContain('✗');
		expect(toastEntries()).toHaveLength(1);
	});

	test('explicit dismiss of the last toast after external closeAll resets cleanly', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.info('solo', {id: 'solo', duration: 100_000});
		await waitForFrame(lastFrame, 'solo');
		expect(toastEntries()).toHaveLength(1);

		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'solo', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// Explicit dismiss drains the map via dismissToast → publishToasts
		// empty branch with a stale id. Must be a clean no-op close.
		expect(() => toasts.dismiss('solo')).not.toThrow();
		expect(toastEntries()).toHaveLength(0);

		// Next toast opens fresh.
		toasts.success('reborn', {id: 'reborn', duration: 100_000});
		await waitForFrame(lastFrame, 'reborn');
		expect(lastFrame()).toContain('reborn');
		expect(toastEntries()).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (3) Eviction via dismissToast while the overlay id is stale. When
//     addToast evicts the oldest toast (capacity overflow), each
//     eviction goes through dismissToast → publishToasts. If the id is
//     stale at that point, the subsequent publish for the newly added
//     toast must still open a fresh entry.
// ═══════════════════════════════════════════════════════════════════

describe('dismissToast path — eviction with stale id', () => {
	test('adding a 4th toast after external closeAll evicts and re-opens correctly', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		// Fill to capacity (DEFAULT_MAX_TOASTS = 3).
		toasts.success('t1', {id: 'e1', duration: 100_000});
		toasts.success('t2', {id: 'e2', duration: 100_000});
		toasts.success('t3', {id: 'e3', duration: 100_000});
		await waitForFrame(lastFrame, 't3');
		expect(toastEntries()).toHaveLength(1);
		expect(lastFrame()).toContain('t1');

		// Stale the overlay entry externally.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 't3', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// Adding a 4th toast evicts the oldest (e1) via dismissToast, which
		// calls publishToasts with a stale id during eviction, then
		// publishToasts again for the new toast. The final state must show
		// exactly one fresh entry containing t2, t3, t4 (t1 evicted).
		toasts.error('t4', {id: 'e4', duration: 100_000});
		await waitForFrame(lastFrame, 't4');
		expect(lastFrame()).toContain('t4');
		expect(lastFrame()).toContain('t2');
		expect(lastFrame()).toContain('t3');
		expect(lastFrame()).not.toContain('t1');
		expect(toastEntries()).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (4) Same-id replacement via dismissToast while stale. addToast with
//     an id that already exists calls dismissToast on the old entry
//     first. If the overlay id is stale at that moment, the replacement
//     must still publish correctly.
// ═══════════════════════════════════════════════════════════════════

describe('dismissToast path — same-id replacement with stale id', () => {
	test('re-showing the same id after external closeAll replaces and re-opens', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('original', {id: 'shared', duration: 100_000});
		await waitForFrame(lastFrame, 'original');
		expect(toastEntries()).toHaveLength(1);

		// Stale the overlay id.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'original', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// Re-use the same id. addToast sees the existing id in the map and
		// calls dismissToast('shared') → publishToasts (empty map, stale id
		// → no-op close + reset) before inserting the new entry and calling
		// publishToasts again (opens fresh). The new content must render.
		toasts.error('replacement', {id: 'shared', duration: 100_000});
		await waitForFrame(lastFrame, 'replacement');
		expect(lastFrame()).toContain('replacement');
		expect(lastFrame()).not.toContain('original');
		expect(toastEntries()).toHaveLength(1);
	});
});
