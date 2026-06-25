/**
 * Characterization tests for the rendered text output of demo scenes 12
 * and 13.
 *
 * These tests pin down the observable rendered output — specifically the
 * apostrophe (') and ampersand (&) characters that enter the JSX via HTML
 * entities (`&apos;`, `&amp;`). JSX decodes those entities to the same
 * characters at render time, so the rendered terminal text is identical
 * whether the source uses entities or literal characters.
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

		expect(lastFrame()).toContain('Limitations & graceful degradation');
	});

	test('renders the InputDispatcher apostrophe text with a literal apostrophe', async () => {
		const {lastFrame} = render(<Scene13Runtime />);
		await flush();

		// The terminal wraps this sentence across two lines, so we
		// assert only the portion that carries the apostrophe.
		expect(lastFrame()).toContain("InputDispatcher's");
	});

	test('renders a scene title with a literal ampersand', async () => {
		const {lastFrame} = render(<Scene13Runtime />);
		await flush();

		expect(lastFrame()).toContain('13 · Runtime & Environments');
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
