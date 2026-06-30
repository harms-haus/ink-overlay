/**
 * Characterization tests for the three demo-scene fixes:
 *
 *  1. `demo/scenes/02-layer-anchors.tsx` — the `useGatedInput` handler
 *     uses a chain of `if (input === ...)` statements instead of a
 *     `switch`. The refactor converts the if-chain to a switch for
 *     consistency with every other scene (and the `unicorn/prefer-switch`
 *     lint rule). This must NOT change which keys do what.
 *
 *  2. `demo/scenes/06-popover.tsx` — the JSX wraps the `<Popover>` in
 *     `{placement !== undefined && (...)}`. `placement` is derived from
 *     `placements[placementIndex]` with modulo wrap, so it can never be
 *     `undefined`. Removing the guard must not change rendering.
 *
 *  3. `demo/scenes/10-animations.tsx` — two unreachable `!== undefined`
 *     checks on `transitionName` (one guarding the `<Layer>`, one in the
 *     `(preset)` label ternary). `transitionName` is from
 *     `transitions[transitionIndex]` with modulo wrap, so never
 *     undefined. Removing them must not change rendering.
 *
 *  4. `demo/app.tsx` — Scene 08's tags use inconsistent casing
 *     (`['toasts', 'Toast']`). The fix capitalizes `'toasts'` →
 *     `'Toasts'` to match the capitalized-word convention used by every
 *     other scene's tags.
 *
 * Items 1–3 are behavior-preserving refactors: these tests pin the
 * *current* observable behavior so the change is provably safe.
 *
 * Item 4 is a genuine fix (a visible string changes). The tag test asserts
 * the *corrected* (capitalized) casing; it documents the bug and passes
 * once the fix lands.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {delay} from './helpers/delay.js';
import {OverlayHost} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import Scene02LayerAnchors from '../demo/scenes/02-layer-anchors.js';
import Scene06Popover from '../demo/scenes/06-popover.js';
import Scene10Animations from '../demo/scenes/10-animations.js';

/** Reset the shared overlay singleton so tests are independent. */
function resetStores(): void {
	overlayStore.closeAll();
}

afterEach(async () => {
	await delay(50);
	resetStores();
});

/** Resolve a path relative to this test file. */
const here = dirname(fileURLToPath(import.meta.url));

