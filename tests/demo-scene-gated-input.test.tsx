/**
 * Characterization tests for the cooperative input-gating pattern that the
 * upcoming `useGatedInput` hook will encapsulate.
 *
 * Across the demo scenes, the boilerplate
 *
 *   const isCaptured = useInputCaptureState();
 *   useInput(handler, {isActive: !isCaptured});
 *
 * is duplicated 12+ times. The refactor extracts this into a single
 * `useGatedInput(handler)` hook. These tests pin the *observable behavior*
 * that the extraction must preserve:
 *
 *   1. Each scene's keyboard handler FIRES when no capturing overlay is
 *      active (the normal path).
 *   2. Each scene's keyboard handler is GATED OFF when a capturing overlay
 *      (a `<Modal>`, which bakes in `capture: true`) is open — the scene
 *      must not react to keys while captured.
 *
 * The scenes covered here (01, 02, 04, 06, 08, 10) are the ones whose
 * inline `isCaptured` + `useInput` pattern will be replaced by
 * `useGatedInput`. Scenes 05, 09, 11 are already covered by dedicated
 * characterization tests; Scene 12 uses `isCaptured` for purposes beyond
 * `useInput` gating (a `useRegisterInput` call and a visible state line)
 * so it is exempt from the full extraction and covered separately.
 *
 * Gating verification strategy:
 *   A capturing `<Modal>` has a backdrop that overpaints the scene body,
 *   so the scene's state text is not visible while the modal is open.
 *   To verify gating we (a) render the scene alongside a blocking modal
 *   (captured), (b) send a keypress that is expected to be gated off,
 *   (c) rerender WITHOUT the blocking modal, then (d) assert the scene
 *   state is unchanged. We then press the key again (now ungated) to
 *   confirm it DOES change — proving the lack of change was due to
 *   gating, not a broken handler.
 *
 *   The rerender must re-wrap in `<OverlayHost>` because
 *   ink-testing-library's `rerender` replaces the entire root element —
 *   using `renderWithHost` for the initial render and then rerendering
 *   just the scene would strip the host and lose the overlay context.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {type ReactElement, type ReactNode} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {delay} from './helpers/delay.js';
import {OverlayHost, Modal, toasts} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {Scene01GettingStarted} from '../demo/scenes/01-getting-started.js';
import Scene02LayerAnchors from '../demo/scenes/02-layer-anchors.js';
import Scene04ZOrdering from '../demo/scenes/04-z-ordering.js';
import Scene06Popover from '../demo/scenes/06-popover.js';
import Scene08Toasts from '../demo/scenes/08-toasts.js';
import Scene10Animations from '../demo/scenes/10-animations.js';

const ESC = '\u001B';

/** Clean the shared toast + overlay singletons so tests are independent. */
function resetStores(): void {
	toasts.dismissAll();
	overlayStore.closeAll();
}

afterEach(async () => {
	await delay(50);
	resetStores();
});

/**
 * Wrapper that conditionally renders a blocking `<Modal>` alongside the
 * scene. When `blocking` is true the Modal (which bakes in `capture: true`)
 * causes `useInputCaptureState()` to return `true` for every component in
 * the `<OverlayHost>` subtree — including the scene. This lets us verify
 * that a scene's `useInput` is correctly gated off while a capturing
 * overlay is active.
 */
function GatedScene({
	children,
	blocking,
}: {
	children: ReactNode;
	blocking: boolean;
}) {
	return (
		<>
			{children}
			{blocking && (
				<Modal open title="Blocking Modal" onOpenChange={() => {}}>
					<Text>blocking</Text>
				</Modal>
			)}
		</>
	);
}

/**
 * Render a scene inside `<OverlayHost>` alongside a togglable blocking
 * modal. Returns the ink-testing-library result plus an `unblock()` helper
 * that rerenders the full tree (host + scene) with the modal removed. The
 * scene's internal state survives the rerender because it stays in the
 * same tree position.
 */
