/**
 * Scene 09 — Command Palette.
 *
 * Demonstrates the `<CommandPalette>` component in two modes:
 *
 *   (1) Default mode — built-in match-sorter filtering on `label`,
 *       built-in renderer (▸ highlight), closeOnSelect=true.
 *
 *   (2) Multi-select mode — a custom `renderItem` that shows the
 *       keyboard shortcut alongside the label, and closeOnSelect=false
 *       so the palette stays open after each Enter.
 *
 * ════════════════════════════════════════════════════════════════════
 * CommandPalette: Filterable Keyboard List
 * ════════════════════════════════════════════════════════════════════
 *
 * `<CommandPalette>` is a filterable, keyboard-navigable list overlay. It
 * renders a rounded-border box containing a title row, a filter input with
 * a fake text cursor, and a windowed list of items. It is built on
 * `<Layer>` with a FIXED set of <Layer> settings that are NOT overridable:
 *
 *   ───────── prop ────────── value ─── why ───────────────────────────
 *   capture       true        The palette traps input (FocusTrap) while
 *                            open — keystrokes go to the filter, not the
 *                            background scene.
 *   anchor        'center'    The palette is always perfectly centered.
 *   backdrop      'dim'       A dim backdrop separates the palette from
 *                            the underlying scene.
 *   role          'menu'      Marks the overlay as a menu for the
 *                            dispatcher; used internally by the library.
 *
 * These four are baked into the component and cannot be overridden. If
 * you need different positioning, a non-capturing layer, or no backdrop,
 * drop down to a bare `<Layer>` and build your own list.
 *
 * ── Keyboard behavior ──────────────────────────────────────────────
 *
 *   ───────────── key ───────────── action ────────────────────────────
 *   ↑ / ↓                        Move the selection cursor up/down.
 *   Enter                        Select the highlighted item. Closes the
 *                                 palette too — BUT only when
 *                                 closeOnSelect is true (the default).
 *   Esc                          Close the palette (fires onDismiss).
 *   Backspace                    Delete the character to the left of the
 *                                 text cursor.
 *   ← / →                        Move the text cursor left/right.
 *   Printable char               Insert the character at the text cursor.
 *
 *   Query, selection index, scroll offset, and text-cursor position all
 *   RESET to their defaults every time the palette opens.
 *
 * ── OVERRIDABLE props (all demonstrated below) ─────────────────────
 *
 *   ──────────────── prop ──────────────── default ───────────────────
 *   items                  (required) the command list
 *   renderItem             undefined (built-in ▸ renderer)
 *   filter                 undefined (match-sorter on label)
 *   maxVisible             10
 *   placeholder            'Type a command…'
 *   emptyMessage           'No matching commands'
 *   title                  'Command Palette'
 *   width                  60
 *   z                      200 (above modals at z=100)
 *   open                   undefined (uncontrolled)
 *   onOpenChange           undefined
 *   onItemSelect           undefined
 *   onDismiss              undefined
 *   closeOnSelect          true
 *
 * @module demo/scenes/09-command-palette
 */

import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	CommandPalette,
	useInputCaptureState,
	type CommandPaletteItem,
} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── Command items ────────────────────────────────────────────────────
//
// Each entry has at minimum {id, label}. The CommandPaletteItem type is
// {id: string; label: string; [key: string]: unknown}, so any extra
// fields are allowed and survive filtering/sorting intact. Here every
// item also carries a `shortcut` field — the custom renderItem in
// multi-select mode renders it, but the built-in renderer ignores it.

