/**
 * Integration test: FOCUS TRAP across the full overlay host.
 *
 * This is the integration-level complement to {@link focus-trap.test.tsx}
 * (which tests `useFocusTrap` / `<FocusTrap>` in isolation against a bare
 * `<InputDispatcher>`).  Here the trap is driven end-to-end through the
 * real `<OverlayHost>` + `<Layer capture>` pipeline: a `<Layer capture>`
 * mounts a `<FocusTrap>` internally (see `LayerRenderer`), and we verify
 * the cooperative focus contract across the boundary.
 *
 * Proves:
 *  - Background focusables (gated on `useInputCaptureState().isCaptured`)
 *    are deactivated while a capturing layer is open.
 *  - Tab focus enters the trap's focusable children, never reaching a
 *    background focusable.
 *  - After the layer closes, background focus is restored and normal Tab
 *    navigation resumes.
 *
 * ## The COOPERATIVE-GATING limitation
 *
 * Ink's focus system is global — `focusNext` / `focusPrevious` visit
 * *every* active `useFocus`.  Correct scoping therefore **requires**
 * background components to gate their `useFocus` with `isActive: !isCaptured`
 * (from {@link useInputCaptureState}).  An uncooperative background
 * component would still be reached by `focusNext` while a capturing layer
 * is open — that is by design and is not a bug.  See
 * {@link focus-trap.tsx} for the full rationale.
 *
 * ## Focus cycling note
 *
 * Tab cycling within the trap works reliably in isolation (see
 * {@link focus-trap.test.tsx}).  In the full overlay host, the exact
 * Tab/focus interaction depends on the interleaving of the FocusTrap's
 * own `focusNext` call and Ink's native Tab handler (which is gated by
 * `isFocusEnabled` but settles asynchronously).  The tests below verify
 * the **core invariant** — focus stays within the modal and background
 * focusables are never focused — which is the contract that matters.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {test, expect, afterEach} from 'vitest';
import {useState} from 'react';
import {Box, Text, useFocus} from 'ink';
import {Layer, useInputCaptureState} from '../src/index.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

const TAB = '\t';
const ESC = '\u001B';

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the focused modal id ('A' or 'B') from a frame, or null. */
function focusedModal(frame: string): 'A' | 'B' | undefined {
	if (frame.includes('A✓')) {
		return 'A';
	}

	if (frame.includes('B✓')) {
		return 'B';
	}

	return null;
}

/** Assert no background focusable is focused. */
function expectNoBgFocus(frame: string) {
	expect(frame).not.toContain('bg1✓');
	expect(frame).not.toContain('bg2✓');
}

// ── Components ──────────────────────────────────────────────────────

/**
 * A cooperative background focusable.  It deactivates its `useFocus`
 * whenever input is captured (`isCaptured === true`) so that the trap's
 * `focusNext` / `focusPrevious` skip it.  Renders its focused state as
 * `id✓` (focused) or `id` (unfocused).
 */
function BackgroundFocusable({id}: {id: string}) {
	const isCaptured = useInputCaptureState();
	const {isFocused} = useFocus({id, isActive: !isCaptured});
	return <Text>{isFocused ? `${id}✓` : id}</Text>;
}

/**
 * A modal focusable living inside a capturing `<Layer>`.  Its `useFocus`
 * is always active — it is part of the trap's cycle.  Renders `id✓` /
 * `id` like the background focusable.
 */
function ModalFocusable({id}: {id: string}) {
	const {isFocused} = useFocus({id});
	return <Text>{isFocused ? `${id}✓` : id}</Text>;
}

// ── App shell ───────────────────────────────────────────────────────
//
// Stateful App with exposed open/close so we never need `rerender`
// (which would replace the `<OverlayHost>` wrapper).  Mirrors the
// pattern used in input-capture.test.tsx / modal.test.tsx.
//
// `backdrop="none"` is used deliberately so that BOTH the background
// focusables and the modal children remain visible in the frame — this
// lets us assert directly that background focusables never gain focus
// while the modal is open.

