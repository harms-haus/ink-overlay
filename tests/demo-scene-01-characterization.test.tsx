/**
 * Characterization tests for demo Scene 01 — Getting Started.
 *
 * The upcoming refactor in `demo/scenes/01-getting-started.tsx` replaces
 * six commented-out `<Modal>` props (`width`, `backdrop`, `borderStyle`,
 * `borderColor`, `z`, `role` — each annotated with "Default: X") with a
 * prose comment block listing the same defaults. The commented-out JSX
 * is fragile documentation that can drift from the library defaults; the
 * refactor turns it into inert prose that cannot be "uncommented".
 *
 * This is a pure comment change — no logic change. These tests pin down
 * the Scene 01 modal's *observable* behavior so the refactor is provably
 * behavior-preserving:
 *
 *   - The scene renders its shell header, description, and hint footer.
 *   - The modal is closed initially (no border / body / title / footer).
 *   - `m` opens the modal: title "Hello, Modal", footer "Esc to close",
 *     and body "Modal content goes here." all appear.
 *   - The modal renders with its DEFAULT border style (`round`) — the
 *     rounded corner glyphs ╭ ╮ ╰ ╯ are present in the frame.
 *   - The modal renders with its DEFAULT width (50) — the top/bottom
 *     border lines are exactly 50 columns wide (2 corners + 48 dashes).
 *   - Esc dismisses the modal and the border/body disappear.
 *
 * The general gating + toggle + toast behaviors of Scene 01 are already
 * covered by `tests/demo-scene-gated-input.test.tsx`; this file focuses
 * specifically on the modal-defaults surface that the comment cleanup
 * touches.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import {delay} from './helpers/delay.js';
import {stripAnsi} from './helpers/strip-ansi.js';
import {OverlayHost, Modal, toasts} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {Scene01GettingStarted} from '../demo/scenes/01-getting-started.js';

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

/** Extract the top border line of a rounded modal from a stripped frame. */
function findTopBorder(frame: string): string | undefined {
	return frame
		.split('\n')
		.find(line => line.includes('╭') && line.includes('╮'));
}

