/**
 * Integration tests for z-stacking.
 *
 * §8 deliverable: layers with z={1,5,3} paint bottom→top and the
 * topmost capturing layer owns input.
 *
 * Uses REAL timers (ink breaks with fake timers).
 */
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost, Layer, overlay} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── Isolation: clear imperative store between tests ─────────────────

afterEach(async () => {
	overlayStore.closeAll();
	await delay(50);
});

// ── Test 1: paint order — z1 (bottom) → z3 → z5 (top) ──────────────
//
// Three layers at z=1 (top-left), z=3 (center), z=5 (center).
// z3 and z5 occupy the same center cells; z5 (higher z, painted last)
// overwrites z3. z1 anchored top-left is never overlapped.

test('z-stacking: all three layers render; topmost (z5) overpaints z3 at shared center cells', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
			<Layer z={1} anchor='top-left'>
				<Text>z1</Text>
			</Layer>
			<Layer z={3} anchor='center'>
				<Text>z3</Text>
			</Layer>
			<Layer z={5} anchor='center'>
				<Text>z5</Text>
			</Layer>
		</OverlayHost>,
	);

	await delay(300);

	const frame = lastFrame();

	// Z1 anchored top-left — never overlapped, always visible.
	expect(frame).toContain('z1');

	// Z5 (z=5, topmost) renders last at center — visible.
	expect(frame).toContain('z5');

	// Z3 (z=3) occupies the same center cells as z5 but is painted
	// beneath, so z5 overwrites it. Z3 must NOT be visible anywhere.
	expect(frame).not.toContain('z3');
});

// ── Test 2: input ownership — topmost capturing layer (z5) ──────────
//
// Three capturing layers at z=1, z=3, z=5 (opened imperatively so we
// can attach onDismiss spies). The host sorts by z ascending and mounts
// LayerRenderers in that order, so the LIFO input stack has z5 on top.
// Pressing Escape fires ONLY z5's handler (consumed) — z3 and z1 do not.

test('z-stacking: topmost capturing layer (z5) owns input on Escape', async () => {
	const dismissCalls: string[] = [];

	const {stdin} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	overlay.open(<Text>z1</Text>, {
		z: 1,
		capture: true,
		anchor: 'top-left',
		onDismiss() {
			dismissCalls.push('z1');
		},
	});
	overlay.open(<Text>z3</Text>, {
		z: 3,
		capture: true,
		anchor: 'center',
		onDismiss() {
			dismissCalls.push('z3');
		},
	});
	overlay.open(<Text>z5</Text>, {
		z: 5,
		capture: true,
		anchor: 'center',
		onDismiss() {
			dismissCalls.push('z5');
		},
	});

	await delay(200);

	// Simulate Escape — only the topmost capturing layer's handler
	// should fire (LIFO dispatch, consumed).
	stdin.write('\u001B');
	await delay(100);

	expect(dismissCalls).toEqual(['z5']);
});
