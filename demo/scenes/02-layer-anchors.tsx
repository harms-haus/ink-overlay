/**
 * Scene 02 — Layer Anchors.
 *
 * Demonstrates the `<Layer>` primitive and its two mutually-exclusive
 * positioning strategies: flexbox anchors and explicit offsets.
 *
 * @module demo/scenes/02-layer-anchors
 */

import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	Layer,
	useInputCaptureState,
	type Anchor,
} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── All 9 anchor positions ──────────────────────────────────────────
//
// The `Anchor` union covers every edge + corner + center. We cycle
// through this array with the `a` key.
const anchors: Anchor[] = [
	'center',
	'top',
	'bottom',
	'left',
	'right',
	'top-left',
	'top-right',
	'bottom-left',
	'bottom-right',
];

/**
 * Scene 02 — explores `<Layer>` positioning.
 *
 * ════════════════════════════════════════════════════════════════════
 * POSITIONING STRATEGY 1: FLEXBOX ANCHORS
 * ════════════════════════════════════════════════════════════════════
 *
 * When you pass `anchor`, the host wraps the layer content in a
 * `flexDirection="row"` `<Box>` that fills the screen and uses
 * `alignItems` (cross-axis = vertical) + `justifyContent` (main-axis =
 * horizontal) to place the content. This is pure CSS flexbox — no
 * measurement, no flicker, no JS layout math at render time.
 *
 * The full anchor → flexbox mapping (see `anchorToFlexbox`):
 *
 *   anchor         alignItems    justifyContent
 *   ─────────────  ──────────    ───────────────
 *   center         center        center
 *   top            flex-start    center
 *   bottom         flex-end      center
 *   left           center        flex-start
 *   right          center        flex-end
 *   top-left       flex-start    flex-start
 *   top-right      flex-start    flex-end
 *   bottom-left    flex-end      flex-start
 *   bottom-right   flex-end      flex-end
 *
 * ════════════════════════════════════════════════════════════════════
 * POSITIONING STRATEGY 2: EXPLICIT OFFSETS
 * ════════════════════════════════════════════════════════════════════
 *
 * When you pass `top` / `left` / `right` / `bottom` (and NO `anchor`),
 * the host uses `position="absolute"` with those offsets directly.
 * Values may be a number (cells) OR a percentage string like `'50%'`.
 *
 * ⚠️ ANCHOR AND EXPLICIT OFFSETS ARE MUTUALLY EXCLUSIVE.
 * If `anchor` is set, `top`/`left`/`right`/`bottom` are IGNORED.
 *
 * ════════════════════════════════════════════════════════════════════
 * CONTROLLED VS UNCONTROLLED
 * ════════════════════════════════════════════════════════════════════
 *
 * Pass `open` (a boolean) for CONTROLLED mode — the layer is visible
 * exactly when `open` is true and you own the state.
 * Omit `open` for UNCONTROLLED mode — the layer defaults to open via
 * `defaultOpen` (which itself defaults to `true`).
 *
 * This scene uses `open` (controlled, pinned to `true`) so the layer is
 * always visible while we cycle its configuration.
 *
 * ════════════════════════════════════════════════════════════════════
 * IMPORTANT: `<Layer>` RETURNS `null`
 * ════════════════════════════════════════════════════════════════════
 *
 * `<Layer>` registers itself with the `OverlayHost` and renders nothing.
 * The HOST renders the floating content via the internal
 * `LayerRenderer`. Therefore ALL visual styling (borders, padding,
 * colors) must live in the `children` you pass to `<Layer>`, not on the
 * `<Layer>` itself.
 */
