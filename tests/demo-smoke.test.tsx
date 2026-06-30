/**
 * Demo smoke tests — render every untested scene inside an
 * `<OverlayHost>` and verify its scene shell title/description appears
 * in the initial frame without throwing.
 *
 * The README describes the demo app as a "live regression test", but
 * most scenes had NO automated coverage. These smoke tests are the
 * baseline: each scene mounts, settles, and renders its known header
 * text. They fail loudly if a scene throws on mount, fails to render,
 * or loses its identifying header text.
 *
 * Scenes 09, 12, and 13 already have dedicated test coverage and are
 * intentionally omitted here.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';
import {overlayStore} from '../src/store.js';
import {toasts} from '../src/index.js';

// ── Scene imports ──────────────────────────────────────────────────
import {Scene01GettingStarted} from '../demo/scenes/01-getting-started.js';
import Scene02LayerAnchors from '../demo/scenes/02-layer-anchors.js';
import {Scene03Backdrop} from '../demo/scenes/03-backdrop.js';
import Scene04ZOrdering from '../demo/scenes/04-z-ordering.js';
import Scene05ModalDeepdive from '../demo/scenes/05-modal-deepdive.js';
import Scene06Popover from '../demo/scenes/06-popover.js';
import Scene07Tooltip from '../demo/scenes/07-tooltip.js';
import Scene08Toasts from '../demo/scenes/08-toasts.js';
import Scene10Animations from '../demo/scenes/10-animations.js';
import Scene11ImperativeOverlay from '../demo/scenes/11-imperative-overlay.js';

afterEach(async () => {
	// Reset the module-singleton stores so leftover overlays/toasts do
	// not leak between tests.
	toasts.dismissAll();
	overlayStore.closeAll();
	await delay(50);
});

describe('demo smoke tests — every scene renders its header', () => {
	test('Scene 01 — Getting Started renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene01GettingStarted />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('01 · Getting Started');
		expect(frame).toContain(
			'OverlayHost, declarative Modal, imperative toasts',
		);

		unmount();
	});

	test('Scene 02 — Layer Anchors renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene02LayerAnchors />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 02 — Layer Anchors');
		expect(frame).toContain(
			'Cycle all 9 anchors, toggle explicit offsets, overflow, and margin.',
		);

		unmount();
	});

	test('Scene 03 — Backdrop renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene03Backdrop />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 03 — Backdrop');
		expect(frame).toContain(
			'Overpaint backdrops: none / dim / opaque + custom color.',
		);

		unmount();
	});

	test('Scene 04 — Z-Ordering renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene04ZOrdering />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 04 — Z-Ordering');
		expect(frame).toContain(
			'Higher z paints on top. Toggle layers to see paint order.',
		);

		unmount();
	});

	test('Scene 05 — Modal Deep Dive renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene05ModalDeepdive />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 05 — Modal Deep Dive');
		expect(frame).toContain(
			'Modal props (except defaultOpen), role=alertdialog, and bare toast/tooltip Layers.',
		);

		unmount();
	});

	test('Scene 06 — Popover renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene06Popover />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 06 — Popover');
		expect(frame).toContain(
			'Element-anchored layer: flip, shift, offset & crossOffset.',
		);

		unmount();
	});

	test('Scene 07 — Tooltip renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene07Tooltip />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 07 — Tooltip');
		expect(frame).toContain(
			'Key-trigger, custom-key, and focus-driven tooltips',
		);

		unmount();
	});

	test('Scene 08 — Toasts renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene08Toasts />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 08 — Toasts');
		expect(frame).toContain(
			'Imperative toast service + presentational <Toast> component',
		);

		unmount();
	});

	test('Scene 10 — Animations renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene10Animations />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 10 — Animations');
		expect(frame).toContain(
			'Stepped style transitions: presets, custom config & exit.',
		);

		unmount();
	});

	test('Scene 11 — Imperative Overlay Service renders its title and description', async () => {
		const {lastFrame, unmount} = renderWithHost(<Scene11ImperativeOverlay />);
		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('Scene 11 — Imperative Overlay Service');
		expect(frame).toContain(
			'overlay.open / close / closeAll / update — no hooks required.',
		);

		unmount();
	});
});
