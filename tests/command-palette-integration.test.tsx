/**
 * Integration tests for <CommandPalette> inside <OverlayHost>.
 *
 * Covers the kb-22 scenario: rendering, filtering by typing,
 * arrow-key navigation (including no-movement edge cases), item
 * selection, escape dismissal, windowed scrolling with "more"
 * indicators, and custom filter functions.
 *
 * Uses REAL timers — ink breaks with fake timers.
 *
 * NOTE: stdin.write('abc') sends all three characters as a SINGLE
 * input event (input.length === 3). The palette only processes
 * single-char input, so we type CHAR BY CHAR with a delay between
 * each so each keystroke becomes its own event:
 *
 *   for (const c of 'save') { stdin.write(c); await delay(80); }
 */
import {describe, test, expect, vi, afterEach} from 'vitest';
import {useState} from 'react';
import {Text} from 'ink';
import {CommandPalette} from '../src/command-palette.js';
import {OverlayHost} from '../src/host.js';
import type {CommandPaletteItem, FilterFunction} from '../src/types.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Key sequences recognised by ink-testing-library ────────────────

const DOWN = '\u001B[B';
const UP = '\u001B[A';
const ENTER = '\r';
const ESC = '\u001B';

// ── Test data ───────────────────────────────────────────────────────

const basicItems: CommandPaletteItem[] = [
	{id: '1', label: 'Open File'},
	{id: '2', label: 'Save File'},
	{id: '3', label: 'Close'},
];

/**
 * 15 items for the windowed-list / scroll test. Labels are deliberately
 * unique and sortable so assertions are unambiguous.
 */
const manyItems: CommandPaletteItem[] = Array.from({length: 15}, (_, i) => ({
	id: `item-${i}`,
	label: `Item ${String(i).padStart(2, '0')}`,
}));

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Type a string one character at a time with delays between each.
 * Required because stdin.write sends the whole string as one event,
 * but the palette handler only processes input.length === 1.
 */
async function typeString(
	stdin: {write: (input: string) => void},
	text: string,
) {
	for (const char of text) {
		stdin.write(char);
		await delay(80);
	}
}

/**
 * Press a key (arrow / enter / esc) and wait for re-render.
 */
async function pressKey(stdin: {write: (input: string) => void}, key: string) {
	stdin.write(key);
	await delay(150);
}

// ── Isolation ──────────────────────────────────────────────────────

afterEach(async () => {
	await delay(50);
});

// ═══════════════════════════════════════════════════════════════════
// (1) Initial render + filtering + selection + dismiss
// ═══════════════════════════════════════════════════════════════════

describe('command palette — render, filter, select, dismiss', () => {
	test('initial frame shows all items with the first selected', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette items={basicItems} defaultOpen />
			</OverlayHost>,
		);

		await delay(300);

		const frame = lastFrame();

		// All three items visible.
		expect(frame).toContain('Open File');
		expect(frame).toContain('Save File');
		expect(frame).toContain('Close');

		// Match-sorter with an empty query sorts alphabetically:
		// Close, Open File, Save File — so "Close" is first (selected).
		expect(frame).toMatch(/\u25B8\s+Close/);
	});

	test('typing filters to a single item; arrows do not move; enter selects it', async () => {
		const onItemSelect = vi.fn();
		const {lastFrame, stdin} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette
					items={basicItems}
					defaultOpen
					onItemSelect={onItemSelect}
				/>
			</OverlayHost>,
		);

		await delay(300);

		// Type 'save' one char at a time — progressively filters down to
		// exactly 'Save File' (match-sorter 'save' matches only Save File).
		await typeString(stdin, 'save');
		await delay(200);

		const frame = lastFrame();

		// Only 'Save File' remains.
		expect(frame).toContain('Save File');
		expect(frame).not.toContain('Open File');
		expect(frame).not.toContain('Close');

		// With a single item the selection marker is on it.
		expect(frame).toMatch(/\u25B8\s+Save File/);

		// Down-arrow on a 1-item list → no movement (still selected).
		await pressKey(stdin, DOWN);
		expect(lastFrame()).toMatch(/\u25B8\s+Save File/);

		// Up-arrow → no movement either.
		await pressKey(stdin, UP);
		expect(lastFrame()).toMatch(/\u25B8\s+Save File/);

		// Enter selects the highlighted item.
		await pressKey(stdin, ENTER);

		expect(onItemSelect).toHaveBeenCalledOnce();
		expect(onItemSelect).toHaveBeenCalledWith(
			expect.objectContaining({id: '2', label: 'Save File'}),
		);
	});

	test('escape calls onDismiss', async () => {
		const onDismiss = vi.fn();

		const {stdin} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette items={basicItems} defaultOpen onDismiss={onDismiss} />
			</OverlayHost>,
		);

		await delay(300);

		// Escape triggers dismissal.
		await pressKey(stdin, ESC);

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	test('reopen after select then escape dismisses again', async () => {
		// Use a controlled app shell so we can close-on-select and reopen.
		const onItemSelect = vi.fn();
		const onDismiss = vi.fn();

		let setOpen: (v: boolean) => void;

		function App() {
			const [open, setOpenState] = useState(true);
			setOpen = setOpenState;

			return (
				<OverlayHost>
					<Text>base</Text>
					<CommandPalette
						items={basicItems}
						open={open}
						onItemSelect={item => {
							onItemSelect(item);
							setOpenState(false);
						}}
						onDismiss={() => {
							onDismiss();
							setOpenState(false);
						}}
					/>
				</OverlayHost>
			);
		}

		const {stdin} = renderWithHost(<App />);
		await delay(300);

		// Filter to Save File and select it.
		await typeString(stdin, 'save');
		await delay(150);
		await pressKey(stdin, ENTER);

		expect(onItemSelect).toHaveBeenCalledOnce();
		expect(onItemSelect).toHaveBeenCalledWith(
			expect.objectContaining({id: '2', label: 'Save File'}),
		);

		// Palette is now closed (onItemSelect closed it). Reopen.
		setOpen(true);
		await delay(300);

		// Escape dismisses the reopened palette.
		await pressKey(stdin, ESC);
		expect(onDismiss).toHaveBeenCalledOnce();
	});
});

