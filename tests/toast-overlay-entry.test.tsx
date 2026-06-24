/**
 * Characterization tests for the toast service's SINGLE-SHARED-ENTRY
 * invariant.
 *
 * `src/manager.tsx` keeps all active toasts in a single combined overlay
 * store entry (`currentOverlayId`). The now-removed test helpers
 * `_getToastOverlayId()` / `_resetToastOverlayId()` existed to inspect
 * that internal id. These tests characterise the *observable* behaviour
 * those helpers were meant to guard, by inspecting `overlayStore`
 * directly — so the helpers can be deleted safely.
 *
 * Invariants pinned down:
 *   1. While toasts are active there is exactly ONE overlay store entry
 *      that carries the toast-container opts (z:90, capture:false,
 *      backdrop:'none').
 *   2. The SAME entry id is reused across add/dismiss operations (the
 *      service updates in place rather than close+open flicker).
 *   3. When the toast map becomes empty the entry is removed from the
 *      store entirely.
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

/**
 * Predicate matching the combined toast-container overlay entry.
 *
 * The toast service opens its layer with `TOAST_BASE_OPTS`
 * (z:90, capture:false, backdrop:'none'), so we identify it by those
 * distinguishing opts rather than by id prefix (generateId() returns a
 * bare UUID when crypto.randomUUID is available).
 */
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
// (1) Exactly one entry while toasts are active
// ═══════════════════════════════════════════════════════════════════

describe('toast service — single shared overlay entry', () => {
	test('multiple active toasts share exactly ONE overlay store entry', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('one');
		toasts.error('two');
		toasts.info('three');
		await waitForFrame(lastFrame, 'three');

		// Despite three toasts, there is exactly one toast-container entry.
		expect(toastEntries()).toHaveLength(1);
	});

	test('a single toast also produces exactly one entry', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('solo');
		await waitForFrame(lastFrame, 'solo');

		expect(toastEntries()).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (2) The entry id is reused (update-in-place), not recreated
// ═══════════════════════════════════════════════════════════════════

describe('toast service — entry reuse across mutations', () => {
	test('adding a second toast reuses the existing overlay entry id', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('first', {id: 't-first'});
		await waitForFrame(lastFrame, 'first');
		expect(toastEntries()).toHaveLength(1);

		const idAfterFirst = toastEntries()[0]!.id;

		// Add a second toast — the overlay entry should be UPDATED, not
		// closed and re-opened, so the id must remain stable.
		toasts.error('second', {id: 't-second'});
		await waitForFrame(lastFrame, 'second');
		expect(toastEntries()).toHaveLength(1);

		const idAfterSecond = toastEntries()[0]!.id;
		expect(idAfterSecond).toBe(idAfterFirst);
	});

	test('dismissing one of several toasts keeps the same entry id', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('keep', {id: 'keep-id'});
		toasts.error('remove', {id: 'remove-id'});
		await waitForFrame(lastFrame, 'remove');
		expect(toastEntries()).toHaveLength(1);

		const idBefore = toastEntries()[0]!.id;

		toasts.dismiss('remove-id');
		await waitForFrame(lastFrame, 'remove', {present: false});
		expect(toastEntries()).toHaveLength(1);
		expect(lastFrame()).toContain('keep');

		const idAfter = toastEntries()[0]!.id;
		expect(idAfter).toBe(idBefore);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (3) Entry is removed when the toast map becomes empty
// ═══════════════════════════════════════════════════════════════════

describe('toast service — entry cleanup on empty', () => {
	test('dismissAll removes the toast entry from the overlay store', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('temp', {id: 'temp-id'});
		await waitForFrame(lastFrame, 'temp');
		expect(toastEntries()).toHaveLength(1);

		toasts.dismissAll();
		await waitForFrame(lastFrame, 'temp', {present: false});

		// The combined toast entry must be gone entirely.
		expect(toastEntries()).toHaveLength(0);
	});

	test('dismissing the last toast removes the entry from the overlay store', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('only', {id: 'only-id'});
		await waitForFrame(lastFrame, 'only');
		expect(toastEntries()).toHaveLength(1);

		toasts.dismiss('only-id');
		await waitForFrame(lastFrame, 'only', {present: false});

		expect(toastEntries()).toHaveLength(0);
	});

	test('after cleanup, showing a new toast opens a fresh entry', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('round-one', {id: 'r1'});
		await waitForFrame(lastFrame, 'round-one');
		const firstId = toastEntries()[0]!.id;

		toasts.dismissAll();
		await waitForFrame(lastFrame, 'round-one', {present: false});
		expect(toastEntries()).toHaveLength(0);

		// A subsequent toast must create a NEW entry (currentOverlayId was
		// reset to null when the map emptied).
		toasts.success('round-two', {id: 'r2'});
		await waitForFrame(lastFrame, 'round-two');
		expect(toastEntries()).toHaveLength(1);

		const secondId = toastEntries()[0]!.id;
		expect(secondId).not.toBe(firstId);
	});
});
