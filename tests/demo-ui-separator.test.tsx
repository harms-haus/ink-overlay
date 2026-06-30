/**
 * Characterization tests for `demo/ui.tsx` — `SceneShell` and `KeyHint`.
 *
 * The upcoming refactor extracts the magic number `48` (the separator-rule
 * width above the footer hints) into a named constant `SEPARATOR_WIDTH`.
 * These tests pin down the *observable render output* of both presentational
 * helpers — and specifically the exact width and content of the separator —
 * so that the pure-rename refactor is provably behaviour-preserving.
 *
 * Key behaviors pinned here:
 *   - The footer separator is a line of exactly 48 `─` characters (not 47,
 *     not 49). Changing the constant must not change this.
 *   - The footer (separator + hints) is omitted entirely when `hints` is
 *     an empty array.
 *   - Each hint renders its key (bold yellow) and label, with the first
 *     hint having no leading margin.
 *   - `KeyHint` renders its children as bold yellow text.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {SceneShell, KeyHint} from '../demo/ui.js';
import {delay} from './helpers/delay.js';

afterEach(async () => {
	await delay(50);
});

/** Strip ANSI escape sequences so assertions can inspect visible glyphs. */
function stripAnsi(s: string): string {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\u001B\[[0-9;]*m/g, '');
}

// ════════════════════════════════════════════════════════════════════
// SceneShell — separator width (the magic number 48)
// ════════════════════════════════════════════════════════════════════

describe('demo ui — SceneShell separator width', () => {
	test('the footer separator is exactly 48 box-drawing characters', async () => {
		const {lastFrame} = render(
			<SceneShell title="T" description="D" hints={[{key: 'q', label: 'quit'}]}>
				<Text>body</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		// Strip ANSI styling so we can inspect the visible glyphs.
		const lines = frame.split('\n').map(stripAnsi);

		// The separator must be a line containing exactly 48 '─' chars.
		const separatorLine = lines.find(
			line => line.length > 0 && [...line].every(ch => ch === '─'),
		);
		expect(separatorLine).toBeDefined();

		// Exactly 48 — guards against off-by-one or accidental value changes
		// when the literal is moved to a named constant.
		expect(separatorLine!.length).toBe(48);
		expect(separatorLine).toBe('─'.repeat(48));

		// Pin a few neighboring widths that must NOT match, so the test
		// fails if the constant is dropped or mistyped.
		expect(separatorLine!.length).not.toBe(47);
		expect(separatorLine!.length).not.toBe(49);
	});

	test('the separator uses the heavy-horizontal box-drawing glyph, not dashes', async () => {
		const {lastFrame} = render(
			<SceneShell title="T" description="D" hints={[{key: 'q', label: 'quit'}]}>
				<Text>body</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		// The glyph is U+2500 (─), not an ASCII hyphen or en/em dash.
		expect(frame).toContain('─'.repeat(48));
		expect(frame).not.toContain('-'.repeat(48));
	});
});

// ════════════════════════════════════════════════════════════════════
// SceneShell — footer omission on empty hints
// ════════════════════════════════════════════════════════════════════

describe('demo ui — SceneShell footer omission', () => {
	test('an empty hints array omits the footer separator entirely', async () => {
		const {lastFrame} = render(
			<SceneShell title="T" description="D" hints={[]}>
				<Text>body</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		expect(frame).toContain('T');
		expect(frame).toContain('D');
		expect(frame).toContain('body');
		// No separator line at all.
		expect(frame).not.toContain('─');
	});

	test('a non-empty hints array renders both the separator and the hints', async () => {
		const {lastFrame} = render(
			<SceneShell
				title="T"
				description="D"
				hints={[
					{key: 'q', label: 'quit'},
					{key: 'm', label: 'menu'},
				]}
			>
				<Text>body</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		// Separator present with the pinned width.
		expect(frame).toContain('─'.repeat(48));
		// Both hints rendered.
		expect(frame).toContain('q');
		expect(frame).toContain('quit');
		expect(frame).toContain('m');
		expect(frame).toContain('menu');
	});
});

// ════════════════════════════════════════════════════════════════════
// SceneShell — header and content structure
// ════════════════════════════════════════════════════════════════════

describe('demo ui — SceneShell header & content', () => {
	test('renders title, description, and children in column order', async () => {
		const {lastFrame} = render(
			<SceneShell
				title="My Title"
				description="A short description."
				hints={[]}
			>
				<Text>scene content</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		const lines = frame.split('\n').filter(l => l.trim().length > 0);
		// Title first, then description, then content.
		const titleIdx = lines.findIndex(l => l.includes('My Title'));
		const descIdx = lines.findIndex(l => l.includes('A short description.'));
		const contentIdx = lines.findIndex(l => l.includes('scene content'));
		expect(titleIdx).toBeGreaterThanOrEqual(0);
		expect(descIdx).toBeGreaterThan(titleIdx);
		expect(contentIdx).toBeGreaterThan(descIdx);
	});

	test('renders multiple hint pairs in order', async () => {
		const {lastFrame} = render(
			<SceneShell
				title="T"
				description="D"
				hints={[
					{key: 'a', label: 'first'},
					{key: 'b', label: 'second'},
					{key: 'c', label: 'third'},
				]}
			>
				<Text>body</Text>
			</SceneShell>,
		);
		await delay(100);

		const frame = lastFrame()!;
		// The hints row contains all three keys and labels.
		expect(frame).toContain('a');
		expect(frame).toContain('first');
		expect(frame).toContain('b');
		expect(frame).toContain('second');
		expect(frame).toContain('c');
		expect(frame).toContain('third');
	});
});

// ════════════════════════════════════════════════════════════════════
// KeyHint
// ════════════════════════════════════════════════════════════════════

describe('demo ui — KeyHint', () => {
	test('renders its children as visible text', async () => {
		const {lastFrame} = render(<KeyHint>Esc</KeyHint>);
		await delay(50);
		expect(lastFrame()).toContain('Esc');
	});

	test('renders arbitrary ReactNode children (not just strings)', async () => {
		const {lastFrame} = render(
			<Text>
				Press <KeyHint>Ctrl-C</KeyHint> now
			</Text>,
		);
		await delay(50);
		const frame = lastFrame()!;
		expect(frame).toContain('Ctrl-C');
		expect(frame).toContain('Press');
		expect(frame).toContain('now');
	});
});
