/**
 * Characterization tests for demo Scene 09 — Command Palette.
 *
 * The upcoming refactor removes the redundant `onDismiss` handler from
 * `<CommandPalette>` in `demo/scenes/09-command-palette.tsx`. Currently
 * the scene wires both `onOpenChange={setShowPalette}` AND
 * `onDismiss={() => setShowPalette(false)}`. The library's
 * `<CommandPalette>` already calls `onOpenChange(false)` immediately
 * before firing `onDismiss` on Esc, so the `onDismiss` body is a
 * redundant double state update.
 *
 * Removing `onDismiss` must be behavior-preserving: the palette must
 * still close on Esc (via `onOpenChange`), 'p' must still toggle
 * visibility, Enter must still select + close (closeOnSelect default),
 * and 'm' must still toggle multi-select. These tests pin those
 * observable behaviors so the refactor is provably safe.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';
import Scene09CommandPalette from '../demo/scenes/09-command-palette.js';

// ── Key sequences recognised by ink-testing-library ────────────────
const ESC = '\u001B';
const DOWN = '\u001B[B';
const ENTER = '\r';

afterEach(async () => {
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// Scene 09 — Command Palette
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 09 — Command Palette', () => {
	test('the default export is a renderable component', () => {
		expect(typeof Scene09CommandPalette).toBe('function');
	});

	test('renders the scene shell header, description, and hint footer', async () => {
		const {lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Scene 09 — Command Palette');
		expect(frame).toContain(
			'Filterable keyboard list: default mode and multi-select mode.',
		);
		// Hint footer.
		expect(frame).toContain('toggle palette');
		expect(frame).toContain('toggle multi-select');
		// Initial body copy + state.
		expect(frame).toContain('to open the command palette');
		expect(frame).toContain('multi-select mode (currently OFF)');
		expect(frame).toContain('Last selected: —');
	});

	test('palette is closed initially (title and items not rendered)', async () => {
		const {lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		const frame = lastFrame();
		// The palette box title is "Demo Commands" — absent while closed.
		expect(frame).not.toContain('Demo Commands');
		// None of the command items should be visible either.
		expect(frame).not.toContain('Close Tab');
	});

	test('pressing `p` opens the palette (title + first items appear)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Closed initially.
		expect(lastFrame()).not.toContain('Demo Commands');

		// Open via 'p'.
		stdin.write('p');
		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain('Demo Commands');
		// First visible command item (match-sorter ranks "Close Tab" first
		// with an empty query) is rendered.
		expect(frame).toContain('Close Tab');
	});

	test('pressing `p` again closes the palette (toggle off)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Open.
		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('Demo Commands');

		// While open the palette captures input, so the scene-level 'p'
		// handler is gated off. Close via Esc first, then 'p' toggles again.
		stdin.write(ESC);
		await delay(300);
		expect(lastFrame()).not.toContain('Demo Commands');

		// Re-open with 'p' to confirm the toggle still works from closed.
		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('Demo Commands');
	});

	// ── THE KEY REFACTOR CHARACTERIZATION ──────────────────────────
	//
	// Esc must close the palette. After the refactor this works solely
	// through `onOpenChange(false)` (the `onDismiss` prop is removed).
	// This test pins the observable outcome: the palette box disappears.

	test('Esc closes the palette (via onOpenChange, the path the refactor keeps)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Open the palette.
		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('Demo Commands');

		// Dismiss with Esc.
		stdin.write(ESC);
		await delay(300);

		// The palette box must be gone — this is the behavior that must
		// survive removing the redundant onDismiss handler.
		const frame = lastFrame();
		expect(frame).not.toContain('Demo Commands');
		expect(frame).not.toContain('Close Tab');
		// The underlying scene is still rendered.
		expect(frame).toContain('Scene 09 — Command Palette');
	});

	test('Esc then `p` reopens the palette (close/reopen round-trip)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Open → Esc-close → reopen.
		stdin.write('p');
		await delay(300);
		stdin.write(ESC);
		await delay(300);
		expect(lastFrame()).not.toContain('Demo Commands');

		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('Demo Commands');
	});

	test('Enter selects the highlighted item, records it, and closes (closeOnSelect default)', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Open palette.
		stdin.write('p');
		await delay(300);
		expect(lastFrame()).toContain('Demo Commands');

		// Move selection down once (second item in match-sorter order).
		stdin.write(DOWN);
		await delay(200);

		// Select with Enter — closeOnSelect is true in default mode, so the
		// palette should close AND lastSelected should update.
		stdin.write(ENTER);
		await delay(300);

		const frame = lastFrame();
		// Palette closed.
		expect(frame).not.toContain('Demo Commands');
		// The selected label is recorded in the scene body. With an empty
		// query match-sorter ranks "Close Tab" first and "Command Palette"
		// second, so a single down-arrow lands on "Command Palette".
		expect(frame).toContain('Last selected: Command Palette');
	});

	test('typing in an open palette filters the visible command items', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Open palette.
		stdin.write('p');
		await delay(300);

		// Type 's' (single char → single input event) to filter.
		stdin.write('s');
		await delay(300);

		const frame = lastFrame();
		// 's' matches Save / Save As (match-sorter on label).
		expect(frame).toContain('Save');
		// Items that don't contain 's' should be filtered out.
		expect(frame).not.toContain('New File');
		expect(frame).not.toContain('Quit');
	});

	test('pressing `m` toggles the multi-select mode indicator in the scene body', async () => {
		const {stdin, lastFrame} = renderWithHost(<Scene09CommandPalette />);
		await delay(300);

		// Initial: multi-select OFF.
		expect(lastFrame()).toContain('multi-select mode (currently OFF)');

		// Toggle ON (palette is closed, so the scene handler is active).
		stdin.write('m');
		await delay(200);
		expect(lastFrame()).toContain('multi-select mode (currently ON)');

		// Toggle back OFF.
		stdin.write('m');
		await delay(200);
		expect(lastFrame()).toContain('multi-select mode (currently OFF)');
	});
});
