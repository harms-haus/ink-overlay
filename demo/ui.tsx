/**
 * DEMO-ONLY UI HELPERS — NOT PART OF THE LIBRARY API.
 *
 * This file contains two small presentational components used to give every
 * demo scene a consistent look. They exist purely to keep the demos DRY:
 * each scene shows a title, a one-line description, some content, and a row
 * of keybinding hints at the bottom. Rather than repeat that scaffolding in
 * every scene, we centralize it here.
 *
 * ── WHY ──────────────────────────────────────────────────────────────
 *
 * These helpers do **nothing** interesting from an overlay perspective:
 *   - They do NOT create, manage, or render overlays.
 *   - They do NOT touch the overlay store, host, or any library API.
 *   - They contain ZERO logic beyond layout.
 *
 * That is the whole point: the *library* is responsible for overlay
 * behavior, focus, animation, etc. These components are cosmetic demo
 * chrome — a consistent "frame" around whatever scene content is being
 * demonstrated. Keeping them trivial makes it obvious to readers that the
 * interesting work is happening in the library code, not here.
 *
 * ── OPTIONS ──────────────────────────────────────────────────────────
 *
 * If you fork or adapt these demos you can freely change any of:
 *   - The highlight color (currently `"yellow"`) to match your brand.
 *   - The footer style (the separator character, spacing, or border).
 *   - Whether `SceneShell` shows a footer at all (pass an empty `hints`
 *     array to omit the footer entirely).
 *   - The header layout (add a subtitle, an icon, margins, etc.).
 *
 * None of these changes affect the library; they only affect how demos look.
 *
 * @module demo/ui
 */

import {type ReactNode} from 'react';
import {Box, Text} from 'ink';

// ---------------------------------------------------------------------------
// SceneShell
// ---------------------------------------------------------------------------

/**
 * Props for {@link SceneShell}.
 */
type SceneShellProps = {
	/** Bold header shown at the top of the scene. */
	title: string;
	/** Dim descriptive line rendered directly below the title. */
	description: string;
	/** The scene body — whatever the demo is actually showing. */
	children: ReactNode;
	/**
	 * Footer key/label pairs. Each is rendered as a highlighted key followed
	 * by a label. Pass an empty array to omit the footer entirely.
	 */
	hints: Array<{key: string; label: string}>;
};

/**
 * Layout wrapper that gives every demo scene a consistent frame: a title +
 * description header, a flexible content area, and a footer row of
 * keybinding hints separated by a horizontal rule.
 *
 * This is a presentational demo convenience only — it has no knowledge of
 * the overlay system. See the file-level doc comment for details.
 */
export function SceneShell({
	title,
	description,
	children,
	hints,
}: SceneShellProps) {
	// Build the footer hint elements up-front. Each hint is wrapped in its
	// own <Box> so that the parent's flexWrap='wrap' can break the flow
	// between hints on narrow terminals (scenes 08 and 12 carry 9 and 8
	// hints respectively, well beyond an 80-column row). We use a classic
	// for...of loop (rather than Array#forEach) because the project's xo
	// config enforces the `unicorn/no-array-for-each` rule.
	const hintElements: ReactNode[] = [];
	let first = true;
	for (const hint of hints) {
		hintElements.push(
			<Box key={hint.key} marginRight={first ? 0 : 1}>
				<Text>
					<Text bold color='yellow'>
						{hint.key}
					</Text>{' '}
					{hint.label}
				</Text>
			</Box>,
		);
		first = false;
	}

	return (
		<Box flexDirection='column'>
			{/* Header: title + description */}
			<Box flexDirection='column'>
				<Text bold>{title}</Text>
				<Text dimColor>{description}</Text>
			</Box>

			{/* Content area: the scene body */}
			<Box flexDirection='column' flexGrow={1} marginTop={1}>
				{children}
			</Box>

			{/* Footer: keybinding hints, separated by a horizontal rule. */}
			{hints.length > 0 && (
				<Box flexDirection='column' marginTop={1}>
					<Text dimColor>{'─'.repeat(48)}</Text>
					<Box flexWrap='wrap'>{hintElements}</Box>
				</Box>
			)}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// KeyHint
// ---------------------------------------------------------------------------

/**
 * Props for {@link KeyHint}.
 */
type KeyHintProps = {
	/** The key (or key sequence) to highlight inline. */
	children: ReactNode;
};

/**
 * Tiny presentational component for rendering an inline keybinding hint in
 * the scene body — e.g. "Press <KeyHint>Esc</KeyHint> to dismiss".
 *
 * Like {@link SceneShell}, this is purely cosmetic demo chrome. It does not
 * interact with the overlay library in any way.
 */
export function KeyHint({children}: KeyHintProps) {
	return (
		<Text bold color='yellow'>
			{children}
		</Text>
	);
}
