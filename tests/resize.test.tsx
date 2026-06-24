/**
 * Integration tests for terminal resize behavior.
 *
 * §8 deliverable: centered and bottom-anchored layers reposition
 * after a terminal resize event.
 *
 * Uses renderResizable (real ink render with a mutable stdout) and
 * REAL timers.
 */
import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {OverlayHost, Layer} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {renderResizable} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';

// ── Helpers ─────────────────────────────────────────────────────────

const escapeCharacter = '\u001B';

// Built via RegExp constructor to satisfy no-control-regex / escape-case.
const ansiPattern = new RegExp(`${escapeCharacter}\\[[\\d;?]*[a-zA-Z]`, 'g');

/** Strip ANSI escape sequences from a raw ink frame. */
function stripAnsi(rawFrame: string): string {
	return rawFrame.replaceAll(ansiPattern, '');
}

/**
 * Find the {row, col} of `needle` in a raw ink frame.
 *
 * The frame is stripped of ANSI codes then split into lines.
 * Returns undefined if the needle is not found.
 */
function findPosition(
	frame: string,
	needle: string,
): {row: number; col: number} | undefined {
	const clean = stripAnsi(frame);
	const lines = clean.split('\n');
	for (const [index, line] of lines.entries()) {
		const col = line.indexOf(needle);
		if (col !== -1) {
			return {row: index, col};
		}
	}

	return undefined;
}

// ── Cleanup ─────────────────────────────────────────────────────────

let active: {unmountAndCleanup: () => void} | undefined;

afterEach(() => {
	active?.unmountAndCleanup();
	active = undefined;
	overlayStore.closeAll();
});

// ── Test 1: centered layer recenters after resize ───────────────────
//
// At 80×24 the content is roughly centered. After resize(120,40) the
// center shifts down and right, so both row and col of the content
// should increase.

test('resize: centered layer recenters after terminal resize', async () => {
	const result = renderResizable(
		<OverlayHost>
			<Layer anchor="center">
				<Text>RESIZE-ME</Text>
			</Layer>
		</OverlayHost>,
		{columns: 80, rows: 24},
	);
	active = result;

	await delay(200);

	// Content present and roughly centered in 80×24.
	const frameBefore = result.lastFrame();
	expect(frameBefore).toContain('RESIZE-ME');

	const posBefore = findPosition(frameBefore, 'RESIZE-ME');
	expect(posBefore).toBeDefined();

	// Resize to 120×40.
	result.resize(120, 40);
	await delay(100);

	const frameAfter = result.lastFrame();
	expect(frameAfter).toContain('RESIZE-ME');

	const posAfter = findPosition(frameAfter, 'RESIZE-ME');
	expect(posAfter).toBeDefined();

	// The content should have moved toward the new center:
	// - row increases (center of 40 rows > center of 24 rows)
	// - col increases (center of 120 cols > center of 80 cols)
	expect(posAfter!.row).toBeGreaterThan(posBefore!.row);
	expect(posAfter!.col).toBeGreaterThan(posBefore!.col);
});

// ── Test 2: bottom-anchored layer moves to new bottom edge ──────────
//
// A bottom-anchored single-line layer sits at the last row. After
// resize from 24→40 rows, the bottom edge moves down, so the content
// row should increase.

test('resize: bottom-anchored layer moves to new bottom edge after resize', async () => {
	const result = renderResizable(
		<OverlayHost>
			<Layer anchor="bottom">
				<Text>BOTTOM</Text>
			</Layer>
		</OverlayHost>,
		{columns: 80, rows: 24},
	);
	active = result;

	await delay(200);

	const frameBefore = result.lastFrame();
	expect(frameBefore).toContain('BOTTOM');

	const posBefore = findPosition(frameBefore, 'BOTTOM');
	expect(posBefore).toBeDefined();

	// Resize to 120×40 — bottom edge moves down.
	result.resize(120, 40);
	await delay(100);

	const frameAfter = result.lastFrame();
	expect(frameAfter).toContain('BOTTOM');

	const posAfter = findPosition(frameAfter, 'BOTTOM');
	expect(posAfter).toBeDefined();

	// Bottom-anchored content moves down (more rows → lower bottom edge).
	expect(posAfter!.row).toBeGreaterThan(posBefore!.row);
});