// ════════════════════════════════════════════════════════════════════
// Scene 02 — Layer Anchors (if-chain → switch refactor)
//
// The handler reacts to five keys: a, x, p, o, g. Every one must keep
// working identically after the switch conversion. The existing
// `demo-scene-gated-input.test.tsx` covers a, x, o, and gating; these
// tests additionally pin the `p` (percent/numeric) and `g` (margin)
// keys, plus the full 9-anchor wrap-around cycle.
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 02 — all input keys (if-chain → switch)', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene02LayerAnchors).toBe('function');
	});

	test('renders initially in flexbox-anchor mode, anchor "center", overflow visible, margin none', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame()!;
		expect(frame).toContain('Mode: flexbox anchor');
		expect(frame).toContain('anchor: center');
		expect(frame).toContain('overflow: visible');
		expect(frame).toContain('margin: none');
		unmount();
	});

	test('key `a` cycles the anchor through all 9 positions with wrap-around', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		const expected = [
			'center', // initial (index 0) — already shown
			'top',
			'bottom',
			'left',
			'right',
			'top-left',
			'top-right',
			'bottom-left',
			'bottom-right',
		];

		// Index 0 is the initial; assert it then cycle through 1..8.
		expect(lastFrame()).toContain('anchor: center');

		for (let i = 1; i < expected.length; i++) {
			stdin.write('a');
			await delay(120);
			expect(lastFrame()).toContain(`anchor: ${expected[i]!}`);
		}

		// 9th press wraps back to index 0 (center).
		stdin.write('a');
		await delay(120);
		expect(lastFrame()).toContain('anchor: center');
		unmount();
	});

	test('key `x` toggles to explicit-offset mode and back to flexbox anchor', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).toContain('Mode: flexbox anchor');

		stdin.write('x');
		await delay(150);
		const explicitFrame = lastFrame()!;
		expect(explicitFrame).toContain('Mode: explicit offsets (numeric)');
		expect(explicitFrame).toContain('Explicit Offsets');
		expect(explicitFrame).toContain('offsets: top=5 left=10');

		stdin.write('x');
		await delay(150);
		expect(lastFrame()).toContain('Mode: flexbox anchor');
		expect(lastFrame()).not.toContain('Explicit Offsets');
		unmount();
	});

	test('key `p` toggles numeric ↔ percentage offsets (in explicit mode)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		// Enter explicit mode first (p is only meaningful there).
		stdin.write('x');
		await delay(150);
		expect(lastFrame()).toContain('offsets: top=5 left=10');
		expect(lastFrame()).toContain('Mode: explicit offsets (numeric)');

		// Toggle to percentage.
		stdin.write('p');
		await delay(150);
		const percentFrame = lastFrame()!;
		expect(percentFrame).toContain("offsets: top='20%' left='40%'");
		expect(percentFrame).toContain('Mode: explicit offsets (percentage)');

		// Toggle back to numeric.
		stdin.write('p');
		await delay(150);
		expect(lastFrame()).toContain('offsets: top=5 left=10');
		expect(lastFrame()).toContain('Mode: explicit offsets (numeric)');
		unmount();
	});

	test('key `o` toggles overflow visible ↔ hidden', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).toContain('overflow: visible');

		stdin.write('o');
		await delay(150);
		expect(lastFrame()).toContain('overflow: hidden');

		stdin.write('o');
		await delay(150);
		expect(lastFrame()).toContain('overflow: visible');
		unmount();
	});

	test('key `g` toggles margin none ↔ {top:2, left:2}', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		expect(lastFrame()).toContain('margin: none');

		stdin.write('g');
		await delay(150);
		expect(lastFrame()).toContain('margin: {top:2, left:2}');

		stdin.write('g');
		await delay(150);
		expect(lastFrame()).toContain('margin: none');
		unmount();
	});

	test('keys are independent: toggling overflow does not affect anchor index', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		// Cycle to "top".
		stdin.write('a');
		await delay(120);
		expect(lastFrame()).toContain('anchor: top');

		// Toggle overflow twice — anchor must remain "top".
		stdin.write('o');
		await delay(120);
		stdin.write('o');
		await delay(120);
		expect(lastFrame()).toContain('anchor: top');
		unmount();
	});

	test('an unrecognized key is a no-op (no state change)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene02LayerAnchors />
			</OverlayHost>,
		);
		await delay(300);

		stdin.write('z');
		await delay(150);

		const frame = lastFrame()!;
		expect(frame).toContain('anchor: center');
		expect(frame).toContain('Mode: flexbox anchor');
		expect(frame).toContain('overflow: visible');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 06 — Popover (remove unreachable `placement !== undefined` guard)