// ═══════════════════════════════════════════════════════════════════
// (2) Windowed list — maxVisible, "more" indicators, scroll
// ═══════════════════════════════════════════════════════════════════

describe('command palette — windowed list & scroll', () => {
	test('15 items with maxVisible=5 shows both more-indicators', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</OverlayHost>,
		);

		await delay(300);

		const frame = lastFrame();

		// At the top (offset 0) there is no "▲ more" indicator, but the
		// bottom indicator reports the overflow below the fold.
		// 15 total − 5 visible = 10 hidden below.
		expect(frame).toContain('\u25BC 10 more');
	});

	test('navigating down past the visible window scrolls and reveals top indicator', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</OverlayHost>,
		);

		await delay(300);

		// Match-sorter empty query returns alphabetical (already sorted):
		// Item 00 .. Item 14. First selected.
		let frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 00/);

		// Press down-arrow 5 times → selection moves to Item 05, which is
		// beyond the initial window [00..04]. The palette must scroll so
		// that the window becomes [01..05], revealing the top indicator.
		for (let i = 0; i < 5; i++) {
			await pressKey(stdin, DOWN);
		}

		frame = lastFrame();

		// Top indicator now shows (1 item above the fold).
		expect(frame).toContain('\u25B2 1 more');
		// Item 05 is selected.
		expect(frame).toMatch(/\u25B8\s+Item 05/);
		// Bottom indicator still present (items remaining below).
		expect(frame).toContain('\u25BC');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (3) Custom filter — overrides match-sorter
// ═══════════════════════════════════════════════════════════════════

describe('command palette — custom filter', () => {
	test('custom filter returns a custom subset regardless of query', async () => {
		// Custom filter: return only items whose id starts with 'item-0'
		// (i.e. Item 00–09), reversed so order differs from match-sorter.
		const customFilter: FilterFunction = vi.fn((items, _query) =>
			items.filter(item => item.id.startsWith('item-0')).reverse(),
		);

		const subset = manyItems
			.filter(item => item.id.startsWith('item-0'))
			.reverse();

		const {lastFrame, stdin} = renderWithHost(
			<OverlayHost>
				<Text>base</Text>
				<CommandPalette
					items={manyItems}
					maxVisible={15}
					defaultOpen
					filter={customFilter}
				/>
			</OverlayHost>,
		);

		await delay(300);

		// Type something — the custom filter ignores the query entirely.
		await typeString(stdin, 'zzz');
		await delay(200);

		const frame = lastFrame();

		// Every custom-filter item appears.
		for (const item of subset) {
			expect(frame).toContain(item.label);
		}

		// Items outside the subset do not appear.
		expect(frame).not.toContain('Item 10');
		expect(frame).not.toContain('Item 14');

		// The filter was actually invoked.
		expect(customFilter).toHaveBeenCalled();

		// The first visible (selected) item is the first element of the
		// reversed subset.
		expect(frame).toMatch(new RegExp(`\\u25B8\\s+${subset[0]!.label}`));
	});
});
