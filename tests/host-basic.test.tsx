/**
 * Tests for OverlayHost — the root provider component.
 *
 * Covers: basic rendering, declarative layer registration via context,
 * imperative layers via overlayStore, and cleanup between tests.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {
	test, expect, afterEach, vi,
} from 'vitest';
import {useEffect} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost} from '../src/host.js';
import {useOverlayHost} from '../src/host-context.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── Ink focus-manager spy ──────────────────────────────────────────
// Wrap useFocusManager so we can assert enableFocus() is called by
// OverlayHost's unmount-cleanup effect — something Ink's own useInput
// cleanup does NOT do, so a spy here isolates OverlayHost's contribution.

const mockEnableFocus = vi.hoisted(() => vi.fn());
const mockDisableFocus = vi.hoisted(() => vi.fn());

vi.mock('ink', async importOriginal => {
	const actual = await importOriginal<typeof import('ink')>();
	return {
		...actual,
		useFocusManager() {
			const fm = actual.useFocusManager();
			return {
				...fm,
				enableFocus(...arguments_: any[]) {
					mockEnableFocus(...arguments_);
					fm.enableFocus(...arguments_);
				},
				disableFocus(...arguments_: any[]) {
					mockDisableFocus(...arguments_);
					fm.disableFocus(...arguments_);
				},
			};
		},
	};
});

// ── Isolation: clear imperative store between tests ─────────────────

afterEach(async () => {
	overlayStore.closeAll();
	await delay(50);
});

// ── Test 1: basic rendering ─────────────────────────────────────────

test('renders children', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	expect(lastFrame()).toContain('base');
});

// ── Test 2: declarative layer via context ───────────────────────────

/**
 * Tiny component that registers a declarative layer on mount
 * via the overlay host context.
 */
function RegisterLayer() {
	const {registerLayer} = useOverlayHost();

	useEffect(() => {
		registerLayer({
			id: 'x',
			z: 0,
			capture: false,
			backdrop: 'none',
			content: <Text>overlay</Text>,
			overflow: 'hidden',
		});
	}, []);

	return null;
}

test('declarative layer registered via context is rendered', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
			<RegisterLayer />
		</OverlayHost>,
	);

	// Allow initial render + subscription + registerLayer effect to flush.
	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('base');
	expect(frame).toContain('overlay');
});

// ── Test 3: imperative layer via overlayStore ───────────────────────

test('imperative layer opened via overlayStore is rendered', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	// Open an imperative overlay.
	overlayStore.open(<Text>imp</Text>, {anchor: 'center'});

	// Allow subscription callback → bumpVersion → re-render.
	await delay(200);

	expect(lastFrame()).toContain('base');
	expect(lastFrame()).toContain('imp');
});

// ── Test 4: unmount cleanup while capturing layer is active ──────
//
// Verifies TWO independent cleanup paths fire when the host unmounts
// while a capturing layer is open:
//
//  1. Raw-mode: Ink's useInput cleanup calls setRawMode(false) AND
//     OverlayHost's unmount effect ALSO calls setRawMode(false) when
//     prevCapturingCountRef > 0. We spy on stdin.setRawMode to observe
//     this combined path.
//
//  2. Focus: OverlayHost's unmount effect calls enableFocus() — Ink's
//     useInput does NOT do this, so the mockEnableFocus spy isolates
//     OverlayHost's contribution.

test('raw mode is cleaned up on unmount while capturing layer is active', async () => {
	// Clear spies from any prior effects.
	mockEnableFocus.mockClear();

	const {lastFrame, unmount, stdin} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	// Open a capturing layer → capturingCount > 0.
	overlayStore.open(<Text>cap</Text>, {capture: true});
	await delay(200);

	// Verify layer rendered.
	expect(lastFrame()).toContain('cap');

	// Spy on setRawMode to verify cleanup on unmount.
	const rawModeCalls: boolean[] = [];
	const original = stdin.setRawMode;
	stdin.setRawMode = (mode: boolean) => {
		rawModeCalls.push(mode);
		original.call(stdin, mode);
	};

	// Clear enableFocus spy so we only see calls from the unmount cleanup
	// (not from any transient mount effects).
	mockEnableFocus.mockClear();

	// Unmount while capturing layer is active.
	unmount();
	await delay(100);

	// Ink's useInput cleanup + our unmount cleanup should have called
	// setRawMode(false) at least once.
	expect(rawModeCalls).toContain(false);

	// OverlayHost's unmount cleanup should have called enableFocus().
	// This is NOT done by Ink's useInput — only by OverlayHost's effect —
	// so it proves our cleanup path is live, not dead code.
	expect(mockEnableFocus).toHaveBeenCalled();

	// Restore.
	stdin.setRawMode = original;
});

// ── Test 5: z-ordering — declarative before imperative at same z ────

test('declarative layer renders before imperative layer at same z', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
			<RegisterLayer />
		</OverlayHost>,
	);

	// RegisterLayer registers a layer with content "overlay" at z=0 (centered).
	await delay(200);

	// Open imperative layer at the same z but anchored to top-left
	// so both texts render at different positions (both use
	// position:absolute flexbox centering now, so same-anchor
	// layers overlap visually).
	overlayStore.open(<Text>imp</Text>, {z: 0, anchor: 'bottom-right'});
	await delay(200);

	const frame = lastFrame();
	const declarativeIndex = frame.indexOf('overlay');
	const imperativeIndex = frame.indexOf('imp');

	expect(declarativeIndex).toBeGreaterThanOrEqual(0);
	expect(imperativeIndex).toBeGreaterThanOrEqual(0);
	expect(declarativeIndex).toBeLessThan(imperativeIndex);
});

// ── Test 6: imperative layer removed by closeAll ────────────────────

test('imperative layer disappears after closeAll', async () => {
	const {lastFrame} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	// Open then close.
	overlayStore.open(<Text>gone</Text>, {anchor: 'center'});
	await delay(200);
	expect(lastFrame()).toContain('gone');

	overlayStore.closeAll();
	await delay(200);

	expect(lastFrame()).not.toContain('gone');
	expect(lastFrame()).toContain('base');
});