//
// `placement` is `placements[placementIndex]` with modulo wrap, so it is
// ALWAYS defined. The guard never short-circuits. These tests cycle
// through every placement index and verify the `<Popover>` content
// ("placement: X") renders at each one — proving the guard removal is
// behavior-preserving. The existing gated-input test covers `p`, `o`,
// and gating; these add full placement cycling plus the `d`/`x` keys.
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 06 — popover always renders (guard removal)', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene06Popover).toBe('function');
	});

	test('renders the anchor and open popover at every placement index', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		const expected = [
			'bottom',
			'top',
			'left',
			'right',
			'bottom-start',
			'bottom-end',
		];

		// Index 0 is initial.
		expect(lastFrame()).toContain('placement: bottom');

		for (let i = 1; i < expected.length; i++) {
			stdin.write('p');
			await delay(250);
			expect(lastFrame()).toContain(`placement: ${expected[i]!}`);
			// The popover content is ALWAYS rendered (guard never blocks).
			expect(lastFrame()).toContain('ANCHOR');
		}

		// 7th press wraps back to index 0.
		stdin.write('p');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');
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

	test('key `x` cycles crossOffset without closing the popover', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		// CrossOffset cycling must not dismiss the popover; it stays open
		// with the same placement throughout.
		stdin.write('x');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');

		stdin.write('x');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');

		// 4th `x` wraps crossOffset back to 0 — still open.
		stdin.write('x');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');
		unmount();
	});

	test('key `d` toggles collisionPadding without closing the popover', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('d');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');

		stdin.write('d');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');
		unmount();
	});

	test('key `f` toggles flip without closing the popover', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('f');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');

		stdin.write('f');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');
		unmount();
	});

	test('an unrecognized key is a no-op (popover stays open, placement unchanged)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene06Popover />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('z');
		await delay(250);
		expect(lastFrame()).toContain('placement: bottom');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// Scene 10 — Animations (remove unreachable `transitionName !== undefined`
// guards: the `<Layer>` wrapper guard and the `(preset)` label ternary)
//
// `transitionName` is `transitions[transitionIndex]` with modulo wrap, so
// it is ALWAYS defined. Both guards never short-circuit. These tests
// cycle through every transition index, verify the layer renders and the
// label reflects the preset name + "(preset)" suffix at each, and cover
// the custom-config toggle (where "(preset)" must be absent).
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 10 — layer always renders (guard removal)', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene10Animations).toBe('function');
	});

	test('initial state shows the "fade" preset with the "(preset)" suffix', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// transitionIndex starts at 1 ('fade'); not custom → "(preset)".
		expect(lastFrame()).toContain('current: fade (preset)');
		unmount();
	});

	test('key `a` cycles every transition; each shows the "(preset)" suffix', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// transitions = ['none','fade','slide-up','slide-down','slide-left',
		// 'slide-right']; initial index is 1 ('fade'). Each `a` advances by
		// (index+1) % 6, so from 'fade' the cycle is: slide-up, slide-down,
		// slide-left, slide-right, none, fade.
		const expected = [
			'slide-up',
			'slide-down',
			'slide-left',
			'slide-right',
			'none',
			'fade', // wrap back to index 1
		];

		for (const name of expected) {
			stdin.write('a');
			await delay(150);
			expect(lastFrame()).toContain(`current: ${name} (preset)`);
		}
		unmount();
	});

	test('key `c` toggles the custom config and removes the "(preset)" suffix', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// Initial: fade preset with suffix.
		expect(lastFrame()).toContain('current: fade (preset)');

		// Toggle custom — label changes, "(preset)" disappears.
		stdin.write('c');
		await delay(150);
		const customFrame = lastFrame()!;
		expect(customFrame).toContain('current: custom (slide-up, 200ms/frame)');
		expect(customFrame).not.toContain('(preset)');

		// Toggle back — the underlying preset name is restored with suffix.
		stdin.write('c');
		await delay(150);
		expect(lastFrame()).toContain('current: fade (preset)');
		unmount();
	});

	test('key `o` closes and reopens the animated layer', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// The "current:" status line always reflects the label.
		expect(lastFrame()).toContain('current: fade');

		stdin.write('o');
		await delay(400);
		// Status line persists even when the layer is closed.
		expect(lastFrame()).toContain('current: fade');
		expect(lastFrame()).toContain('Scene 10 — Animations');

		// Reopen.
		stdin.write('o');
		await delay(400);
		expect(lastFrame()).toContain('current: fade');
		unmount();
	});

	test('custom config persists its label after cycling while custom is active', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		// Enable custom.
		stdin.write('c');
		await delay(150);
		expect(lastFrame()).toContain('current: custom (slide-up, 200ms/frame)');

		// Cycling `a` while custom is active must keep the custom label
		// (the transition prop is customConfig regardless of the index).
		stdin.write('a');
		await delay(150);
		expect(lastFrame()).toContain('current: custom (slide-up, 200ms/frame)');
		expect(lastFrame()).not.toContain('(preset)');
		unmount();
	});

	test('an unrecognized key is a no-op (label unchanged)', async () => {
		resetStores();
		const {stdin, lastFrame, unmount} = render(
			<OverlayHost>
				<Scene10Animations />
			</OverlayHost>,
		);
		await delay(400);

		stdin.write('z');
		await delay(150);
		expect(lastFrame()).toContain('current: fade (preset)');
		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// demo/app.tsx — Scene 08 tag casing fix
//
// `demo/app.tsx` cannot be imported in tests (it calls `render(<App/>)`
// at module top level, which requires a real TTY). Instead we read the
// source and pin the scene-08 tags. The current code has the inconsistent
// `['toasts', 'Toast']`; the fix capitalizes to `['Toasts', 'Toast']`.
// This test asserts the CORRECTED casing.
// ════════════════════════════════════════════════════════════════════

describe('demo/app.tsx — Scene 08 tag casing', () => {
	const appSource = readFileSync(join(here, '..', 'demo', 'app.tsx'), 'utf8');

	test('Scene 08 tags use capitalized words (no lowercase "toasts")', () => {
		// Extract the scene 08 entry's tags array.
		const scene08Match = appSource.match(/id: '08',[^]*?tags: (\[[^\]]*\])/);
		expect(scene08Match, 'scene 08 entry must exist in app.tsx').not.toBeNull();
		const tagsLiteral = scene08Match![1]!;

		// The fix: 'toasts' → 'Toasts'. The lowercase form must be gone.
		expect(tagsLiteral).not.toContain("'toasts'");
		expect(tagsLiteral).toContain("'Toasts'");
	});
});
