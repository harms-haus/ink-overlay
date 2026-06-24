/**
 * Tests for <CommandPalette> — a filterable, keyboard-navigable list overlay.
 *
 * Uses REAL timers (ink breaks with fake timers).
 * NOTE: stdin.write('xyz') sends 'xyz' as one event (input.length === 3).
 *       The handler only processes input.length === 1. Write chars one at
 *       a time with delays between them.
 */
import {test, expect, vi, afterEach} from 'vitest';
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

// ── Test data ────────────────────────────────────────────────────────

const allItems: CommandPaletteItem[] = [
	{id: 'a1', label: 'Apple'},
	{id: 'a2', label: 'Banana'},
	{id: 'a3', label: 'Apricot'},
	{id: 'a4', label: 'Cherry'},
	{id: 'a5', label: 'Avocado'},
];

afterEach(async () => {
	mockWarnBunInput.mockClear();
	await delay(CLEANUP_DELAY);
});

// ── Test 1: windowed list with maxVisible shows correct count + indicator ──

test('windowed list shows maxVisible items and overflow indicator', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={3} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	// MatchSorter with empty query sorts alphabetically:
	// Apple, Apricot, Avocado, Banana, Cherry
	// With maxVisible=3: Apple, Apricot, Avocado visible
	expect(frame).toContain('Apple');
	expect(frame).toContain('Apricot');
	expect(frame).toContain('Avocado');

	// 2 items below the fold
	expect(frame).toContain('\u25BC 2 more');
});

// ── Test 2: typing filters items ─────────────────────────────────────

test('typing filters items by label using match-sorter', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'a' — should filter to items containing 'a'.
	stdin.write('a');
	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	// Match-sorter 'a' matches: Apple, Apricot, Avocado, Banana (all contain 'a')
	expect(frame).toContain('Apple');
	expect(frame).toContain('Banana');
	expect(frame).toContain('Apricot');
	expect(frame).toContain('Avocado');

	// Cherry has no 'a' match
	expect(frame).not.toContain('Cherry');
});

// ── Test 3: down-arrow moves selection ───────────────────────────────

test('down-arrow moves selection marker to next item', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={5} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Initial state: first item is selected (marker next to Apple).
	let frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Apple/);

	// Press down-arrow.
	stdin.write('\u001B[B');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	// The marker moves to second item (Apricot in sorted order).
	expect(frame).toMatch(/\u25B8\s+Apricot/);
});

// ── Test 4: enter calls onItemSelect with the selected item ──────────

