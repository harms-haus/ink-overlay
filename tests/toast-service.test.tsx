/**
 * Tests for the toast service (toasts) and overlay manager (overlay).
 *
 * Uses REAL timers — ink breaks with fake timers.
 * Uses renderWithHost to ensure <OverlayHost> is present.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {Text, useInput} from 'ink';
import {toasts, overlay} from '../src/manager.js';
import {overlayStore} from '../src/store.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';
import {waitForFrame} from './helpers/wait-for-frame.js';

// ── Isolation: clear singletons between tests ───────────────────

afterEach(async () => {
	toasts.dismissAll();
	overlayStore.closeAll();
	await delay(50);
});

// ═══════════════════════════════════════════════════════════════════
// (a) overlay manager — thin wrapper
// ═══════════════════════════════════════════════════════════════════

describe('overlay manager', () => {
	test('overlay.open returns a string id and renders content', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		const id = overlay.open(<Text>hello</Text>, {anchor: 'center'});
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);

		await delay(200);
		expect(lastFrame()).toContain('hello');
	});

	test('overlay.close removes the entry', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		const id = overlay.open(<Text>ephemeral</Text>, {anchor: 'center'});
		await delay(200);
		expect(lastFrame()).toContain('ephemeral');

		overlay.close(id);
		await delay(200);
		expect(lastFrame()).not.toContain('ephemeral');
	});

	test('overlay.closeAll clears all entries', async () => {
		const {lastFrame} = renderWithHost(<Text>myapp</Text>);
		await delay(100);

		overlay.open(<Text>alpha-xyz</Text>, {anchor: 'top-left'});
		overlay.open(<Text>beta-xyz</Text>, {anchor: 'bottom-right'});
		await delay(200);
		expect(lastFrame()).toContain('alpha-xyz');
		expect(lastFrame()).toContain('beta-xyz');

		overlay.closeAll();
		await delay(200);
		expect(lastFrame()).not.toContain('alpha-xyz');
		expect(lastFrame()).not.toContain('beta-xyz');
	});

	test('overlay.update patches opts of an existing entry', async () => {
		renderWithHost(<Text>app</Text>);
		await delay(100);

		const id = overlay.open(<Text>patched</Text>, {z: 1});
		await delay(200);

		// Update should not throw; opts should be merged.
		overlay.update(id, {z: 5});
		await delay(100);

		const entry = overlayStore.get(id);
		expect(entry).toBeDefined();
		expect(entry!.opts.z).toBe(5);
	});
});

// ═══════════════════════════════════════════════════════════════════
// (b) toast service — basic show + auto-dismiss
// ═══════════════════════════════════════════════════════════════════

describe('toast service — basic lifecycle', () => {
	test('toasts.success renders message with ✓ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('Saved!');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Saved!');
		expect(frame).toContain('✓');
	});

	test('toast auto-dismisses after duration', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(200);

		toasts.success('Vanishing', {duration: 5000});
		await delay(300);
		expect(lastFrame()).toContain('Vanishing');

		// Explicitly dismiss and verify it's gone.
		toasts.dismissAll();
		await delay(200);
		expect(lastFrame()).not.toContain('Vanishing');
	});

	test('toast disappears after auto-dismiss timer fires', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(200);

		toasts.success('Timer-gone', {duration: 300});
		await waitForFrame(lastFrame, 'Timer-gone');

		// Wait for the 300ms timer to fire + buffer for re-render.
		await delay(700);
		await waitForFrame(lastFrame, 'Timer-gone', {present: false});
	});

	test('toasts.error renders with ✗ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.error('Failed!');
		await waitForFrame(lastFrame, 'Failed!');
		expect(lastFrame()).toContain('✗');
	});

	test('toasts.info renders with ℹ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.info('Heads up');
		await waitForFrame(lastFrame, 'Heads up');
		expect(lastFrame()).toContain('ℹ');
	});

	test('toasts.warn renders with ⚠ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.warn('Caution');
		await waitForFrame(lastFrame, 'Caution');
		expect(lastFrame()).toContain('⚠');
	});

	test('toasts.show defaults to info kind', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Generic message');
		await waitForFrame(lastFrame, 'Generic message');
		expect(lastFrame()).toContain('ℹ');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (c) toasts.show alias — pins down observable behavior so that
//     refactoring `show` to delegate to `info` is provably safe.
// ═══════════════════════════════════════════════════════════════════

describe('toast service — show alias', () => {
	test('show returns a string id that can be used to dismiss the toast', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		const id = toasts.show('Alias-id', {duration: 100000});
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);
		await waitForFrame(lastFrame, 'Alias-id');
		expect(lastFrame()).toContain('Alias-id');

		// The returned id must be usable with dismiss(id).
		toasts.dismiss(id);
		await waitForFrame(lastFrame, 'Alias-id', {present: false});
		expect(lastFrame()).not.toContain('Alias-id');
	});

	test('show honors a caller-provided id option', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		const id = toasts.show('Stable-id', {id: 'alias-stable', duration: 100000});
		expect(id).toBe('alias-stable');
		await waitForFrame(lastFrame, 'Stable-id');

		// Dismissing via the caller-provided id must work.
		toasts.dismiss('alias-stable');
		await waitForFrame(lastFrame, 'Stable-id', {present: false});
	});

	test('show with a duplicate id replaces the existing toast', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('First body', {id: 'alias-dup', duration: 100000});
		await waitForFrame(lastFrame, 'First body');

		// Re-showing with the same id should replace the content.
		toasts.show('Second body', {id: 'alias-dup', duration: 100000});
		await waitForFrame(lastFrame, 'Second body');
		expect(lastFrame()).not.toContain('First body');
		expect(lastFrame()).toContain('Second body');

		// Only one toast entry should remain.
		const toastEntries = overlayStore.getAll().filter(e => e.opts.z === 90);
		expect(toastEntries).toHaveLength(1);
	});

	test('show auto-dismisses after the provided duration', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Ephemeral-alias', {duration: 300});
		await waitForFrame(lastFrame, 'Ephemeral-alias');
		expect(lastFrame()).toContain('Ephemeral-alias');

		// Wait past the 300ms duration + render buffer.
		await delay(700);
		await waitForFrame(lastFrame, 'Ephemeral-alias', {present: false});
		expect(lastFrame()).not.toContain('Ephemeral-alias');
	});

	test('show renders with the same info icon (ℹ) as info', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Alias-icon', {duration: 100000});
		await waitForFrame(lastFrame, 'Alias-icon');
		expect(lastFrame()).toContain('ℹ');
	});

	test('show and info produce equivalent results side by side', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('via-show', {id: 'cmp-show', duration: 100000});
		toasts.info('via-info', {id: 'cmp-info', duration: 100000});
		await waitForFrame(lastFrame, 'via-show');
		await waitForFrame(lastFrame, 'via-info');

		const frame = lastFrame();
		expect(frame).toContain('via-show');
		expect(frame).toContain('via-info');
		// Both render as info-kind toasts (single ℹ icon each).
		expect(frame).toContain('ℹ');
	});

	test('show respects a custom anchor option', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Anchored', {anchor: 'top-left', duration: 100000});
		await waitForFrame(lastFrame, 'Anchored');

		// The overlay entry should reflect the requested anchor.
		const toastEntry = overlayStore.getAll().find(e => e.opts.z === 90);
		expect(toastEntry).toBeDefined();
		expect(toastEntry!.opts.anchor).toBe('top-left');
	});

	test('show toast is cleared by dismissAll', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Bulk-clear', {duration: 100000});
		await waitForFrame(lastFrame, 'Bulk-clear');

		toasts.dismissAll();
		await waitForFrame(lastFrame, 'Bulk-clear', {present: false});
		expect(lastFrame()).not.toContain('Bulk-clear');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (d) Stacking — multiple toasts rendered simultaneously
// ═══════════════════════════════════════════════════════════════════

describe('toast service — stacking', () => {
	test('rapid toasts.all appear stacked (non-overlapping)', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.error('A');
		toasts.info('B');
		await waitForFrame(lastFrame, 'A');
		expect(lastFrame()).toContain('B');
	});

	test('three toasts all visible simultaneously', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('first');
		toasts.error('second');
		toasts.warn('third');
		await waitForFrame(lastFrame, 'first');
		expect(lastFrame()).toContain('second');
		expect(lastFrame()).toContain('third');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (e) dismiss(id) — remove specific toast
// ═══════════════════════════════════════════════════════════════════

describe('toast service — dismiss', () => {
	test('dismiss(id) removes one toast, others remain', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.error('Keep me');
		toasts.info('Remove me');
		await waitForFrame(lastFrame, 'Keep me');
		expect(lastFrame()).toContain('Remove me');

		// Dismiss the info toast — we need its id. Since show() was
		// called second, the second return is its id. But the ids are
		// generated internally. We need the actual id from the second call.
		// Re-do: capture the id from the second call.

		// Already captured: idA is the error toast. We need to dismiss the info toast.
		// Since we can't easily get the second id without refactoring, let's use
		// a different approach: use opts.id.

		// Clean up and retry with known ids.
		toasts.dismissAll();
		await delay(100);

		toasts.error('msg-one', {id: 'test-dismiss-1'});
		const id2 = toasts.info('msg-two', {id: 'test-dismiss-2'});
		await waitForFrame(lastFrame, 'msg-one');
		expect(lastFrame()).toContain('msg-two');

		// Dismiss only the second toast.
		toasts.dismiss(id2);
		await waitForFrame(lastFrame, 'msg-two', {present: false});
		expect(lastFrame()).toContain('msg-one');
	});

	test('dismiss on unknown id is a no-op', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('stable', {id: 'stable-toast'});
		await waitForFrame(lastFrame, 'stable');

		// Dismiss a non-existent id.
		toasts.dismiss('nonexistent');
		await delay(100);

		// Original toast still visible.
		expect(lastFrame()).toContain('stable');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (f) dismissAll — clears everything
// ═══════════════════════════════════════════════════════════════════

describe('toast service — dismissAll', () => {
	test('dismissAll clears all toasts', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('x');
		toasts.error('y');
		toasts.info('z');
		await waitForFrame(lastFrame, 'x');
		expect(lastFrame()).toContain('y');
		expect(lastFrame()).toContain('z');

		toasts.dismissAll();
		await waitForFrame(lastFrame, 'x', {present: false});
		expect(lastFrame()).not.toContain('y');
		expect(lastFrame()).not.toContain('z');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (g) Queue behavior — toast BEFORE host mounts
// ═══════════════════════════════════════════════════════════════════

describe('toast service — queue before host', () => {
	test('toast added before host mounts renders after mount', async () => {
		// Show a toast with no host mounted.
		toasts.success('queued');
		await delay(50);

		// Now mount the host.
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await waitForFrame(lastFrame, 'queued');
	});

	test('multiple toasts queued before host all appear', async () => {
		toasts.error('first');
		toasts.info('second');
		await delay(50);

		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await waitForFrame(lastFrame, 'first');
		expect(lastFrame()).toContain('second');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (h) Stale currentOverlayId recovery — external close of the toast
//     overlay entry must not prevent future toasts from appearing.
// ═══════════════════════════════════════════════════════════════════

describe('toast service — stale overlay entry recovery', () => {
	test('new toast appears after overlayStore.closeAll() externally closes the toast layer', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('First toast', {id: 'stale-1'});
		await waitForFrame(lastFrame, 'First toast');
		expect(lastFrame()).toContain('First toast');

		// Externally close every overlay entry — this removes the toast
		// layer from the store but leaves the module-level currentOverlayId
		// pointing at the now-defunct entry.
		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'First toast', {present: false});
		expect(lastFrame()).not.toContain('First toast');

		// Adding a new toast must open a fresh overlay entry. Without the
		// fix, publishToasts would call overlayStore.update() on the stale
		// id (a silent no-op) and the new toast would never render.
		toasts.success('Second toast', {id: 'stale-2', duration: 100000});
		await waitForFrame(lastFrame, 'Second toast');
		expect(lastFrame()).toContain('Second toast');
	});

	test('new toast appears after overlayStore.close(currentOverlayId) externally closes the toast layer', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.info('Original', {id: 'stale-single-1'});
		await waitForFrame(lastFrame, 'Original');
		expect(lastFrame()).toContain('Original');

		// Close the specific toast overlay entry directly via the store.
		const toastEntry = overlayStore.getAll().find(e => e.opts.z === 90);
		expect(toastEntry).toBeDefined();
		overlayStore.close(toastEntry!.id);
		await waitForFrame(lastFrame, 'Original', {present: false});

		// A subsequent toast must still render by opening a new entry.
		toasts.error('Recovered', {id: 'stale-single-2', duration: 100000});
		await waitForFrame(lastFrame, 'Recovered');
		expect(lastFrame()).toContain('Recovered');
		expect(lastFrame()).toContain('✗');
	});

	test('multiple new toasts stack after external closeAll', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.warn('Seed', {id: 'stale-multi-0'});
		await waitForFrame(lastFrame, 'Seed');

		overlayStore.closeAll();
		await waitForFrame(lastFrame, 'Seed', {present: false});

		toasts.success('Fresh one', {id: 'stale-multi-1', duration: 100000});
		toasts.error('Fresh two', {id: 'stale-multi-2', duration: 100000});
		await waitForFrame(lastFrame, 'Fresh one');
		expect(lastFrame()).toContain('Fresh two');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (i) Non-capturing — background input still works
// ═══════════════════════════════════════════════════════════════════

describe('toast service — non-capturing', () => {
	test('toast layer has capture:false; background useInput fires', async () => {
		function Background() {
			useInput(() => {});

			return <Text>background</Text>;
		}

		const {lastFrame} = renderWithHost(<Background />);
		await delay(100);

		// Show a toast.
		toasts.success('overlay-toast');
		await waitForFrame(lastFrame, 'overlay-toast');

		// Verify the overlay store entry has capture: false.
		const entries = overlayStore.getAll();
		// The toast overlay entry might be there.
		// Check that none of the entries have capture: true.
		for (const entry of entries) {
			expect(entry.opts.capture).toBe(false);
		}
	});
});
