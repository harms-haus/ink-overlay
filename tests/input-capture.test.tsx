/**
 * Integration test: INPUT-CAPTURE GUARANTEE (the §8 deliverable).
 *
 * This file is the headline proof of the input-capture contract:
 *
 *   When a `<Layer capture>` is open, a cooperative background component
 *   (one that gates its own `useInput` on `useInputCaptureState().isCaptured`)
 *   STOPS receiving input, while the capturing layer's own input handler
 *   continues to receive it.  When the layer closes, background input
 *   resumes.
 *
 * ## The COOPERATIVE-GATING limitation (documented here on purpose)
 *
 * Ink exposes a single shared input `EventEmitter`.  Every *active*
 * `useInput` hook fires on *every* keypress — there is no
 * `consumed`-boolean, propagation-stop, or priority mechanism in Ink's
 * public API.  The overlay framework's LIFO dispatcher routes its own
 * internal handlers (Esc dismiss, Tab cycling, backdrop) and exposes a
 * `useInputCaptureState().isCaptured` signal, but it **CANNOT block an
 * uncooperative standalone `useInput`**.
 *
 * Correct behaviour therefore **requires** background components to
 * cooperate by gating their own `useInput` (and `useFocus`) calls:
 *
 * ```tsx
 * const isCaptured = useInputCaptureState();
 * useInput(myHandler, {isActive: !isCaptured});
 * ```
 *
 * This is why the background list in this test passes `{isActive: !isCaptured}`.
 * An uncooperative background component (one that ignores `isCaptured`)
 * would keep receiving input regardless of an open capturing layer —
 * that is by design and is not a bug.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {test, expect, afterEach} from 'vitest';
import {useState} from 'react';
import {Text, useInput} from 'ink';
import {
	Layer,
	useInputCaptureState,
} from '../src/index.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// Escape + arrow escape sequences recognised by ink-testing-library.
const DOWN = '\u001B[B';
const UP = '\u001B[A';
const ESC = '\u001B';

// ── Background list component ───────────────────────────────────────
//
// A cooperative background component.  It gates its `useInput` with
// `{isActive: !isCaptured}` so that an open capturing layer blocks it.

function BackgroundList() {
	const isCaptured = useInputCaptureState();
	const [bgIndex, setBgIndex] = useState(1);

	useInput(
		(_input, key) => {
			if (key.upArrow) {
				setBgIndex(i => Math.max(0, i - 1));
			}

			if (key.downArrow) {
				setBgIndex(i => Math.min(2, i + 1));
			}
		},
		{isActive: !isCaptured},
	);

	return <Text>{`bg:${bgIndex}`}</Text>;
}

// ── Modal list component (lives inside a capturing <Layer>) ─────────
//
// Its `useInput` is always active.  Because the background component is
// gated out while this layer is open, only this handler responds to
// arrow keys.

function ModalList() {
	const [modalIndex, setModalIndex] = useState(1);

	useInput((_input, key) => {
		if (key.upArrow) {
			setModalIndex(i => Math.max(0, i - 1));
		}

		if (key.downArrow) {
			setModalIndex(i => Math.min(2, i + 1));
		}
	});

	return <Text>{`modal:${modalIndex}`}</Text>;
}

// ── App shell ───────────────────────────────────────────────────────
//
// Uses internal state + an exposed opener so we never need `rerender`
// (which would replace the <OverlayHost> wrapper).  This mirrors the
// pattern used in modal.test.tsx.

function makeApp() {
	let openLayer: () => void;
	let closeLayer: () => void;

	function App() {
		const [open, setOpen] = useState(false);
		openLayer = () => {
			setOpen(true);
		};

		closeLayer = () => {
			setOpen(false);
		};

		return (
			<>
				<BackgroundList />
				<Layer open={open} capture backdrop='opaque'>
					<ModalList />
				</Layer>
			</>
		);
	}

	return {
		App,
		open() {
			openLayer();
		},
		close() {
			closeLayer();
		},
	};
}

afterEach(async () => {
	await delay(50);
});

// ── Test: the full capture / release cycle ──────────────────────────

test('capturing layer blocks cooperative background input and releases on close', async () => {
	const {App, open, close} = makeApp();
	const {stdin, lastFrame} = renderWithHost(<App />);

	// Let the initial render settle.
	await delay(150);

	// ── (1) Before opening the layer, background responds to arrows ──
	expect(lastFrame()).toContain('bg:1');
	expect(lastFrame()).not.toContain('modal:');

	stdin.write(DOWN);
	await delay(100);
	expect(lastFrame()).toContain('bg:2');

	stdin.write(UP);
	await delay(100);
	expect(lastFrame()).toContain('bg:1');

	// Snapshot the current background index for later comparison.
	// Background is at bg:1 here (we just pressed UP from bg:2).
	expect(lastFrame()).toContain('bg:1');

	// ── (2) Open the capturing layer ─────────────────────────────────
	open();
	await delay(200);

	// Layer content is now visible.  The opaque backdrop overpaints the
	// background text, so we only assert the modal is showing.
	expect(lastFrame()).toContain('modal:1');

	// ── (3) Arrows now move the MODAL list, NOT the background ───────
	stdin.write(DOWN);
	await delay(100);
	expect(lastFrame()).toContain('modal:2');

	stdin.write(UP);
	await delay(100);
	expect(lastFrame()).toContain('modal:1');

	// Send several more down-arrows that WOULD move the background to
	// its maximum if the background were still receiving input.
	stdin.write(DOWN);
	await delay(100);
	stdin.write(DOWN);
	await delay(100);

	// ── (4) Close the layer (controlled close) ───────────────────────
	close();
	await delay(200);

	// Layer gone.  Critically, the background index must be UNCHANGED at
	// bg:1 — proving the arrows pressed while the layer was open did NOT
	// reach the (cooperative) background list.
	expect(lastFrame()).not.toContain('modal:');
	expect(lastFrame()).toContain('bg:1');

	// ── (5) Background input is restored ─────────────────────────────
	stdin.write(DOWN);
	await delay(100);
	expect(lastFrame()).toContain('bg:2');

	stdin.write(UP);
	await delay(100);
	expect(lastFrame()).toContain('bg:1');
});

// ── Test: Esc closes the capturing layer and restores background ────
//
// Exercises the onDismiss-driven close path end-to-end with the host.
// The LayerRenderer dismisses on Esc for a capturing, non-alertdialog
// layer; because the layer is uncontrolled-by-rerender here we wire
// `onDismiss` to close the internal state.

function makeEscDismissableApp() {
	let openLayer: () => void;
	let dismissals = 0;

	function App() {
		const [open, setOpen] = useState(false);
		openLayer = () => {
			setOpen(true);
		};

		return (
			<>
				<BackgroundList />
				<Layer
					open={open}
					capture
					backdrop='opaque'
					onDismiss={() => {
						dismissals++;
						setOpen(false);
					}}
				>
					<ModalList />
				</Layer>
			</>
		);
	}

	return {
		App,
		open() {
			openLayer();
		},
		getDismissals: () => dismissals,
	};
}

test('Esc closes a capturing layer and background input resumes', async () => {
	const {App, open, getDismissals} = makeEscDismissableApp();
	const {stdin, lastFrame} = renderWithHost(<App />);

	await delay(150);

	// Background starts responsive.
	expect(lastFrame()).toContain('bg:1');

	// Open the capturing layer.
	open();
	await delay(200);
	expect(lastFrame()).toContain('modal:1');

	// Esc dismisses the topmost dismissible capturing layer.
	stdin.write(ESC);
	await delay(200);

	expect(getDismissals()).toBe(1);
	// Layer is gone.
	expect(lastFrame()).not.toContain('modal:');

	// Background responds again.
	stdin.write(DOWN);
	await delay(100);
	expect(lastFrame()).toContain('bg:2');
});
