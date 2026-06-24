/**
 * Integration tests for unmount cleanup and store lifecycle.
 *
 * §8 deliverable: unmounting the host with an active capturing layer
 * does not throw; closing layers programmatically empties overlayStore;
 * capture state returns to false after a capturing layer is closed.
 *
 * Uses REAL timers.
 */
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost, overlay, useInputCaptureState} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── Isolation ───────────────────────────────────────────────────────

afterEach(async () => {
	overlayStore.closeAll();
	await delay(50);
});

// ── (a) unmount host with active capturing layer — no throw ─────────
//
// Opening a capturing layer enables raw mode and focus trapping.
// Unmounting the host while a capturing layer is active must clean up
// without throwing.

test('unmount-cleanup: unmounting host with active capturing layer does not throw', async () => {
	const {lastFrame, unmount} = render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	// Open a capturing layer → capturingCount > 0.
	overlay.open(<Text>capturing</Text>, {capture: true, anchor: 'center'});
	await delay(200);

	// Verify the layer rendered.
	expect(lastFrame()).toContain('capturing');

	// Unmount should not throw.
	expect(() => {
		unmount();
	}).not.toThrow();
});

// ── (b) closing layers programmatically empties overlayStore ────────

test('unmount-cleanup: closing layers programmatically empties overlayStore', async () => {
	render(
		<OverlayHost>
			<Text>base</Text>
		</OverlayHost>,
	);

	await delay(100);

	const id1 = overlay.open(<Text>L1</Text>, {anchor: 'top-left'});
	const id2 = overlay.open(<Text>L2</Text>, {anchor: 'center'});
	const id3 = overlay.open(<Text>L3</Text>, {anchor: 'bottom-right'});

	await delay(200);
	expect(overlayStore.getAll()).toHaveLength(3);

	// Close each programmatically.
	overlay.close(id1);
	overlay.close(id2);
	overlay.close(id3);

	await delay(100);

	expect(overlayStore.getAll()).toHaveLength(0);
});

// ── (c) capture state returns to false after closing capturing layer ─
//
// A background component reads useInputCaptureState(). While a capturing
// layer is open it reports true; after closing it reports false again.

test('unmount-cleanup: useInputCaptureState returns to false after closing capturing layer', async () => {
	let captured = false;

	function Background() {
		captured = useInputCaptureState();
		return <Text>background</Text>;
	}

	render(
		<OverlayHost>
			<Background />
		</OverlayHost>,
	);

	await delay(100);

	// Initially not captured.
	expect(captured).toBe(false);

	// Open a capturing layer — captureDepth increments via FocusTrap.
	const id = overlay.open(<Text>modal</Text>, {
		capture: true,
		anchor: 'center',
	});
	await delay(200);

	expect(captured).toBe(true);

	// Close it — captureDepth returns to 0.
	overlay.close(id);
	await delay(200);

	expect(captured).toBe(false);
});
