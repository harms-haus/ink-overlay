# `<CommandPalette>` — Filterable Keyboard List Overlay

`<CommandPalette>` is a filterable, keyboard-navigable list overlay built on [`<Layer>`](./layers.md) with `capture` and `anchor='center'`. It renders a rounded-border box containing a **title row**, a **filter input** (with a fake inverse-video cursor), and a **windowed item list** that scrolls to follow the selection. Input is captured via the framework's LIFO dispatcher, so keys the palette consumes are blocked from reaching lower-priority handlers while it is open; for full gating of background components, those components must cooperatively use [`useInputCaptureState()`](../services/hooks.md). Mount it anywhere inside an [`<OverlayHost>`](./overlay-host.md) tree.

## Keyboard navigation

| Key                                    | Action                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Up / Down arrows**                   | Move the selection one row (clamped to `0…filtered.length - 1`).                              |
| **Enter**                              | Invoke `onItemSelect(item)`. If `closeOnSelect` is `true` (default), the palette also closes. |
| **Escape**                             | Close the palette and call `onDismiss`.                                                       |
| **Backspace**                          | Delete the character to the left of the cursor.                                               |
| **Left / Right arrows**                | Move the text-edit cursor within the query.                                                   |
| **Printable char**                     | Insert at the cursor; the filtered list updates on every keystroke.                           |
| **Unhandled keys** (Ctrl+C, Tab, etc.) | Not consumed — fall through to lower-priority handlers.                                       |

## Props

