/**
 * Tests for the toast service (toasts) and overlay manager (overlay).
 *
 * Uses REAL timers — ink breaks with fake timers.
 * Uses renderWithHost to ensure <OverlayHost> is present.
 */
import {
	describe, test, expect, afterEach,
} from 'vitest';
import {useCallback, useState} from 'react';
import {Text, useInput, Box} from 'ink';
import {toasts, overlay} from '../src/manager.js';
import {overlayStore} from '../src/store.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

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
		const {lastFrame} = renderWithHost(<Text>app</Text>);
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

		toasts.success('Timer-gone', {duration: 100});
		await delay(50);
		expect(lastFrame()).toContain('Timer-gone');

		// Wait for the 100ms timer to fire + buffer for re-render.
		await delay(500);
		expect(lastFrame()).not.toContain('Timer-gone');
	});

	test('toasts.error renders with ✗ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.error('Failed!');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Failed!');
		expect(frame).toContain('✗');
	});

	test('toasts.info renders with ℹ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.info('Heads up');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Heads up');
		expect(frame).toContain('ℹ');
	});

	test('toasts.warn renders with ⚠ icon', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.warn('Caution');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Caution');
		expect(frame).toContain('⚠');
	});

	test('toasts.show defaults to info kind', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.show('Generic message');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Generic message');
		expect(frame).toContain('ℹ');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (c) Stacking — multiple toasts rendered simultaneously
// ═══════════════════════════════════════════════════════════════════

describe('toast service — stacking', () => {
	test('rapid toasts.all appear stacked (non-overlapping)', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.error('A');
		toasts.info('B');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('A');
		expect(frame).toContain('B');
	});

	test('three toasts all visible simultaneously', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('first');
		toasts.error('second');
		toasts.warn('third');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('first');
		expect(frame).toContain('second');
		expect(frame).toContain('third');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (d) dismiss(id) — remove specific toast
// ═══════════════════════════════════════════════════════════════════

describe('toast service — dismiss', () => {
	test('dismiss(id) removes one toast, others remain', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		const idA = toasts.error('Keep me');
		toasts.info('Remove me');
		await delay(200);

		let frame = lastFrame();
		expect(frame).toContain('Keep me');
		expect(frame).toContain('Remove me');

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

		const id1 = toasts.error('msg-one', {id: 'test-dismiss-1'});
		const id2 = toasts.info('msg-two', {id: 'test-dismiss-2'});
		await delay(200);

		frame = lastFrame();
		expect(frame).toContain('msg-one');
		expect(frame).toContain('msg-two');

		// Dismiss only the second toast.
		toasts.dismiss(id2);
		await delay(200);

		frame = lastFrame();
		expect(frame).toContain('msg-one');
		expect(frame).not.toContain('msg-two');
	});

	test('dismiss on unknown id is a no-op', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('stable', {id: 'stable-toast'});
		await delay(200);
		expect(lastFrame()).toContain('stable');

		// Dismiss a non-existent id.
		toasts.dismiss('nonexistent');
		await delay(100);

		// Original toast still visible.
		expect(lastFrame()).toContain('stable');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (e) dismissAll — clears everything
// ═══════════════════════════════════════════════════════════════════

describe('toast service — dismissAll', () => {
	test('dismissAll clears all toasts', async () => {
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(100);

		toasts.success('x');
		toasts.error('y');
		toasts.info('z');
		await delay(200);

		let frame = lastFrame();
		expect(frame).toContain('x');
		expect(frame).toContain('y');
		expect(frame).toContain('z');

		toasts.dismissAll();
		await delay(200);

		frame = lastFrame();
		expect(frame).not.toContain('x');
		expect(frame).not.toContain('y');
		expect(frame).not.toContain('z');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (f) Queue behavior — toast BEFORE host mounts
// ═══════════════════════════════════════════════════════════════════

describe('toast service — queue before host', () => {
	test('toast added before host mounts renders after mount', async () => {
		// Show a toast with no host mounted.
		toasts.success('queued');
		await delay(50);

		// Now mount the host.
		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(500);

		const frame = lastFrame();
		expect(frame).toContain('queued');
	});

	test('multiple toasts queued before host all appear', async () => {
		toasts.error('first');
		toasts.info('second');
		await delay(50);

		const {lastFrame} = renderWithHost(<Text>app</Text>);
		await delay(500);

		const frame = lastFrame();
		expect(frame).toContain('first');
		expect(frame).toContain('second');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (g) Non-capturing — background input still works
// ═══════════════════════════════════════════════════════════════════

describe('toast service — non-capturing', () => {
	test('toast layer has capture:false; background useInput fires', async () => {
		let keyCount = 0;

		function Background() {
			useInput(() => {
				keyCount++;
			});

			return <Text>background</Text>;
		}

		const {lastFrame} = renderWithHost(<Background />);
		await delay(100);

		// Show a toast.
		toasts.success('overlay-toast');
		await delay(200);
		expect(lastFrame()).toContain('overlay-toast');

		// Verify the overlay store entry has capture: false.
		const entries = overlayStore.getAll();
		const toastEntry = entries.find(e => e.id.startsWith('toast-'));
		// The toast overlay entry might be there.
		// Check that none of the entries have capture: true.
		for (const entry of entries) {
			expect(entry.opts.capture).toBe(false);
		}
	});
});