const items: CommandPaletteItem[] = [
	{id: 'new', label: 'New File', shortcut: 'ctrl-n'},
	{id: 'open', label: 'Open File', shortcut: 'ctrl-o'},
	{id: 'save', label: 'Save', shortcut: 'ctrl-s'},
	{id: 'save-as', label: 'Save As', shortcut: 'ctrl-shift-s'},
	{id: 'close', label: 'Close Tab', shortcut: 'ctrl-w'},
	{id: 'quit', label: 'Quit', shortcut: 'ctrl-q'},
	{id: 'undo', label: 'Undo', shortcut: 'ctrl-z'},
	{id: 'redo', label: 'Redo', shortcut: 'ctrl-y'},
	{id: 'find', label: 'Find', shortcut: 'ctrl-f'},
	{id: 'replace', label: 'Replace', shortcut: 'ctrl-h'},
	{id: 'goto', label: 'Go to Line', shortcut: 'ctrl-g'},
	{id: 'toggle-sidebar', label: 'Toggle Sidebar', shortcut: 'ctrl-b'},
	{id: 'toggle-terminal', label: 'Toggle Terminal', shortcut: 'ctrl-`'},
	{id: 'command-palette', label: 'Command Palette', shortcut: 'ctrl-shift-p'},
	{id: 'format', label: 'Format Document', shortcut: 'shift-alt-f'},
	{id: 'comment', label: 'Toggle Comment', shortcut: 'ctrl-/'},
];

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 09 — `<CommandPalette>` default filtering, navigation, windowing,
 * and multi-select mode with a custom `renderItem`.
 *
 * Keys (cooperatively gated while the palette is capturing input):
 *
 *   - `p` → toggle the command palette open/closed.
 *   - `m` → toggle multi-select mode (swaps the renderer and
 *           closeOnSelect).
 */
