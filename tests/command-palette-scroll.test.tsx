/**
 * Characterization tests for <CommandPalette> scroll-into-view & windowing.
 *
 * These tests pin down the *observable* windowing contract of the palette:
 *   - the visible window is `filtered.slice(offset, offset + visibleCount)`
 *   - the offset advances when the selection moves below the window
 *   - the offset retreats when the selection moves above the window
 *   - the offset does NOT change while the selection stays inside the window
 *   - the "▲ N more" / "▼ N more" indicators reflect the offset
 *   - the offset resets to 0 on reopen and on query change
 *
 * The scroll mechanism is being refactored from a `useState(offset)` +
 * `useEffect(() => setOffset(listOffset))` two-step into a `useRef` mutated
 * during render. These tests assert only the externally observable frame,
 * so they must pass identically before and after the refactor.
 *
 * Uses REAL timers (ink breaks with fake timers).
 */
import {test, expect, describe, afterEach, vi} from 'vitest';
import {useState} from 'react';
import {Text} from 'ink';
import {CommandPalette} from '../src/command-palette.js';
import type {CommandPaletteItem} from '../src/types.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {
	delay,
	KEY_PRESS_DELAY,
	RENDER_DELAY,
	INITIAL_RENDER_DELAY,
	CLEANUP_DELAY,
} from './helpers/delay.js';
import {typeString} from './helpers/type-string.js';

// ── warnBunInput mock (vi.hoisted so it survives vi.mock hoisting) ──
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Key sequences ──────────────────────────────────────────────────

const DOWN = '\u001B[B';
const UP = '\u001B[A';
const ESC = '\u001B';

// ── Test data ──────────────────────────────────────────────────────

/**
 * 15 unique, alphabetically-sorted labels. With an empty query
 * match-sorter returns them in this exact order, so assertions on
 * which items are visible / selected are unambiguous.
 */
const manyItems: CommandPaletteItem[] = Array.from({length: 15}, (_, i) => ({
	id: `item-${i}`,
	label: `Item ${String(i).padStart(2, '0')}`,
}));

// ── Helpers ────────────────────────────────────────────────────────

async function pressDown(stdin: {write: (input: string) => void}, times = 1) {
	for (let i = 0; i < times; i++) {
		stdin.write(DOWN);
		await delay(KEY_PRESS_DELAY);
	}
}

async function pressUp(stdin: {write: (input: string) => void}, times = 1) {
	for (let i = 0; i < times; i++) {
		stdin.write(UP);
		await delay(KEY_PRESS_DELAY);
	}
}

afterEach(async () => {
	mockWarnBunInput.mockClear();
	await delay(CLEANUP_DELAY);
});

// ═══════════════════════════════════════════════════════════════════
// Window membership & selection marker relative to offset
// ═══════════════════════════════════════════════════════════════════