test('enter calls onItemSelect with the currently selected item', async () => {
	const onItemSelect = vi.fn();

	const {stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={allItems}
				maxVisible={5}
				defaultOpen
				onItemSelect={onItemSelect}
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Move down to second item (Apricot in alphabetical sort order).
	stdin.write('\u001B[B');
	await delay(INITIAL_RENDER_DELAY);

	// Press enter.
	stdin.write('\r');
	await delay(INITIAL_RENDER_DELAY);

	// Should have been called with Apricot (index 1 in sorted order).
	expect(onItemSelect).toHaveBeenCalledOnce();
	expect(onItemSelect).toHaveBeenCalledWith(
		expect.objectContaining({id: 'a3', label: 'Apricot'}),
	);
});

// ── Test 5: escape calls onDismiss ───────────────────────────────────

test('escape calls onDismiss', async () => {
	const onDismiss = vi.fn();

	const {stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={allItems}
				maxVisible={5}
				defaultOpen
				onDismiss={onDismiss}
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Press escape.
	stdin.write('\u001B');
	await delay(INITIAL_RENDER_DELAY);

	expect(onDismiss).toHaveBeenCalledOnce();
});

// ── Test 6: empty state shows message ────────────────────────────────

test('shows empty message when no items match', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={allItems}
				maxVisible={10}
				defaultOpen
				emptyMessage="No matching commands"
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'z' one at a time — matches nothing.
	await typeString(stdin, 'z');
	await delay(RENDER_DELAY);

	const frame = lastFrame();
	expect(frame).toContain('No matching commands');

	// No items should show.
	expect(frame).not.toContain('Apple');
	expect(frame).not.toContain('Banana');
});

// ── Test 7: custom filter overrides match-sorter ────────────────────

test('custom filter prop overrides default match-sorter', async () => {
	const customFilter = vi.fn((items: CommandPaletteItem[], _query: string) =>
		// Custom filter: only return Cherry, regardless of query.
		items.filter(item => item.label === 'Cherry'),
	);

	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={allItems}
				maxVisible={10}
				defaultOpen
				filter={customFilter}
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'a' — custom filter should still only return Cherry.
	stdin.write('a');
	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	expect(frame).toContain('Cherry');
	expect(frame).not.toContain('Apple');
	expect(frame).not.toContain('Banana');

	// The custom filter should have been called.
	expect(customFilter).toHaveBeenCalled();
});

// ── Test 8: uncontrolled palette closes on Esc → handler deregistered ─

test('uncontrolled palette: Esc closes and calls onOpenChange(false)', async () => {
	const onDismiss = vi.fn();
	const onOpenChange = vi.fn();

	const {stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={allItems}
				maxVisible={5}
				defaultOpen
				onDismiss={onDismiss}
				onOpenChange={onOpenChange}
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Press Escape to close the palette.
	stdin.write('\u001B');
	await delay(INITIAL_RENDER_DELAY);

	// Palette should call both onDismiss and onOpenChange(false).
	expect(onDismiss).toHaveBeenCalledOnce();
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

// ── Test 9: up-arrow clamps at 0 ────────────────────────────────────

test('up-arrow clamps selection at first item', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={5} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Initial selection is on the first item.
	let frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Apple/);

	// Press up-arrow — should stay on Apple.
	stdin.write('\u001B[A');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Apple/);

	// Press up-arrow again — still Apple.
	stdin.write('\u001B[A');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Apple/);
});

// ── Test 10: backspace deletes character before cursor ───────────────

test('backspace deletes the character before the cursor', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'an' — cursor is at end (index 2), filter shows items matching 'an'.
	await typeString(stdin, 'an');
	await delay(INITIAL_RENDER_DELAY);

	let frame = lastFrame();
	expect(frame).toContain('Banana'); // Matches 'an'

	// Press backspace — removes 'n', leaving 'a'.
	stdin.write('\u007F');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	// With just 'a', more items match (Apple, Apricot, Avocado, Banana).
	expect(frame).toContain('Apple');
	expect(frame).toContain('Apricot');
});

// ── Test 11: left/right cursor movement ──────────────────────────────

test('left and right arrow move the cursor within the filter text', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'an' — cursor is at end (index 2).
	await typeString(stdin, 'an');
	await delay(INITIAL_RENDER_DELAY);

	// Press left arrow — cursor moves to index 1.
	stdin.write('\u001B[D');
	await delay(RENDER_DELAY);

	// Press left arrow again — cursor at index 0.
	stdin.write('\u001B[D');
	await delay(RENDER_DELAY);

	// Press right arrow — cursor back to index 1.
	stdin.write('\u001B[C');
	await delay(RENDER_DELAY);

	// Press right arrow — cursor back to end (index 2).
	stdin.write('\u001B[C');
	await delay(RENDER_DELAY);

	// The frame should still show the 'an' filter (cursor movement
	// doesn't change the query, only the position).
	const frame = lastFrame();
	expect(frame).toContain('Banana');
});

// ── Test 12: insert at cursor position ───────────────────────────────

test('typing inserts characters at the cursor position', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Type 'a' then move cursor to beginning, then type 'b'.
	// Result should be 'ba'.
	await typeString(stdin, 'a');
	await delay(RENDER_DELAY);

	// Move cursor to beginning.
	stdin.write('\u001B[D');
	await delay(RENDER_DELAY);

	// Type 'b' — inserts at cursor position (index 0), making 'ba'.
	stdin.write('b');
	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();
	// Match-sorter 'ba' should match Banana.
	expect(frame).toContain('Banana');
	// 'ba' does not match Apple, Apricot, Avocado, or Cherry well.
	expect(frame).not.toContain('Apple');
	expect(frame).not.toContain('Cherry');
});