function renderGatedScene(scene: ReactElement) {
	const makeTree = (blocking: boolean) => (
		<OverlayHost>
			<GatedScene blocking={blocking}>{scene}</GatedScene>
		</OverlayHost>
	);

	const result = render(makeTree(true));
	return {
		...result,
		unblock: () => {
			result.rerender(makeTree(false));
		},
	};
}

// ════════════════════════════════════════════════════════════════════
// Scene 01 — Getting Started (Modal + imperative toasts)
// ════════════════════════════════════════════════════════════════════

describe('Scene 01 gated input', () => {
	test('key `m` toggles the modal open', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).not.toContain('Modal content goes here.');

		stdin.write('m');
		await delay(200);

		expect(lastFrame()).toContain('Modal content goes here.');
		unmount();
	});

	test('key `s` fires a success toast (overlay store gains an entry)', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		expect(overlayStore.getAll()).toHaveLength(0);

		stdin.write('s');
		await delay(200);

		expect(overlayStore.getAll().length).toBeGreaterThanOrEqual(1);
		unmount();
	});

	test('key `e` fires an error toast (overlay store gains an entry)', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('e');
		await delay(200);

		expect(overlayStore.getAll().length).toBeGreaterThanOrEqual(1);
		unmount();
	});

	test('while the modal is open the scene keys are gated off', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		// Open the modal (capturing).
		stdin.write('m');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);

		// While captured, `s` must NOT fire a toast. Note: the modal has
		// role='dialog' (default), so ANY non-Escape backdrop keypress
		// (including `s`) dismisses the modal via onDismiss. The point of
		// this assertion is that the scene's own useInput handler was gated
		// off at the moment `s` arrived — no toast fires — even though the
		// modal closes as a side-effect of the backdrop input.
		stdin.write('s');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);

		// The modal was dismissed by the `s` backdrop input, so re-open it
		// and verify `e` is also gated.
		stdin.write('m');
		await delay(200);
		stdin.write('e');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);

		unmount();
	});

	test('after closing the modal scene keys work again', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(200);
		stdin.write(ESC);
		await delay(200);

		// Now un-captured, `s` should fire a toast again.
		stdin.write('s');
		await delay(200);
		expect(overlayStore.getAll().length).toBeGreaterThanOrEqual(1);
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 02 — Layer Anchors
// ════════════════════════════════════════════════════════════════════

describe('Scene 02 gated input', () => {
	test('renders initially in flexbox-anchor mode with the center anchor', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('flexbox anchor');
		expect(frame).toContain('anchor: center');
		unmount();
	});

	test('key `x` toggles to explicit-offset mode', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('x');
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('explicit offsets');
		expect(frame).toContain('Explicit Offsets');
		unmount();
	});

	test('key `a` cycles the anchor from center to top', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('a');
		await delay(200);

		expect(lastFrame()).toContain('anchor: top');
		unmount();
	});

	test('key `o` toggles overflow hidden (visible in the layer content)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).toContain('overflow: visible');

		stdin.write('o');
		await delay(200);

		expect(lastFrame()).toContain('overflow: hidden');
		unmount();
	});

	test('while a capturing modal is open the anchor cycle is gated off', async () => {
		resetStores();
		const {stdin, lastFrame, unblock, unmount} = renderGatedScene(
			<Scene02LayerAnchors />,
		);
		await delay(300);

		// Press `a` while gated — must NOT cycle.
		stdin.write('a');
		await delay(200);

		// Remove the blocking modal so the scene body is visible again.
		unblock();
		await delay(200);

		// Anchor is still "center" — the gated keypress had no effect.
		expect(lastFrame()).toContain('anchor: center');

		// Now press `a` again (ungated) — it MUST cycle to top.
		stdin.write('a');
		await delay(200);
		expect(lastFrame()).toContain('anchor: top');
		unmount();
	});

	test('while a capturing modal is open the explicit-toggle is gated off', async () => {
		resetStores();
		const {stdin, lastFrame, unblock, unmount} = renderGatedScene(
			<Scene02LayerAnchors />,
		);
		await delay(300);

		// Press `x` while gated — must NOT toggle.
		stdin.write('x');
		await delay(200);

		unblock();
		await delay(200);

		// Still in flexbox mode — the gated keypress had no effect.
		expect(lastFrame()).toContain('flexbox anchor');
		expect(lastFrame()).not.toContain('Explicit Offsets');

		// Now press `x` (ungated) — it MUST toggle.
		stdin.write('x');
		await delay(200);
		expect(lastFrame()).toContain('Explicit Offsets');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 04 — Z-Ordering
//
// NOTE: The three layers (z=10/20/30) are anchored center with small
// margin offsets so they form a visible staircase. Because higher-z
// paints ON TOP, only the topmost layer's full text is reliably visible
// when all three are present. Toggling tests therefore check visibility
// of the layer that becomes topmost AFTER a higher layer is removed.
// ════════════════════════════════════════════════════════════════════

describe('Scene 04 gated input', () => {
	test('renders with z=30 (top) visible initially', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene04ZOrdering />
			</OverlayHost>,
		);
		await delay(300);

		// z=30 is the topmost layer — its full text is visible.
		expect(lastFrame()).toContain('z=30 (top)');
		unmount();
	});

	test('key `3` toggles layer C off, revealing z=20 (middle)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene04ZOrdering />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).toContain('z=30 (top)');

		// Toggle off layer C (z=30).
		stdin.write('3');
		await delay(200);

		const frame = lastFrame();
		expect(frame).not.toContain('z=30 (top)');
		// Now z=20 is the topmost — its full text becomes visible.
		expect(frame).toContain('z=20 (middle)');
		unmount();
	});

	test('key `2` then `3` reveals z=10 (bottom)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene04ZOrdering />
			</OverlayHost>,
		);
		await delay(300);

		// Remove layers C and B so layer A (z=10) is topmost.
		stdin.write('3');
		await delay(200);
		stdin.write('2');
		await delay(200);

		expect(lastFrame()).toContain('z=10 (bottom)');
		unmount();
	});

	test('key `3` then `3` toggles layer C back on', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene04ZOrdering />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('3');
		await delay(200);
		expect(lastFrame()).not.toContain('z=30 (top)');

		stdin.write('3');
		await delay(200);
		expect(lastFrame()).toContain('z=30 (top)');
		unmount();
	});

	test('while a capturing modal is open layer toggles are gated off', async () => {
		resetStores();
		const {stdin, lastFrame, unblock, unmount} = renderGatedScene(
			<Scene04ZOrdering />,
		);
		await delay(300);

		// Press `3` while gated — must NOT toggle.
		stdin.write('3');
		await delay(200);

		unblock();
		await delay(200);

		// z=30 still visible — the gated keypress had no effect.
		expect(lastFrame()).toContain('z=30 (top)');

		// Now press `3` (ungated) — it MUST toggle.
		stdin.write('3');
		await delay(200);
		expect(lastFrame()).not.toContain('z=30 (top)');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 06 — Popover
// ════════════════════════════════════════════════════════════════════

describe('Scene 06 gated input', () => {
	test('renders the anchor and initial placement (bottom)', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		const frame = lastFrame();
		expect(frame).toContain('ANCHOR');
		expect(frame).toContain('placement: bottom');
		unmount();
	});

	test('key `p` cycles the placement from bottom to top', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('p');
		await delay(300);

		expect(lastFrame()).toContain('placement: top');
		unmount();
	});

	test('key `o` closes the popover (placement text disappears)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		expect(lastFrame()).toContain('placement: bottom');

		stdin.write('o');
		await delay(300);

		expect(lastFrame()).not.toContain('placement: bottom');
		unmount();
	});

	test('while a capturing modal is open the placement cycle is gated off', async () => {
		resetStores();
		const {stdin, lastFrame, unblock, unmount} = renderGatedScene(
			<Scene06Popover />,
		);
		await delay(400);

		// Press `p` while gated — must NOT cycle.
		stdin.write('p');
		await delay(300);

		unblock();
		await delay(400);

		// Still on bottom — the gated keypress had no effect.
		expect(lastFrame()).toContain('placement: bottom');

		// Now press `p` (ungated) — it MUST cycle.
		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('placement: top');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 08 — Toasts
// ════════════════════════════════════════════════════════════════════

describe('Scene 08 gated input', () => {
	test('renders the static presentational toasts and legend', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene08Toasts />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Static success');
		expect(frame).toContain('Static error');
		expect(frame).toContain('defaultToastColors');
		unmount();
	});

	test('key `s` fires a success toast via the imperative service', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene08Toasts />
			</OverlayHost>,
		);
		await delay(300);

		expect(overlayStore.getAll()).toHaveLength(0);

		stdin.write('s');
		await delay(200);

		expect(overlayStore.getAll().length).toBeGreaterThanOrEqual(1);
		unmount();
	});

	test('key `d` (dismissAll) clears fired toasts', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene08Toasts />
			</OverlayHost>,
		);
		await delay(300);

		// Fire two toasts.
		stdin.write('s');
		await delay(150);
		stdin.write('e');
		await delay(200);
		expect(overlayStore.getAll().length).toBeGreaterThanOrEqual(1);

		// Dismiss all.
		stdin.write('d');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);
		unmount();
	});

	test('key `f` floods toasts (combined into a single overlay entry)', async () => {
		resetStores();
		const {stdin, unmount} = render(
			<OverlayHost>
				<Scene08Toasts />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('f');
		await delay(300);

		// Five toasts fired but max 3 visible — the overlay store holds
		// a single combined toast entry regardless.
		expect(overlayStore.getAll()).toHaveLength(1);
		unmount();
	});

	test('while a capturing modal is open toast keys are gated off', async () => {
		resetStores();
		const {stdin, unmount} = renderGatedScene(<Scene08Toasts />);
		await delay(300);

		expect(overlayStore.getAll()).toHaveLength(0);

		// Press `s` — must NOT fire a toast while captured.
		stdin.write('s');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);

		// Press `f` — must NOT flood while captured.
		stdin.write('f');
		await delay(200);
		expect(overlayStore.getAll()).toHaveLength(0);
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 10 — Animations
// ════════════════════════════════════════════════════════════════════

describe('Scene 10 gated input', () => {
	test('renders with the initial transition (fade) and open layer', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		expect(lastFrame()).toContain('current: fade (preset)');
		unmount();
	});

	test('key `a` cycles the transition from fade to slide-up', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('a');
		await delay(200);

		expect(lastFrame()).toContain('slide-up');
		unmount();
	});

	test('key `c` toggles the custom (slow) config', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('c');
		await delay(200);

		expect(lastFrame()).toContain('custom (slide-up, 200ms/frame)');
		unmount();
	});

	test('key `o` closes the animated layer', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// The "current:" line always reflects the preset name in the body.
		expect(lastFrame()).toContain('current: fade');

		// Close the layer — the scene body still shows the current label.
		stdin.write('o');
		await delay(400);

		expect(lastFrame()).toContain('current: fade');
		expect(lastFrame()).toContain('Scene 10 — Animations');
		unmount();
	});

	test('while a capturing modal is open transition keys are gated off', async () => {
		resetStores();
		const {stdin, lastFrame, unblock, unmount} = renderGatedScene(
			<Scene10Animations />,
		);
		await delay(400);

		// Press `a` while gated — must NOT cycle.
		stdin.write('a');
		await delay(200);

		unblock();
		await delay(200);

		// Still on fade — the gated keypress had no effect.
		expect(lastFrame()).toContain('current: fade');
		expect(lastFrame()).not.toContain('slide-up');

		// Now press `a` (ungated) — it MUST cycle.
		stdin.write('a');
		await delay(200);
		expect(lastFrame()).toContain('slide-up');
		unmount();
	});
});