export default function Scene02LayerAnchors() {
	// ── Cooperative input gating ────────────────────────────────────
	//
	// `useInputCaptureState()` returns true when an overlay with
	// `capture` is active. We gate our own `useInput` on `!isCaptured`
	// so that a capturing overlay gets first crack at keypresses.
	const isCaptured = useInputCaptureState();

	// ── State ───────────────────────────────────────────────────────

	// Cycle index into `anchors` (0..8).
	const [anchorIndex, setAnchorIndex] = useState(0);

	// Toggle between anchor mode (false) and explicit-offset mode (true).
	const [useExplicit, setUseExplicit] = useState(false);

	// Toggle between numeric offsets (false) and percentage offsets (true).
	// Only meaningful in explicit mode.
	const [usePercent, setUsePercent] = useState(false);

	// Toggle overflow 'hidden' (true) vs 'visible' (false).
	const [overflowHidden, setOverflowHidden] = useState(false);

	// Toggle a margin object on/off.
	const [useMargin, setUseMargin] = useState(false);

	// ── Input (cooperative: disabled while a capturing overlay is up) ─
	//
	//   a — cycle anchor index (wraps 0..8)
	//   x — toggle anchor vs explicit offsets
	//   p — toggle numeric vs percentage offsets (explicit mode only)
	//   o — toggle overflow hidden / visible
	//   g — toggle margin on / off
	useInput(
		(input: string) => {
			if (input === 'a') {
				setAnchorIndex(i => (i + 1) % anchors.length);
			}

			if (input === 'x') {
				setUseExplicit(v => !v);
			}

			if (input === 'p') {
				setUsePercent(v => !v);
			}

			if (input === 'o') {
				setOverflowHidden(v => !v);
			}

			if (input === 'g') {
				setUseMargin(v => !v);
			}
		},
		{isActive: !isCaptured},
	);

	// ── Derived values ──────────────────────────────────────────────

	const currentAnchor = anchors[anchorIndex];
	const overflow = overflowHidden ? 'hidden' : 'visible';
	const margin = useMargin ? {top: 2, left: 2} : undefined;

	// ── The floating content shown inside the layer ────────────────
	//
	// Because `<Layer>` returns `null` and the host renders its
	// children, all styling lives here in the content.
	function renderContent() {
		if (useExplicit) {
			const offsets = usePercent
				? 'top=\'20%\' left=\'40%\''
				: 'top=5 left=10';
			return (
				<Box
					borderStyle='round'
					borderColor='cyan'
					paddingX={2}
					paddingY={1}
					flexDirection='column'
				>
					<Text bold color='cyan'>
						Explicit Offsets
					</Text>
					<Text>offsets: {offsets}</Text>
					<Text>overflow: {overflow}</Text>
					<Text>margin: {useMargin ? '{top:2, left:2}' : 'none'}</Text>
				</Box>
			);
		}

		return (
			<Box
				borderStyle='round'
				borderColor='yellow'
				paddingX={2}
				paddingY={1}
				flexDirection='column'
			>
				<Text bold color='yellow'>
					Flexbox Anchor
				</Text>
				<Text>anchor: {currentAnchor}</Text>
				<Text>overflow: {overflow}</Text>
				<Text>margin: {useMargin ? '{top:2, left:2}' : 'none'}</Text>
			</Box>
		);
	}

	// ── Hints for the SceneShell footer ────────────────────────────

	const hints = [
		{key: 'a', label: 'cycle anchor'},
		{key: 'x', label: 'explicit/anchor'},
		{key: 'p', label: 'percent/numeric'},
		{key: 'o', label: 'overflow'},
		{key: 'g', label: 'margin'},
		{key: 'Esc', label: 'menu'},
	];

	// ── Overflow note ──────────────────────────────────────────────
	//
	// `overflow="hidden"` clips content to the layer bounds (the inner
	// Box). `overflow="visible"` lets content draw beyond the box —
	// useful for tooltips or menus that may exceed their measured size.

	// ── Margin note ────────────────────────────────────────────────
	//
	// `margin` pushes the layer INWARD from its anchored edge.
	// For example `{top: 2}` pushes the content down 2 rows from the
	// top edge; `{left: 2}` pushes it right 2 columns.

	return (
		<SceneShell
			title='Scene 02 — Layer Anchors'
			description='Cycle all 9 anchors, toggle explicit offsets, overflow, and margin.'
			hints={hints}
		>
			{/* ── Mode indicator ── */}
			<Box marginBottom={1}>
				<Text>
					Mode: {useExplicit ? 'explicit offsets' : 'flexbox anchor'}
					{useExplicit ? (usePercent ? ' (percentage)' : ' (numeric)') : ''}
				</Text>
			</Box>

			{/*
			 * ══════════════════════════════════════════════════════════
			 * POSITIONING STRATEGY 1: FLEXBOX ANCHORS
			 * ══════════════════════════════════════════════════════════
			 *
			 * `anchor` → host uses alignItems + justifyContent on a
			 * full-screen row Box. Pure CSS flexbox under the hood —
			 * no measurement, no flicker.
			 *
			 * ══════════════════════════════════════════════════════════
			 * POSITIONING STRATEGY 2: EXPLICIT OFFSETS
			 * ══════════════════════════════════════════════════════════
			 *
			 * `top`/`left`/`right`/`bottom` → host uses position
			 * 'absolute' with the given offsets. Accepts a number OR a
			 * percentage string (e.g. '50%').
			 *
			 * ⚠️ anchor and explicit offsets are MUTUALLY EXCLUSIVE.
			 * If anchor is set, top/left/right/bottom are ignored.
			 *
			 * `open` is controlled (pinned true) so the layer is always
			 * visible; `<Layer>` returns null — the host renders the
			 * children, so all styling is in renderContent() above.
			 */}
			{useExplicit ? (
				usePercent ? (
					<Layer
						// Percentage-string offsets — resolved relative to
						// the host viewport by Ink's absolute positioning.
						top='20%'
						left='40%'
						z={10}
						overflow={overflow}
						margin={margin}
						open
					>
						{renderContent()}
					</Layer>
				) : (
					<Layer
						// Numeric offsets — literal cell counts from the
						// top-left corner of the host viewport.
						top={5}
						left={10}
						z={10}
						overflow={overflow}
						margin={margin}
						open
					>
						{renderContent()}
					</Layer>
				)
			) : (
				<Layer
					// Flexbox anchor — alignItems/justifyContent on a
					// full-screen row wrapper. See the OPTIONS table in
					// the file-level comment for the full mapping.
					anchor={currentAnchor}
					z={10}
					overflow={overflow}
					margin={margin}
					open
				>
					{renderContent()}
				</Layer>
			)}
		</SceneShell>
	);
}