| Prop            | Type                                     | Default                   | Description                                                                                                                                                                                   |
| --------------- | ---------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`         | `CommandPaletteItem[]`                   | —                         | **Required.** Items to filter and display. Each item is `{id: string; label: string; [key: string]: unknown}` — arbitrary extra fields are allowed and visible to your `filter`/`renderItem`. |
| `renderItem`    | `(item, isSelected) => ReactNode`        | —                         | Custom renderer for a single row. Receives the item and a `isSelected` boolean. Overrides the built-in `▸ label` row.                                                                         |
| `filter`        | `(items, query) => CommandPaletteItem[]` | `match-sorter` on `label` | Custom filter function. Replaces `match-sorter` entirely. See [Custom filter](#custom-filter-function) below.                                                                                 |
| `maxVisible`    | `number`                                 | `10`                      | Window size (rows shown before scroll indicators appear).                                                                                                                                     |
| `placeholder`   | `string`                                 | `'Type a command…'`       | Dim text shown in the input row when the query is empty.                                                                                                                                      |
| `emptyMessage`  | `string`                                 | `'No matching commands'`  | Shown when `filtered.length === 0`.                                                                                                                                                           |
| `onItemSelect`  | `(item) => void`                         | —                         | Called with the selected item when **Enter** is pressed. Not called if the list is empty.                                                                                                     |
| `closeOnSelect` | `boolean`                                | `true`                    | If `true`, Enter closes the palette after invoking `onItemSelect`. Set to `false` to keep the palette open and manage closing yourself via `onOpenChange`.                                    |
| `onDismiss`     | `() => void`                             | —                         | Called on **Escape**, _in addition to_ `onOpenChange(false)`. Reserve for side effects — see notes below.                                                                                     |
| `open`          | `boolean`                                | —                         | Controlled open state. Omit for uncontrolled mode.                                                                                                                                            |
| `defaultOpen`   | `boolean`                                | `true`                    | Initial open state in uncontrolled mode.                                                                                                                                                      |
| `onOpenChange`  | `(open: boolean) => void`                | —                         | Called whenever open state changes (both modes).                                                                                                                                              |
| `title`         | `string`                                 | `'Command Palette'`       | Bold text rendered in the title row.                                                                                                                                                          |
| `width`         | `number \| string`                       | `60`                      | Width of the bordered box (passed to the inner `<Box>`).                                                                                                                                      |
| `z`             | `number`                                 | `200`                     | Z-level passed to `<Layer>` for sorting against other layers.                                                                                                                                 |

### Fixed `<Layer>` settings

These `<Layer>` props are hardcoded and cannot be overridden through `<CommandPalette>`:

| `<Layer>` prop | Value                  | Effect                                                                                               |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `anchor`       | `'center'`             | Always centered.                                                                                     |
| `capture`      | `true`                 | Always owns raw mode + focus trap while open.                                                        |
| `backdrop`     | `'dim'`                | Dim backdrop behind the box.                                                                         |
| `role`         | `'menu'`               | Affects backdrop-input scoping (non-Escape input does **not** auto-dismiss).                         |
| `overflow`     | `'hidden'` (inherited) | Inherits `<Layer>`'s default (`overflow='hidden'`); cannot be overridden through `<CommandPalette>`. |

For control over these, use a bare [`<Layer>`](./layers.md) and compose your own list UI.

## Behavior notes

- **State resets on every open.** When `isOpen` transitions from `false` to `true`, `query`, `cursorIndex`, `selectedIndex`, and scroll `offset` all reset to defaults — users always start from a clean slate. The reset only fires on a `false → true` transition, so re-rendering an already-open palette does not wipe the current query.
- **Query changes also reset the selection.** Every keystroke sets `selectedIndex` and `offset` back to `0`, so the top match stays selected as you refine the query.
- **Gray `❯` prompt prefix.** The filter input row always begins with a gray `❯` (U+276F) prompt character, followed by the query (or placeholder).
- **Visible cursor in the empty state.** When no query has been typed, the filter input renders the dimmed `placeholder` followed by an inverse-video space block (`chalk.inverse(' ')`) so the cursor position is always visible.
- **`match-sorter` is the default filter.** Override it with a [`filter` prop](#custom-filter-function) — the default is only loaded if `filter` is omitted.
- **`onDismiss` vs `onOpenChange`.** Escape is consumed by `<LayerRenderer>`'s handler, which calls `<Layer>`'s dismiss handler — so `onDismiss?.()` fires **first**, then `handleOpenChange(false)` (which drives `onOpenChange`). Because `handleOpenChange` already drives state closure (controlled or uncontrolled), **do not pass an `onDismiss` that sets `open=false`** — that would be redundant. Reserve `onDismiss` for side effects (logging, analytics, teardown).
- **`onItemSelect` is not called on an empty list.** If `filtered.length === 0`, Enter is consumed but no callback fires.

## Examples

### Basic palette

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, CommandPalette} from '@harms-haus/ink-overlay';

const items = [
	{id: 'save', label: 'Save file'},
	{id: 'open', label: 'Open file'},
	{id: 'quit', label: 'Quit'},
];

function App() {
	const [open, setOpen] = useState(false);

	return (
		<OverlayHost>
			<Box padding={1}>
				<Text>Press p to open the palette</Text>
			</Box>

			<CommandPalette
				open={open}
				onOpenChange={setOpen}
				items={items}
				onItemSelect={item => {
					console.log('Selected:', item.id);
					// closeOnSelect defaults to true, so Enter already
					// closes the palette — no manual setOpen(false) needed.
				}}
			/>
		</OverlayHost>
	);
}
```

Note: `onDismiss` is omitted. Escape is handled by `onOpenChange(setOpen)`, which already sets state. If you need to know that Escape specifically was pressed, use `onDismiss` for side effects only — never to set `open=false`.

### Custom filter function

Replace `match-sorter` entirely by passing a `filter` callback. The function receives the full `items` array and the current `query`, and must return the filtered array (ordered however you like). Returning the original array unfiltered turns the palette into a plain keyboard-navigable list.