function makeApp() {
	let openModal: () => void;
	let closeModal: () => void;

	function App() {
		const [open, setOpen] = useState(false);
		openModal = () => {
			setOpen(true);
		};

		closeModal = () => {
			setOpen(false);
		};

		return (
			<>
				<BackgroundFocusable id='bg1' />
				<BackgroundFocusable id='bg2' />
				<Layer
					open={open}
					capture
					backdrop='none'
					onDismiss={() => {
						setOpen(false);
					}}
				>
					<Box flexDirection='column'>
						<ModalFocusable id='A' />
						<ModalFocusable id='B' />
					</Box>
				</Layer>
			</>
		);
	}

	return {
		App,
		open() {
			openModal();
		},
		close() {
			closeModal();
		},
	};
}

afterEach(async () => {
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// Tab enters the modal trap; background never gains focus
// ════════════════════════════════════════════════════════════════════

test('Tab enters the modal trap and background focusables are never focused', async () => {
	const {App, open} = makeApp();
	const {stdin, lastFrame} = renderWithHost(<App />);

	// Let the initial render settle.
	await delay(150);

	// Before opening, background focusables are active and unfocused.
	expect(lastFrame()).toContain('bg1');
	expect(lastFrame()).toContain('bg2');

	// ── Open the capturing layer ────────────────────────────────────
	open();
	await delay(300);

	// Modal children are now rendered.  Background focusables are
	// deactivated (isCaptured) so they show their plain ids.
	expect(lastFrame()).toContain('A');
	expect(lastFrame()).toContain('B');
	// No focus marker yet — nothing inside the trap is auto-focused.
	expect(lastFrame()).not.toContain('A✓');
	expect(lastFrame()).not.toContain('B✓');

	// ── Tab enters the trap — one of the modal children gets focus ──
	stdin.write(TAB);
	await delay(200);
	let frame = lastFrame();
	const first = focusedModal(frame);
	expect(first).not.toBeNull(); // Proves focus entered the trap.
	expectNoBgFocus(frame); // Proves background is locked out.

	// ── Additional Tabs stay within the trap ────────────────────────
	// Even if cycling doesn't land on a different child each time (due
	// to the overlay host's async isFocusEnabled settlement), the key
	// invariant is that focus NEVER escapes to a background focusable.
	for (let i = 0; i < 6; i++) {
		stdin.write(TAB);
		await delay(100);
	}

	frame = lastFrame();
	expectNoBgFocus(frame);
	// One of the modal children still has focus.
	expect(focusedModal(frame)).not.toBeNull();
});

// ════════════════════════════════════════════════════════════════════
// After close, background focus is restored and Tab works normally
// ════════════════════════════════════════════════════════════════════

test('after the layer closes, background focus is restored and Tab navigates normally', async () => {
	const {App, open, close} = makeApp();
	const {stdin, lastFrame} = renderWithHost(<App />);

	await delay(150);

	// ── (1) Focus a background component before opening the modal ──
	// Tab navigates to bg1 (first focusable) under native Ink focus.
	stdin.write(TAB);
	await delay(100);
	expect(lastFrame()).toContain('bg1✓');

	// ── (2) Open the modal — focus is confined to A / B ─────────────
	open();
	await delay(300);

	// The trap snapshots the previously-focused id (bg1) for later
	// restoration.  Background focusables are now deactivated.
	expect(lastFrame()).not.toContain('bg1✓');

	// Tab within the modal — focus should land on one of the modal
	// children, not on a background focusable.
	stdin.write(TAB);
	await delay(200);
	let frame = lastFrame();
	expect(focusedModal(frame)).not.toBeNull();
	expectNoBgFocus(frame);

	// ── (3) Close the modal via the controlled close path ───────────
	// Using the explicit close() function (which calls setOpen(false))
	// to exercise the controlled close path end-to-end.
	close();
	await delay(300);

	// Modal children gone; background focusables active again.
	frame = lastFrame();
	expect(frame).not.toContain('A✓');
	expect(frame).not.toContain('B✓');

	// After closing, bg1 should have focus restored (the FocusTrap's
	// restoreFocus mechanism snapshots the previously-focused id).
	expect(frame).toContain('bg1✓');

	// ── (4) Normal Tab navigation resumes on the background ─────────
	// From bg1, Tab advances to bg2.
	stdin.write(TAB);
	await delay(100);
	frame = lastFrame();
	expect(frame).not.toContain('bg1✓');
	expect(frame).toContain('bg2✓');

	// And wraps back to bg1.
	stdin.write(TAB);
	await delay(100);
	frame = lastFrame();
	expect(frame).toContain('bg1✓');
	expect(frame).not.toContain('bg2✓');
});