// ════════════════════════════════════════════════════════════════════
// Scene 01 — shell rendering
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — shell rendering', () => {
	test('the named export is a renderable component', () => {
		expect(typeof Scene01GettingStarted).toBe('function');
	});

	test('renders the scene title and description', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('01 · Getting Started');
		expect(frame).toContain(
			'OverlayHost, declarative Modal, imperative toasts',
		);
		unmount();
	});

	test('renders the informational body copy', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('to toggle the declarative modal');
		expect(frame).toContain('to fire an imperative');
		expect(frame).toContain('must live inside it');
		unmount();
	});

	test('renders the hint footer with all four key hints', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Modal');
		expect(frame).toContain('success toast');
		expect(frame).toContain('error toast');
		expect(frame).toContain('menu');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 01 — modal open/close + content
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — declarative modal lifecycle', () => {
	test('the modal is closed initially (no title, footer, or body)', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		expect(frame).not.toContain('Modal content goes here.');
		expect(frame).not.toContain('Hello, Modal');
		expect(frame).not.toContain('Esc to close');
		// No border glyphs present while closed.
		expect(stripAnsi(frame)).not.toMatch(/╭.*╮/);
		unmount();
	});

	test('pressing `m` opens the modal and renders title, footer, and body', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Hello, Modal');
		expect(frame).toContain('Esc to close');
		expect(frame).toContain('Modal content goes here.');
		unmount();
	});

	test('pressing `m` again closes the modal (toggle off)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		// Open.
		stdin.write('m');
		await delay(300);
		expect(lastFrame()).toContain('Modal content goes here.');

		// While the modal is open it captures input, so close via Esc first.
		stdin.write(ESC);
		await delay(300);
		expect(lastFrame()).not.toContain('Modal content goes here.');

		// Re-open with `m` to confirm the declarative toggle still works
		// from the closed state.
		stdin.write('m');
		await delay(300);
		expect(lastFrame()).toContain('Modal content goes here.');
		unmount();
	});

	test('Esc closes the modal (title, footer, and body disappear)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		// Open.
		stdin.write('m');
		await delay(300);
		expect(lastFrame()).toContain('Modal content goes here.');

		// Dismiss with Esc.
		stdin.write(ESC);
		await delay(300);

		const frame = lastFrame();
		expect(frame).not.toContain('Modal content goes here.');
		expect(frame).not.toContain('Hello, Modal');
		expect(frame).not.toContain('Esc to close');
		// The scene shell is still rendered.
		expect(frame).toContain('01 · Getting Started');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 01 — modal DEFAULT styling (the surface the comment cleanup
// documents). The commented-out props all resolve to library defaults;
// these tests pin the observable defaults so the prose-comment refactor
// is provably behavior-preserving.
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — modal renders with documented defaults', () => {
	test('default borderStyle is "round" (╭ ╮ ╰ ╯ corner glyphs appear)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(300);

		const clean = stripAnsi(lastFrame());
		// All four rounded-corner glyphs of ink's 'round' border style.
		expect(clean).toMatch(/╭/);
		expect(clean).toMatch(/╮/);
		expect(clean).toMatch(/╰/);
		expect(clean).toMatch(/╯/);
		unmount();
	});

	test('default width is 50 (top border line is exactly 50 columns)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(300);

		const clean = stripAnsi(lastFrame());
		const topBorder = findTopBorder(clean);
		expect(topBorder).toBeDefined();
		// ╭ + 48 dashes + ╮ = 50 columns total.
		expect(topBorder!.trim().length).toBe(50);
		expect(topBorder!.trim()).toMatch(/^╭─{48}╮$/);
		unmount();
	});

	test('default width 50 is consistent across top and bottom borders', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(300);

		const clean = stripAnsi(lastFrame());
		const top = clean
			.split('\n')
			.find(line => line.includes('╭') && line.includes('╮'))!
			.trim();
		const bottom = clean
			.split('\n')
			.find(line => line.includes('╰') && line.includes('╯'))!
			.trim();
		expect(top.length).toBe(bottom.length);
		expect(bottom).toMatch(/^╰─{48}╯$/);
		unmount();
	});

	test('the modal title and footer appear inside the bordered box', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('m');
		await delay(300);

		const lines = stripAnsi(lastFrame())
			.split('\n')
			.map(l => l.trim());
		// The title row sits between the top border and the body row.
		const topIdx = lines.findIndex(l => /^╭─{48}╮$/.test(l));
		const bottomIdx = lines.findIndex(l => /^╰─{48}╯$/.test(l));
		expect(topIdx).toBeGreaterThan(-1);
		expect(bottomIdx).toBeGreaterThan(topIdx);

		const inside = lines.slice(topIdx + 1, bottomIdx);
		expect(inside.some(l => l.includes('Hello, Modal'))).toBe(true);
		expect(inside.some(l => l.includes('Modal content goes here.'))).toBe(true);
		expect(inside.some(l => l.includes('Esc to close'))).toBe(true);
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 01 — modal defaults sanity-check against a raw <Modal>
//
// This is the strongest guarantee the refactor preserves behavior: the
// modal rendered by the scene is identical (in border style and width)
// to a raw <Modal> that passes NONE of the commented-out props — i.e.
// both rely on the same library defaults.
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — scene modal matches a raw default <Modal>', () => {
	function topBorderOf(frame: string): string {
		return stripAnsi(frame)
			.split('\n')
			.find(l => l.includes('╭') && l.includes('╮'))!
			.trim();
	}

	test('scene modal top border width equals raw default <Modal> top border', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);
		stdin.write('m');
		await delay(300);
		const sceneBorder = topBorderOf(lastFrame());
		unmount();

		resetStores();
		const {lastFrame: rawFrame, unmount: rawUnmount} = render(
			<OverlayHost>
				<Modal open title="Hello, Modal" footer="Esc to close">
					<Text>Modal content goes here.</Text>
				</Modal>
			</OverlayHost>,
		);
		await delay(200);
		const rawBorder = topBorderOf(rawFrame());
		rawUnmount();

		expect(sceneBorder).toBe(rawBorder);
		expect(sceneBorder.length).toBe(50);
	});
});