export default function Scene09CommandPalette() {
	// ── Declarative visibility / mode state ─────────────────────────
	//
	// showPalette  — controlled open state for the <CommandPalette>.
	//                The `p` key toggles it.
	// multiSelect  — when true, closeOnSelect becomes false (the palette
	//                stays open after Enter) and a custom renderItem is
	//                used to render the shortcut alongside each label.
	//                The `m` key toggles it.
	// lastSelected — the label of the most recently chosen item, shown
	//                in the scene body as feedback.

	/** Controlled open state for the command palette. */
	const [showPalette, setShowPalette] = useState(false);

	/** Controls closeOnSelect and whether a custom renderItem is used. */
	const [multiSelect, setMultiSelect] = useState(false);

	/** Label of the last selected item, shown in the scene body. */
	const [lastSelected, setLastSelected] = useState('—');

	// ── Cooperative input gating ────────────────────────────────────
	//
	// While the palette is open it captures input (capture=true is baked
	// into <CommandPalette>), so isCaptured returns true and we
	// deactivate the scene's own key handler to avoid double-handling.
	const isCaptured = useInputCaptureState();

	// ── Scene input handler ─────────────────────────────────────────
	//
	// A single switch (per the `unicorn/prefer-switch` rule) dispatches
	// the two toggle keys. Each arm flips one boolean state.
	useInput(
		input => {
			switch (input) {
				case 'p': {
					setShowPalette(previous => !previous);
					break;
				}

				case 'm': {
					setMultiSelect(previous => !previous);
					break;
				}

				default: {
					break;
				}
			}
		},
		{isActive: !isCaptured},
	);

	// ── Render ──────────────────────────────────────────────────────

	return (
		<SceneShell
			title="Scene 09 — Command Palette"
			description="Filterable keyboard list: default mode and multi-select mode."
			hints={[
				{key: 'p', label: 'toggle palette'},
				{key: 'm', label: 'toggle multi-select'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/* ── Instructional copy ──────────────────────────────── */}
			<Box flexDirection="column">
				<Text>
					Press <Text bold>p</Text> to open the command palette.
				</Text>
				<Text>
					Press <Text bold>m</Text> to toggle multi-select mode (currently{' '}
					{multiSelect ? 'ON' : 'OFF'}).
				</Text>
				<Text dimColor>Last selected: {lastSelected}</Text>
			</Box>

			{/*
			 * ════════════════════════════════════════════════════════
			 * <CommandPalette> — a filterable, keyboard-navigable list
			 * overlay built on <Layer>.
			 *
			 * FIXED <Layer> settings (NOT overridable):
			 *   capture=true   — traps input while open.
			 *   anchor='center'— always perfectly centered.
			 *   backdrop='dim' — dim backdrop behind the palette.
			 *   role='menu'    — menu semantics for the dispatcher.
			 *
			 * ── Prop walkthrough ───────────────────────────────────
			 *
			 *   items (REQUIRED) — the command list. Each entry must be
			 *     a CommandPaletteItem: {id: string; label: string;
			 *     [key: string]: unknown}. Extra fields (like `shortcut`
			 *     here) survive filtering/sorting and are available to a
			 *     custom renderItem.
			 *
			 *   filter (optional) — a FilterFunction
			 *     (items, query) => items. When omitted (as here) the
			 *     palette falls back to match-sorter on the `label`
			 *     field, which provides fuzzy substring + ranked
			 *     matching out of the box. Pass your own to integrate a
			 *     different search algorithm or to match on extra
			 *     fields.
			 *
			 *   renderItem (optional) — a
			 *     (item, isSelected) => ReactNode. When omitted the
			 *     built-in renderer shows "▸ label" with a cyan-on-gray
			 *     highlight for the selected row. Here we override it in
			 *     multi-select mode to also show the keyboard shortcut
			 *     (via the extra `shortcut` field). When multiSelect is
			 *     false we pass undefined so the default renderer is
			 *     used.
			 *
			 *   maxVisible (default 10) — how many items the list shows
			 *     before windowing kicks in. The palette renders "▲ N
			 *     more" / "▼ N more" indicators above/below the visible
			 *     window. Here we set 5 so you can see the windowing
			 *     indicators with the 16-item list.
			 *
			 *   placeholder (default 'Type a command…') — dim text
			 *     shown in the filter input when the query is empty.
			 *
			 *   emptyMessage (default 'No matching commands') — dim
			 *     text shown when the filter returns zero results.
			 *
			 *   title (default 'Command Palette') — bold header at the
			 *     top of the palette box.
			 *
			 *   width (default 60) — the box width. We use 50 here to
			 *     keep the demo compact.
			 *
			 *   z (default 200) — stacking order. 200 sits above modals
			 *     (which default to z=100), so a palette opened from
			 *     within a modal will render on top.
			 *
			 *   open / onOpenChange — controlled visibility, wired to
			 *     the showPalette state.
			 *
			 *   onItemSelect — fires when the user presses Enter on a
			 *     row. We record the label in lastSelected.
			 *
			 *   closeOnSelect (default true) — whether Enter also
			 *     closes the palette. Set false for multi-select
			 *     patterns where the user picks several items in a row.
			 *     Here it is tied to the multiSelect toggle: when
			 *     multi-select is ON the palette stays open after each
			 *     Enter; when OFF it closes immediately.
			 *
			 * ── Keyboard behavior ─────────────────────────────────
			 *
			 *   ↑ ↓         Move the selection cursor.
			 *   Enter       Select (closes too if closeOnSelect).
			 *   Esc         Close the palette (fires onDismiss).
			 *   Backspace   Delete the char left of the text cursor.
			 *   ← →         Move the text cursor.
			 *   Printable   Insert at the text cursor.
			 *
			 *   Query, selection, scroll offset, and text-cursor
			 *   position all RESET every time the palette opens.
			 * ════════════════════════════════════════════════════════
			 */}
			<CommandPalette
				/* Items (REQUIRED) — CommandPaletteItem[] with extra `shortcut`. */
				items={items}
				/* Filter — omitted → default match-sorter on `label`. */
				/* RenderItem — custom in multi-select mode, else default ▸ renderer. */
				renderItem={
					multiSelect
						? (item, isSelected) => (
								<Text
									color={isSelected ? 'black' : undefined}
									backgroundColor={isSelected ? 'cyan' : undefined}
								>
									{isSelected ? '▸ ' : '  '}
									{item.label}{' '}
									<Text dimColor>{String(item['shortcut'] ?? '')}</Text>
								</Text>
							)
						: undefined
				}
				/* MaxVisible — default 10; here 5 so windowing indicators appear. */
				maxVisible={5}
				/* Placeholder — default 'Type a command…'. */
				/* EmptyMessage — default 'No matching commands'. */
				/* Title — default 'Command Palette'. */
				title="Demo Commands"
				/* Width — default 60. */
				width={50}
				/* Z — default 200 (above modals at z=100). */
				z={200}
				/* Open — controlled visibility. */
				open={showPalette}
				/* OnOpenChange — wired to the state setter. */
				onOpenChange={setShowPalette}
				/* OnItemSelect — record the chosen label. */
				onItemSelect={item => {
					setLastSelected(item.label);
				}}
				/* CloseOnSelect — default true; false in multi-select mode. */
				closeOnSelect={!multiSelect}
			/>
		</SceneShell>
	);
}
