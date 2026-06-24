/**
 * Integration tests: DISMISS PATHS for capturing layers.
 *
 * Covers:
 *  (a) Esc closes the topmost dismissible capturing layer.
 *  (b) onBackdropInput fires for any non-special key on the backdrop.
 *  (c) Programmatic overlay.close(id) removes an imperative layer.
 *  (d) role="alertdialog" BLOCKS Esc dismiss (onDismiss NOT called).
 *  (e) Nested capturing layers — Esc closes only the topmost.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 *
 * ## Harness note
 *
 * `renderWithHost` wraps the tree in `<OverlayHost>` at render time, but
 * its `rerender` REPLACES that wrapper (it does not re-wrap).  Therefore
 * every test here drives open/close either through uncontrolled
 * `defaultOpen` + Esc/onDismiss, through a stateful App with an exposed
 * opener, or through the imperative `overlay` service — never via
 * `rerender`.
 */
import {
	test, expect, afterEach, vi,
} from 'vitest';
import {useState} from 'react';
import {Text} from 'ink';
import {
	Layer,
	overlay,
} from '../src/index.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

const ESC = '\u001B';

afterEach(async () => {
	// Ensure no imperative overlays leak between tests.
	overlay.closeAll();
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// (a) Esc closes the topmost dismissible capturing layer
// ════════════════════════════════════════════════════════════════════

test('(a) Esc closes a dismissible capturing layer and fires onDismiss', async () => {
	const onDismiss = vi.fn();

	const {stdin, lastFrame} = renderWithHost(
		<Layer capture backdrop='opaque' onDismiss={onDismiss}>
			<Text>esc-me</Text>
		</Layer>,
	);

	await delay(200);
	expect(lastFrame()).toContain('esc-me');

	stdin.write(ESC);
	await delay(200);

	expect(onDismiss).toHaveBeenCalledOnce();
	// Uncontrolled layer self-closes after onDismiss.
	expect(lastFrame()).not.toContain('esc-me');
});

// ════════════════════════════════════════════════════════════════════
// (b) onBackdropInput fires for any non-special key on the backdrop
// ════════════════════════════════════════════════════════════════════

test('(b) onBackdropInput fires for a normal key and can close the layer', async () => {
	const onBackdropInput = vi.fn();

	function App() {
		const [open, setOpen] = useState(true);
		return (
			<Layer
				open={open}
				capture
				backdrop='opaque'
				onBackdropInput={() => {
					onBackdropInput();
					setOpen(false);
				}}
			>
				<Text>backdrop-target</Text>
			</Layer>
		);
	}

	const {stdin, lastFrame} = renderWithHost(<App />);

	await delay(200);
	expect(lastFrame()).toContain('backdrop-target');

	// A normal alphabetic key hits the backdrop path (not Esc, not Tab).
	stdin.write('x');
	await delay(200);

	expect(onBackdropInput).toHaveBeenCalledOnce();
	// The consumer wired onBackdropInput → setOpen(false).
	expect(lastFrame()).not.toContain('backdrop-target');
});

// ════════════════════════════════════════════════════════════════════
// (c) Programmatic overlay.close(id)
// ════════════════════════════════════════════════════════════════════

test('(c) overlay.close(id) removes an imperative capturing layer', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
		</>,
	);

	await delay(150);

	const id = overlay.open(<Text>programmatic</Text>, {capture: true});
	await delay(200);
	expect(lastFrame()).toContain('programmatic');

	overlay.close(id);
	await delay(200);

	expect(lastFrame()).not.toContain('programmatic');
});

// ════════════════════════════════════════════════════════════════════
// (d) role="alertdialog" BLOCKS Esc dismiss
// ════════════════════════════════════════════════════════════════════

