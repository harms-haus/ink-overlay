/**
 * Characterization tests for demo Scene 05 (Modal Deep Dive) and
 * Scene 11 (Imperative Overlay Service).
 *
 * These tests pin down the *observable render + input behavior* of the
 * two demo scenes, exercising every interactive code path and verifying
 * the rendered output.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';
import {overlayStore} from '../src/store.js';
import Scene05ModalDeepdive from '../demo/scenes/05-modal-deepdive.js';
import Scene11ImperativeOverlay from '../demo/scenes/11-imperative-overlay.js';
import type {RenderWithHostResult} from './helpers/render-with-host.js';

// ── Key sequences recognised by ink-testing-library ────────────────
const ESC = '\u001B';
const ENTER = '\r';

let instance: RenderWithHostResult | undefined;

afterEach(async () => {
	instance?.unmount();
	instance = undefined;
	// Scene 11 writes to the module-singleton overlay store; reset it so
	// leftover imperative overlays don't leak into the next test.
	overlayStore.closeAll();
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// Scene 05 — Modal Deep Dive
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 05 — Modal Deep Dive', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene05ModalDeepdive).toBe('function');
	});

	test('renders the scene shell header, description, and hint footer', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {lastFrame} = instance;
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Scene 05 — Modal Deep Dive');
		expect(frame).toContain(
			'Modal props (except defaultOpen), role=alertdialog, and bare toast/tooltip Layers.',
		);
		// Hint footer enumerates the five toggle keys + Esc → menu.
		expect(frame).toContain('standard modal');
		expect(frame).toContain('custom modal');
		expect(frame).toContain('alertdialog');
		expect(frame).toContain('role=toast');
		expect(frame).toContain('role=tooltip');
		expect(frame).toContain('menu');
	});

	test('renders the instructional copy', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {lastFrame} = instance;
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('to toggle each overlay variant');
		expect(frame).toContain(
			'The alertdialog blocks Esc and click-away — Ctrl+C exits the whole',
		);
	});

	test('no modal content is rendered before any key is pressed', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {lastFrame} = instance;
		await delay(300);

		const frame = lastFrame();
		expect(frame).not.toContain('Standard Modal');
		expect(frame).not.toContain('Custom Styled');
		expect(frame).not.toContain('Confirm Action');
		expect(frame).not.toContain("role='toast'");
		expect(frame).not.toContain("role='tooltip'");
	});

	// ── Key `1`: standard default-styled modal (role='dialog') ──────

	test('key `1` toggles the standard modal open (title + body appear)', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Closed initially.
		expect(lastFrame()).not.toContain('Standard Modal');

		stdin.write('1');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Standard Modal');
		expect(frame).toContain('Basic dialog. Esc or click-away dismisses.');
	});

	test('the standard modal dismisses via Esc (role dialog does NOT block escape)', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Open.
		stdin.write('1');
		await delay(200);
		expect(lastFrame()).toContain('Standard Modal');

		// Escape closes it.
		stdin.write(ESC);
		await delay(250);

		const frame = lastFrame();
		expect(frame).not.toContain('Standard Modal');
		expect(frame).not.toContain('Basic dialog. Esc or click-away dismisses.');
		// Scene chrome still present.
		expect(frame).toContain('Scene 05 — Modal Deep Dive');
	});

	// ── Key `2`: custom-styled modal (width, borderStyle, borderColor, footer) ──

	test('key `2` toggles the custom modal open with its footer and body', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('2');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Custom Styled');
		expect(frame).toContain('Press Esc to close'); // footer
		expect(frame).toContain('Custom width, border, and footer.');
	});

	test('the custom modal dismisses via Esc', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('2');
		await delay(200);
		expect(lastFrame()).toContain('Custom Styled');

		stdin.write(ESC);
		await delay(250);

		expect(lastFrame()).not.toContain('Custom Styled');
	});

	// ── Key `3`: alert dialog (role='alertdialog' blocks dismissal) ──

	test('key `3` toggles the alert dialog open with the blocked-dismissal footer', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Confirm Action');
		// The body text wraps inside the default-width (50) modal box, so we
		// assert short substrings that each fit on a single rendered line.
		expect(frame).toContain('Destructive confirmation.');
		expect(frame).toContain('both blocked.');
		expect(frame).toContain('Esc is blocked');
	});

	test('Esc does NOT dismiss the alert dialog (role alertdialog blocks escape)', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		await delay(200);
		expect(lastFrame()).toContain('Confirm Action');

		// Escape is blocked by role='alertdialog'.
		stdin.write(ESC);
		await delay(250);

		expect(lastFrame()).toContain('Confirm Action');
		expect(lastFrame()).toContain('Destructive confirmation.');
	});

	test('Enter dismisses the alert dialog via the in-modal useRegisterInput handler', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		await delay(200);
		expect(lastFrame()).toContain('Confirm Action');

		// Enter triggers AlertDialogDismiss (useRegisterInput handler that
		// fires even while the modal captures input).
		stdin.write(ENTER);
		await delay(250);

		const frame = lastFrame();
		expect(frame).not.toContain('Confirm Action');
		expect(frame).not.toContain('Destructive confirmation.');
		// Scene chrome still present.
		expect(frame).toContain('Scene 05 — Modal Deep Dive');
	});

	test('while a capturing modal is open the scene keys are gated off', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Open the alert dialog (capture=true → isCaptured true).
		stdin.write('3');
		await delay(200);
		expect(lastFrame()).toContain('Confirm Action');

		// Pressing `1` while captured must NOT open the standard modal.
		stdin.write('1');
		await delay(200);
		expect(lastFrame()).not.toContain('Standard Modal');

		// Clean up: close the alert dialog so the store/scene resets.
		stdin.write(ENTER);
		await delay(250);
	});

	// ── Keys `4` / `5`: bare toast / tooltip Layers (no capture) ────

	test('key `4` toggles the bare role=toast Layer (and keys stay active)', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('4');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain("A bare Layer with role='toast'");

		// The toast Layer does NOT capture, so the scene keys remain
		// active — toggling the tooltip with `5` still works while the
		// toast is showing.
		stdin.write('5');
		await delay(200);
		expect(lastFrame()).toContain("A bare Layer with role='tooltip'");
		expect(lastFrame()).toContain("A bare Layer with role='toast'");
	});

	test('key `5` toggles the bare role=tooltip Layer', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('5');
		await delay(200);

		expect(lastFrame()).toContain("A bare Layer with role='tooltip'");
	});

	test('pressing `4` again toggles the toast off', async () => {
		instance = renderWithHost(<Scene05ModalDeepdive />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('4');
		await delay(200);
		expect(lastFrame()).toContain("A bare Layer with role='toast'");

		stdin.write('4');
		await delay(200);
		expect(lastFrame()).not.toContain("A bare Layer with role='toast'");
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 11 — Imperative Overlay Service
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 11 — Imperative Overlay Service', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene11ImperativeOverlay).toBe('function');
	});

	test('renders the scene shell header, description, and hint footer', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {lastFrame} = instance;
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Scene 11 — Imperative Overlay Service');
		expect(frame).toContain(
			'overlay.open / close / closeAll / update — no hooks required.',
		);
		// Hint footer.
		expect(frame).toContain('open centered');
		expect(frame).toContain('open top');
		expect(frame).toContain('open capturing');
		expect(frame).toContain('update first');
		expect(frame).toContain('closeAll');
	});

	test('renders the instructional copy and a zero-count initial state', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {lastFrame} = instance;
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('to open a centred, dimmed overlay');
		expect(frame).toContain('to open a top-anchored overlay');
		expect(frame).toContain('to open a capturing overlay');
		expect(frame).toContain('to update the first overlay');
		expect(frame).toContain('to close all imperative overlays');
		// Live status row starts at zero.
		expect(frame).toContain('Open overlays: 0');
		expect(frame).toContain('Update count: 0');
	});

	test('key `1` opens a centred overlay and bumps the open count to 1', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('1');
		await delay(250);

		const frame = lastFrame();
		// The overlay content renders on top of its dim backdrop.
		expect(frame).toContain('Centered overlay #1');
		// The dim backdrop overpaints the scene body, so verify the live
		// count via the store directly (backdrop-independent).
		expect(overlayStore.getAll()).toHaveLength(1);
	});

	test('key `2` opens a top-anchored overlay', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('2');
		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('Top-anchored overlay');
		expect(frame).toContain('Open overlays: 1');
	});

	test('opening variant 1 then variant 2 yields an honest count of 2', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('1');
		await delay(200);
		stdin.write('2');
		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('Centered overlay');
		expect(frame).toContain('Top-anchored overlay');
		// Variant-1 has a dim backdrop that overpaints the scene body, so
		// verify the live count via the store.
		expect(overlayStore.getAll()).toHaveLength(2);
	});

	test('variant-1 cap: a fourth `1` evicts the oldest, keeping the count at 3', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Open three variant-1 overlays.
		stdin.write('1');
		await delay(150);
		stdin.write('1');
		await delay(150);
		stdin.write('1');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(3);

		// Opening a fourth evicts the oldest first (cap = 3).
		stdin.write('1');
		await delay(250);

		expect(overlayStore.getAll()).toHaveLength(3);
	});

	test('key `u` updates the first variant-1 overlay (patch + content swap)', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Open one variant-1 overlay.
		stdin.write('1');
		await delay(250);
		expect(lastFrame()).toContain('Centered overlay #1');

		// Update it: backdrop patched to opaque + content replaced.
		stdin.write('u');
		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('Updated content (update #1)');
		// Original content is gone (content was replaced, not appended).
		expect(frame).not.toContain('Centered overlay #1');
		// The overlay entry still exists (one entry) after the update.
		expect(overlayStore.getAll()).toHaveLength(1);
	});

	test('key `u` is a no-op when no variant-1 overlay exists (count stays 0)', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('u');
		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('Update count: 0');
		expect(frame).not.toContain('Updated content');
	});

	test('key `c` closes all overlays and resets the local tracking state', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		// Open a couple of overlays.
		stdin.write('1');
		await delay(200);
		stdin.write('2');
		await delay(250);
		expect(overlayStore.getAll()).toHaveLength(2);

		// Close all + reset.
		stdin.write('c');
		await delay(250);

		const frame = lastFrame();
		// After closeAll there are no backdrops, so the scene body is
		// visible again and the local mirror state is reset.
		expect(frame).toContain('Open overlays: 0');
		expect(frame).toContain('Update count: 0');
		expect(frame).not.toContain('Centered overlay');
		expect(frame).not.toContain('Top-anchored overlay');
		expect(overlayStore.getAll()).toHaveLength(0);
	});

	test('key `3` opens a capturing overlay that traps input', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		// The first capturing overlay triggers a raw-mode enable cycle
		// that needs a little longer to paint, so wait a bit more.
		await delay(400);

		const frame = lastFrame();
		expect(frame).toContain('Capturing overlay — input is trapped.');
		// The opaque backdrop overpaints the scene body, so verify the
		// live count via the store.
		expect(overlayStore.getAll()).toHaveLength(1);

		// While captured, the scene's own key handler is gated off
		// (isCaptured === true). Press `1` — a key the scene WOULD handle
		// (open a centred overlay) but the in-content dismiss handler
		// ignores (it only acts on Enter / `c` / Escape). The capturing
		// overlay must stay open and NO variant-1 overlay may be added.
		stdin.write('1');
		await delay(300);
		expect(lastFrame()).toContain('Capturing overlay — input is trapped.');
		expect(overlayStore.getAll()).toHaveLength(1);

		// Clean up via the in-content handler so the store resets.
		stdin.write(ENTER);
		await delay(300);
	});

	test('Enter dismisses the capturing overlay via the in-content useRegisterInput handler', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		await delay(400);
		expect(lastFrame()).toContain('Capturing overlay — input is trapped.');

		// Enter fires the CapturingOverlayDismiss LIFO handler.
		stdin.write(ENTER);
		await delay(300);

		const frame = lastFrame();
		expect(frame).not.toContain('Capturing overlay — input is trapped.');
		// Scene chrome still present.
		expect(frame).toContain('Scene 11 — Imperative Overlay Service');
	});

	test('`c` inside the capturing overlay also dismisses it (in-content handler)', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin, lastFrame} = instance;
		await delay(300);

		stdin.write('3');
		await delay(400);
		expect(lastFrame()).toContain('Capturing overlay — input is trapped.');

		stdin.write('c');
		await delay(300);

		// The in-content handler reads the id lazily and closes the overlay.
		expect(lastFrame()).not.toContain('Capturing overlay — input is trapped.');
	});

	test('unmounting the scene clears leftover imperative overlays (cleanup effect)', async () => {
		instance = renderWithHost(<Scene11ImperativeOverlay />);
		const {stdin} = instance;
		await delay(300);

		// Leave an overlay open, then unmount (simulating Esc → menu).
		stdin.write('1');
		await delay(250);
		expect(overlayStore.getAll().length).toBeGreaterThan(0);

		instance.unmount();
		instance = undefined;
		await delay(50);

		// The unmount effect calls overlay.closeAll().
		expect(overlayStore.getAll()).toHaveLength(0);
	});

	// Sanity guard: keep a baseline render used by helper imports.
	test('renders alongside arbitrary children without crashing', async () => {
		instance = renderWithHost(
			<>
				<Text>baseline</Text>
			</>,
		);
		await delay(100);
		expect(instance.lastFrame()).toContain('baseline');
	});
});