describe('scroll windowing — membership and selection marker', () => {
	test('initial window is the first maxVisible items; first item selected; no top indicator', async () => {
		const {lastFrame} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		const frame = lastFrame();

		// First 5 items visible (window [00..04]).
		expect(frame).toContain('Item 00');
		expect(frame).toContain('Item 04');
		// Items below the fold are NOT rendered.
		expect(frame).not.toContain('Item 05');

		// First item selected.
		expect(frame).toMatch(/\u25B8\s+Item 00/);
		// No top indicator at offset 0.
		expect(frame).not.toContain('\u25B2');
		// Bottom indicator present: 15 − 5 = 10 below.
		expect(frame).toContain('\u25BC 10 more');
	});

	test('selection inside the window does not scroll the offset', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Move down 3 times → Item 03, still inside [00..04].
		await pressDown(stdin, 3);

		const frame = lastFrame();

		expect(frame).toMatch(/\u25B8\s+Item 03/);
		// Window unchanged: Item 00 still visible, Item 05 still hidden.
		expect(frame).toContain('Item 00');
		expect(frame).not.toContain('Item 05');
		// No top indicator (offset still 0).
		expect(frame).not.toContain('\u25B2');
		// Bottom indicator unchanged.
		expect(frame).toContain('\u25BC 10 more');
	});

	test('selection at the last slot of the window does not scroll', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Move down 4 times → Item 04, the last slot of [00..04].
		await pressDown(stdin, 4);

		const frame = lastFrame();

		expect(frame).toMatch(/\u25B8\s+Item 04/);
		expect(frame).toContain('Item 00');
		expect(frame).not.toContain('Item 05');
		expect(frame).not.toContain('\u25B2');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Scrolling down — offset advances
// ═══════════════════════════════════════════════════════════════════

describe('scroll windowing — moving selection below the window', () => {
	test('selecting the item just below the window scrolls by exactly one', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Move to index 5 (Item 05), which is one past the window [00..04].
		await pressDown(stdin, 5);

		const frame = lastFrame();

		// Item 05 is now selected.
		expect(frame).toMatch(/\u25B8\s+Item 05/);
		// Window scrolled by one: [01..05]. Item 00 scrolled out.
		expect(frame).not.toContain('Item 00');
		expect(frame).toContain('Item 05');
		// Top indicator now shows 1 above.
		expect(frame).toContain('\u25B2 1 more');
		// Bottom indicator: 15 − 1(offset) − 5 = 9 below.
		expect(frame).toContain('\u25BC 9 more');
	});

	test('jumping far below the window scrolls so the selection is the last visible row', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Move to index 10 (Item 10).
		await pressDown(stdin, 10);

		const frame = lastFrame();

		// Item 10 selected and pinned to the last visible slot.
		expect(frame).toMatch(/\u25B8\s+Item 10/);
		// Window is [06..10].
		expect(frame).toContain('Item 06');
		expect(frame).not.toContain('Item 05');
		// Top indicator: 6 above.
		expect(frame).toContain('\u25B2 6 more');
		// Bottom indicator: 15 − 6 − 5 = 4 below.
		expect(frame).toContain('\u25BC 4 more');
	});

	test('reaching the last item shows no bottom indicator', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Move to the last item (index 14).
		await pressDown(stdin, 14);

		const frame = lastFrame();

		expect(frame).toMatch(/\u25B8\s+Item 14/);
		// Window is [10..14].
		expect(frame).toContain('Item 10');
		expect(frame).not.toContain('Item 09');
		// Top indicator: 10 above.
		expect(frame).toContain('\u25B2 10 more');
		// No bottom indicator — nothing below.
		expect(frame).not.toContain('\u25BC');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Scrolling up — offset retreats
// ═══════════════════════════════════════════════════════════════════

describe('scroll windowing — moving selection above the window', () => {
	test('moving the selection above the window retreats the offset to match', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Scroll down to index 7 → window [03..07], offset 3.
		await pressDown(stdin, 7);
		expect(lastFrame()).toContain('\u25B2 3 more');
		expect(lastFrame()).toMatch(/\u25B8\s+Item 07/);

		// Move up while still inside the window — offset must NOT change.
		await pressUp(stdin, 3);
		let frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 04/);
		expect(frame).toContain('Item 03');
		expect(frame).toContain('\u25B2 3 more'); // offset still 3

		// One more up → selectedIndex 3 == offset 3 → still inside window.
		await pressUp(stdin, 1);
		frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 03/);
		expect(frame).toContain('\u25B2 3 more');

		// Now move above the window: selectedIndex 2 < offset 3 → offset
		// retreats to 2 (offset = selectedIndex).
		await pressUp(stdin, 1);
		frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 02/);
		expect(frame).toContain('\u25B2 2 more');
		expect(frame).toContain('\u25BC 8 more');
	});

	test('full round-trip: down to bottom then back to top restores offset 0', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Go all the way down.
		await pressDown(stdin, 14);
		expect(lastFrame()).toContain('\u25B2 10 more');

		// Come all the way back up.
		await pressUp(stdin, 14);

		const frame = lastFrame();

		// Back to offset 0, Item 00 selected.
		expect(frame).toMatch(/\u25B8\s+Item 00/);
		expect(frame).toContain('Item 04');
		expect(frame).not.toContain('Item 05');
		// No top indicator.
		expect(frame).not.toContain('\u25B2');
		// Bottom indicator restored to 10.
		expect(frame).toContain('\u25BC 10 more');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Offset resets
// ═══════════════════════════════════════════════════════════════════

describe('scroll windowing — offset resets', () => {
	test('offset resets to 0 when the query changes after scrolling', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Scroll down so the top indicator appears.
		await pressDown(stdin, 6);
		expect(lastFrame()).toContain('\u25B2 2 more');

		// Type a character that still matches all items — query changes
		// so the offset AND selectedIndex reset.
		await typeString(stdin, 'i');
		await delay(RENDER_DELAY);

		const frame = lastFrame();

		// No top indicator → offset back to 0.
		expect(frame).not.toContain('\u25B2');
		// First item selected again (selectedIndex reset to 0).
		expect(frame).toMatch(/\u25B8\s+Item 00/);
	});

	test('offset resets to 0 when the palette is reopened (controlled)', async () => {
		let setOpen!: (v: boolean) => void;

		function App() {
			const [open, setOpenState] = useState(true);
			setOpen = setOpenState;
			return (
				<>
					<Text>base</Text>
					<CommandPalette items={manyItems} maxVisible={5} open={open} />
				</>
			);
		}

		const {lastFrame, stdin} = renderWithHost(<App />);
		await delay(INITIAL_RENDER_DELAY);

		// Scroll down to index 8 → offset 4 (window [04..08]).
		await pressDown(stdin, 8);
		expect(lastFrame()).toContain('\u25B2 4 more');
		expect(lastFrame()).toMatch(/\u25B8\s+Item 08/);

		// Close, then reopen.
		setOpen(false);
		await delay(RENDER_DELAY);
		setOpen(true);
		await delay(INITIAL_RENDER_DELAY);

		const frame = lastFrame();

		// Offset and selection fully reset.
		expect(frame).not.toContain('\u25B2');
		expect(frame).toMatch(/\u25B8\s+Item 00/);
		expect(frame).toContain('\u25BC 10 more');
	});

	test('scrolled offset is gone after Esc closes an uncontrolled palette', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Scroll down to a non-zero offset.
		await pressDown(stdin, 7);
		expect(lastFrame()).toContain('\u25B2 3 more');

		// Close with Esc — the palette content disappears entirely.
		stdin.write(ESC);
		await delay(INITIAL_RENDER_DELAY);

		const closed = lastFrame();
		expect(closed).not.toContain('Item 00');
		expect(closed).not.toContain('\u25B2');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Edge: small windows
// ═══════════════════════════════════════════════════════════════════

describe('scroll windowing — edge cases', () => {
	test('maxVisible=1 shows a single item and scrolls one per arrow press', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={1} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Only Item 00 visible & selected.
		let frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 00/);
		expect(frame).not.toContain('Item 01');
		expect(frame).not.toContain('\u25B2');
		expect(frame).toContain('\u25BC 14 more');

		// Down once → Item 01.
		await pressDown(stdin, 1);
		frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 01/);
		expect(frame).not.toContain('Item 00');
		expect(frame).not.toContain('Item 02');
		expect(frame).toContain('\u25B2 1 more');
		expect(frame).toContain('\u25BC 13 more');
	});

	test('windowing indicator counts stay correct after filtering shrinks the list', async () => {
		// Use a deterministic custom filter that returns exactly 10 items
		// (Item 00..09) regardless of query, so indicator math is stable.
		const ten = manyItems.slice(0, 10);
		const customFilter = (_items: CommandPaletteItem[], _q: string) => ten;

		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette
					items={manyItems}
					maxVisible={3}
					defaultOpen
					filter={customFilter}
				/>
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// 10 items, window 3, offset 0 → 7 below, none above.
		let frame = lastFrame();
		expect(frame).not.toContain('\u25B2');
		expect(frame).toContain('\u25BC 7 more');
		expect(frame).toMatch(/\u25B8\s+Item 00/);

		// Scroll down 5 → selectedIndex 5, offset 3 (window [03..05]).
		await pressDown(stdin, 5);
		frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 05/);
		expect(frame).toContain('\u25B2 3 more');
		// 10 − offset(3) − visible(3) = 4 below.
		expect(frame).toContain('\u25BC 4 more');
		expect(frame).toContain('Item 03');
		expect(frame).not.toContain('Item 02');

		// A query change resets the offset even with a custom filter.
		await typeString(stdin, 'x');
		await delay(RENDER_DELAY);
		frame = lastFrame();
		expect(frame).not.toContain('\u25B2');
		expect(frame).toContain('\u25BC 7 more');
	});

	test('offset never exceeds the valid range when at the very end of a short list', async () => {
		// 6 items, maxVisible 5 — only 1 can be below the fold.
		const shortItems = manyItems.slice(0, 6);
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={shortItems} maxVisible={5} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		// Go to the last item (index 5).
		await pressDown(stdin, 5);

		const frame = lastFrame();

		expect(frame).toMatch(/\u25B8\s+Item 05/);
		// Window [01..05], offset 1.
		expect(frame).toContain('Item 01');
		expect(frame).toContain('\u25B2 1 more');
		// No bottom indicator.
		expect(frame).not.toContain('\u25BC');
	});

	test('maxVisible equals total items shows everything with no indicators', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<>
				<Text>base</Text>
				<CommandPalette items={manyItems} maxVisible={15} defaultOpen />
			</>,
		);

		await delay(INITIAL_RENDER_DELAY);

		let frame = lastFrame();
		expect(frame).toContain('Item 00');
		expect(frame).toContain('Item 14');
		expect(frame).not.toContain('\u25B2');
		expect(frame).not.toContain('\u25BC');

		// Navigating down cannot scroll (window == list).
		await pressDown(stdin, 10);
		frame = lastFrame();
		expect(frame).toMatch(/\u25B8\s+Item 10/);
		expect(frame).toContain('Item 00'); // still visible
		expect(frame).not.toContain('\u25B2');
	});
});