test('(d) role="alertdialog" blocks Esc — onDismiss NOT called, layer stays', async () => {
	const onDismiss = vi.fn();

	const {stdin, lastFrame} = renderWithHost(
		<Layer capture backdrop='opaque' role='alertdialog' onDismiss={onDismiss}>
			<Text>blocked</Text>
		</Layer>,
	);

	await delay(200);
	expect(lastFrame()).toContain('blocked');

	// Esc is consumed by the LayerRenderer but onDismiss is suppressed for
	// alertdialog, so the layer must remain open.
	stdin.write(ESC);
	await delay(200);

	expect(onDismiss).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('blocked');
});

// ════════════════════════════════════════════════════════════════════
// (e) Nested capturing layers — Esc closes only the topmost
// ════════════════════════════════════════════════════════════════════

test('(e) nested capturing layers — Esc closes only the topmost layer', async () => {
	const onDismissBottom = vi.fn();
	const onDismissTop = vi.fn();

	// Both layers are uncontrolled (defaultOpen=true).  The second-declared
	// <Layer> mounts/registers its LayerRenderer AFTER the first, so its
	// input handler sits on top of the LIFO stack and receives Esc first.
	const {stdin, lastFrame} = renderWithHost(
		<>
			<Layer capture backdrop='opaque' onDismiss={onDismissBottom}>
				<Text>bottom-layer</Text>
			</Layer>
			<Layer capture backdrop='opaque' onDismiss={onDismissTop}>
				<Text>top-layer</Text>
			</Layer>
		</>,
	);

	await delay(250);
	expect(lastFrame()).toContain('top-layer');

	// One Esc dismisses only the topmost layer.
	stdin.write(ESC);
	await delay(250);

	expect(onDismissTop).toHaveBeenCalledOnce();
	expect(onDismissBottom).not.toHaveBeenCalled();

	// The top layer self-closed; the bottom layer remains open.
	expect(lastFrame()).not.toContain('top-layer');
	expect(lastFrame()).toContain('bottom-layer');

	// A second Esc now dismisses the (now-topmost) bottom layer.
	stdin.write(ESC);
	await delay(250);

	expect(onDismissBottom).toHaveBeenCalledOnce();
	expect(lastFrame()).not.toContain('bottom-layer');
});

// ════════════════════════════════════════════════════════════════════
// (f) Backdrop key dismiss defaults to onDismiss for role='dialog'
// ════════════════════════════════════════════════════════════════════

test('(f) role="dialog" with NO onBackdropInput: pressing a key dismisses via onDismiss', async () => {
	const onDismiss = vi.fn();

	const {stdin, lastFrame} = renderWithHost(
		<Layer capture backdrop='opaque' role='dialog' onDismiss={onDismiss}>
			<Text>dialog-body</Text>
		</Layer>,
	);

	await delay(200);
	expect(lastFrame()).toContain('dialog-body');

	// Press a normal alphabetic key (not Esc, not Tab).
	// With the effectiveBackdropInput default, this should dismiss via
	// onDismiss — even though onBackdropInput was never provided.
	stdin.write('x');
	await delay(200);

	expect(onDismiss).toHaveBeenCalledOnce();
	// Uncontrolled layer self-closes after onDismiss.
	expect(lastFrame()).not.toContain('dialog-body');
});

// ════════════════════════════════════════════════════════════════════
// (g) role="alertdialog" does NOT dismiss on backdrop key press
// ════════════════════════════════════════════════════════════════════

test('(g) role="alertdialog" with NO onBackdropInput: pressing a key does NOT dismiss', async () => {
	const onDismiss = vi.fn();

	const {stdin, lastFrame} = renderWithHost(
		<Layer capture backdrop='opaque' role='alertdialog' onDismiss={onDismiss}>
			<Text>alert-body</Text>
		</Layer>,
	);

	await delay(200);
	expect(lastFrame()).toContain('alert-body');

	// Press a normal alphabetic key. alertdialog must block — no
	// effectiveBackdropInput defaults for alertdialog.
	stdin.write('x');
	await delay(200);

	expect(onDismiss).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('alert-body');
});