```tsx
import {OverlayHost, CommandPalette} from '@harms-haus/ink-overlay';
import type {CommandPaletteItem} from '@harms-haus/ink-overlay';

const items: CommandPaletteItem[] = [
	{id: 'ts', label: 'TypeScript', tags: ['language', 'typed']},
	{id: 'js', label: 'JavaScript', tags: ['language']},
	{id: 'go', label: 'Go', tags: ['language', 'compiled']},
];

// Prefix match across label and tags instead of match-sorter fuzzy ranking.
const prefixFilter = (
	items: CommandPaletteItem[],
	query: string,
): CommandPaletteItem[] => {
	const q = query.toLowerCase();
	return items.filter(
		it =>
			it.label.toLowerCase().includes(q) ||
			(it.tags as string[]).some(t => t.toLowerCase().includes(q)),
	);
};

function App() {
	return (
		<OverlayHost>
			<CommandPalette
				items={items}
				filter={prefixFilter}
				placeholder="Filter languages…"
				onItemSelect={item => console.log(item.id)}
			/>
		</OverlayHost>
	);
}
```

### Custom `renderItem`

Pass `renderItem` to render each row yourself. It receives the item and an `isSelected` boolean — use it to add icons, descriptions, keybindings, or color logic. The default renderer is:

```tsx
<Text
	color={isSelected ? 'cyan' : undefined}
	backgroundColor={isSelected ? 'gray' : undefined}
>
	{isSelected ? '▸' : ' '} {item.label}
</Text>
```

A richer version:

```tsx
import {Text} from 'ink';
import {OverlayHost, CommandPalette} from '@harms-haus/ink-overlay';

const items = [
	{id: 'save', label: 'Save file', shortcut: '⌘S'},
	{id: 'open', label: 'Open file', shortcut: '⌘O'},
	{id: 'quit', label: 'Quit', shortcut: '⌘Q'},
];

function App() {
	return (
		<OverlayHost>
			<CommandPalette
				items={items}
				title="Commands"
				renderItem={(item, isSelected) => (
					<Text
						color={isSelected ? 'black' : undefined}
						backgroundColor={isSelected ? 'cyan' : undefined}
					>
						{isSelected ? '▸ ' : '  '}
						{item.label}
						{'  '}
						<Text dimColor>{item.shortcut as string}</Text>
					</Text>
				)}
				onItemSelect={item => console.log(item.id)}
			/>
		</OverlayHost>
	);
}
```

### `closeOnSelect={false}` — keep the palette open

Set `closeOnSelect={false}` to keep the palette open after Enter. Use this for multi-select workflows or when you want to perform an action without dismissing. Closing is then your responsibility — drive it through `onOpenChange` from the outside, or let Escape close it as usual.

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, CommandPalette} from '@harms-haus/ink-overlay';

const items = [
	{id: 'bold', label: 'Bold'},
	{id: 'italic', label: 'Italic'},
	{id: 'underline', label: 'Underline'},
];

function App() {
	const [open, setOpen] = useState(true);
	const [applied, setApplied] = useState<string[]>([]);

	return (
		<OverlayHost>
			<Box padding={1}>
				<Text>Applied: {applied.join(', ') || '(none)'}</Text>
			</Box>

			<CommandPalette
				open={open}
				onOpenChange={setOpen}
				items={items}
				closeOnSelect={false}
				onItemSelect={item => {
					setApplied(prev =>
						prev.includes(item.id)
							? prev.filter(id => id !== item.id)
							: [...prev, item.id],
					);
				}}
			/>
		</OverlayHost>
	);
}
```

Here `onOpenChange(setOpen)` is the sole authority over open state. There is no redundant `onDismiss` that calls `setOpen(false)` — Escape triggers `onDismiss?.()` first (via `<Layer>`'s dismiss handler), then `handleOpenChange(false)` (which calls `onOpenChange`). `onDismiss` is omitted here, so Escape goes straight to `handleOpenChange(false)`.

## See also

- [`<Layer>`](./layers.md) — the foundation primitive `<CommandPalette>` is built on (`capture`, `anchor`, `role='menu'`, `backdrop='dim'`).
- [`<OverlayHost>`](./overlay-host.md) — required root provider.
- [Hooks](../services/hooks.md) — `useInputCaptureState` and `useRegisterInput`, which the palette uses internally.
- [Imperative API](../services/imperative-api.md) — for opening overlays (including palettes) without a hook.