// ── Test 13: down-arrow clamps at end of list ────────────────────────

test('down-arrow clamps selection at last item', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={5} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Sorted order: Apple(0), Apricot(1), Avocado(2), Banana(3), Cherry(4)
	// Press down-arrow 4 times to reach the last item.
	for (let i = 0; i < 4; i++) {
		stdin.write('\u001B[B');
		await delay(RENDER_DELAY);
	}

	await delay(RENDER_DELAY);

	let frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Cherry/);

	// Press down-arrow one more — should stay on Cherry.
	stdin.write('\u001B[B');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Cherry/);
});

// ── Test 14: selectedIndex clamps when items shrink ──────────────────

test('selectedIndex clamps when filtered results shrink', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={5} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Move down to index 2 (Avocado in sorted order).
	stdin.write('\u001B[B');
	await delay(KEY_PRESS_DELAY);
	stdin.write('\u001B[B');
	await delay(INITIAL_RENDER_DELAY);

	let frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Avocado/);

	// Type 'ch' — only Cherry matches, so the list shrinks to 1 item.
	// selectedIndex should clamp to 0.
	await typeString(stdin, 'ch');
	await delay(INITIAL_RENDER_DELAY);

	frame = lastFrame();
	expect(frame).toMatch(/\u25B8\s+Cherry/);
	expect(frame).not.toMatch(/\u25B8\s+Avocado/);
});

// ── Test 15: empty items array shows empty message ───────────────────

test('empty items array shows empty message and no items', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={[]} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	// Default empty message is shown.
	expect(frame).toContain('No matching commands');

	// No item labels or selection markers present.
	expect(frame).not.toContain('Apple');
	expect(frame).not.toContain('Banana');
	expect(frame).not.toMatch(/\u25B8/);
});

// ── Test 16: empty items array — enter does not call onItemSelect ──

test('enter on empty items array does not call onItemSelect', async () => {
	const onItemSelect = vi.fn();

	const {stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette
				items={[]}
				maxVisible={10}
				defaultOpen
				onItemSelect={onItemSelect}
			/>
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Press enter — there is no selected item, so onItemSelect must
	// NOT fire.
	stdin.write('\r');
	await delay(RENDER_DELAY);

	expect(onItemSelect).not.toHaveBeenCalled();
});

// ── Test 17: maxVisible greater than items.length shows all ─────────

test('maxVisible greater than item count shows all items with no overflow indicator', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={20} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	// All 5 items are visible.
	expect(frame).toContain('Apple');
	expect(frame).toContain('Apricot');
	expect(frame).toContain('Avocado');
	expect(frame).toContain('Banana');
	expect(frame).toContain('Cherry');

	// No overflow indicators when maxVisible exceeds total items.
	expect(frame).not.toContain('\u25BC');
	expect(frame).not.toContain('more');
});

// ── Test 18: rapid sequential input filters correctly ───────────────

test('rapid sequential input through typeString filters correctly', async () => {
	const {lastFrame, stdin} = renderWithHost(
		<>
			<Text>base</Text>
			<CommandPalette items={allItems} maxVisible={10} defaultOpen />
		</>,
	);

	await delay(INITIAL_RENDER_DELAY);

	// Rapidly type 'banana' one char at a time (typeString ensures
	// each keystroke is its own event with a small gap). After all
	// chars are typed, only Banana should match.
	await typeString(stdin, 'banana');
	await delay(INITIAL_RENDER_DELAY);

	const frame = lastFrame();

	// Only Banana matches the full 'banana' query.
	expect(frame).toContain('Banana');
	expect(frame).not.toContain('Apple');
	expect(frame).not.toContain('Apricot');
	expect(frame).not.toContain('Avocado');
	expect(frame).not.toContain('Cherry');

	// The single remaining item is selected.
	expect(frame).toMatch(/\u25B8\s+Banana/);
});
