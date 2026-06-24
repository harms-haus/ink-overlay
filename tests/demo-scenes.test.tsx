/**
 * Characterization tests for the rendered text output of demo scenes 12
 * and 13.
 *
 * These tests pin down the *observable rendered output* — specifically the
 * apostrophe (') and ampersand (&) characters that currently enter the JSX
 * via HTML entities (`&apos;`, `&amp;`). JSX decodes those entities to the
 * same characters at render time, so the rendered terminal text is
 * identical whether the source uses entities or literal characters.
 *
 * They guard a refactor that replaces the HTML entities with their literal
 * character equivalents: the rendered output must not change.
 */

import {describe, test, expect} from 'vitest';
import {render} from 'ink-testing-library';
import {OverlayHost} from '../src/index.js';
import Scene12InputFocus from '../demo/scenes/12-input-focus.tsx';
import Scene13Runtime from '../demo/scenes/13-runtime.tsx';

// Render is asynchronous in ink-testing-library; a short tick lets the
// first frame (and subsequent re-renders after input) flush.
const flush = () =>
	new Promise<void>(resolve => {
		setTimeout(resolve, 80);
	});

// ── Scene 13 ────────────────────────────────────────────────────────

describe('Scene 13 — Runtime & Environments (rendered text)', () => {
	test('renders the "Limitations & graceful degradation" header with a literal ampersand', async () => {
		const {lastFrame} = render(<Scene13Runtime />);
		await flush();

		// Currently the source uses `&amp;`; JSX decodes it to `&`.
		// After the refactor (literal `&`) the output must be identical.
		expect(lastFrame()).toContain('Limitations & graceful degradation');
	});

	test('renders the InputDispatcher apostrophe text with a literal apostrophe', async () => {
		const {lastFrame} = render(<Scene13Runtime />);
		await flush();

		// The terminal wraps this sentence across two lines, so we
		// assert only the portion that carries the apostrophe.
		// Currently the source uses `&apos;`; JSX decodes it to `'`.
		// After the refactor (literal `'`) the output must be identical.
		expect(lastFrame()).toContain("InputDispatcher's");
	});

	test('renders a scene title with a literal ampersand', async () => {
		const {lastFrame} = render(<Scene13Runtime />);
		await flush();

		expect(lastFrame()).toContain('13 · Runtime & Environments');
	});

	// ── CHARACTERIZATION FOR: if-chain → switch refactor ─────────
	//
	// The `setLastBackdropKey` call lives BEFORE the branching logic
	// (if-chain or switch). It must fire for EVERY input that reaches
	// `onBackdropInput`, including 'b' and 'c' themselves. These tests
	// pin that the last-key line is updated for 'b' and 'c' (not just for
	// "other" keys), so converting the if-chain to a switch is provably
	// behavior-preserving.

	test('the `b` keypress is recorded in the backdrop-input line (setLastBackdropKey fires for branch keys too)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene03Backdrop />);
		await delay(300);

		// Press 'b' — it must cycle the kind AND record itself.
		stdin.write('b');
		await delay(150);
		const frame = lastFrame();
		expect(frame).toContain('Backdrop kind: dim');
		expect(frame).toContain('backdrop input: "b"');
	});

	test('the `c` keypress is recorded in the backdrop-input line (setLastBackdropKey fires for branch keys too)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene03Backdrop />);
		await delay(300);

		// Press 'c' — it must toggle color AND record itself.
		stdin.write('c');
		await delay(150);
		const frame = lastFrame();
		expect(frame).toContain('customColor: #2d1b4e');
		expect(frame).toContain('backdrop input: "c"');
	});

	test('the backdrop-input line reflects only the MOST RECENT keypress in a mixed sequence', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene03Backdrop />);
		await delay(300);

		// b (cycle to dim) → c (toggle color) → x (no-op key)
		stdin.write('b');
		await delay(150);
		stdin.write('c');
		await delay(150);
		stdin.write('x');
		await delay(150);

		const frame = lastFrame();
		// Kind advanced once (from b), color toggled ON (from c), then x
		// neither cycles nor toggles but IS the last recorded key.
		expect(frame).toContain('Backdrop kind: dim');
		expect(frame).toContain('customColor: #2d1b4e');
		expect(frame).toContain('backdrop input: "x"');
	});
});

// ── Scene 12 ────────────────────────────────────────────────────────

describe('Scene 12 — Input & Focus (rendered text)', () => {
	test('gating modal renders the scene apostrophe text with a literal apostrophe', async () => {
		const {stdin, lastFrame} = render(
			<OverlayHost>
				<Scene12InputFocus />
			</OverlayHost>,
		);
		await flush();

		// Press `m` to open the gating modal (sub-demo 1).
		stdin.write('m');
		await flush();

		const frame = lastFrame();

		// Currently the source uses `&apos;`; JSX decodes it to `'`.
		// After the refactor (literal `'`) the output must be identical.
		expect(frame).toContain("The scene's j/k keys do nothing");
	});

	test('nested inner modal renders the outer modal apostrophe text with a literal apostrophe', async () => {
		const {stdin, lastFrame} = render(
			<OverlayHost>
				<Scene12InputFocus />
			</OverlayHost>,
		);
		await flush();

		// Press `n` to open the nested modal pair (sub-demo 4).
		stdin.write('n');
		await flush();

		const frame = lastFrame();

		// Currently the source uses `&apos;`; JSX decodes it to `'`.
		// After the refactor (literal `'`) the output must be identical.
		expect(frame).toContain("The outer modal's handler never sees the Esc");
	});

	test('scene header renders with a literal ampersand', async () => {
		const {lastFrame} = render(
			<OverlayHost>
				<Scene12InputFocus />
			</OverlayHost>,
		);
		await flush();

		expect(lastFrame()).toContain('Scene 12 — Input & Focus');
	});
});
