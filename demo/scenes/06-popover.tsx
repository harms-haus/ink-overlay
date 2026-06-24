/**
 * Scene 06 — Popover.
 *
 * Demonstrates the third and final positioning strategy: an
 * element-anchored `<Popover>` that measures its anchor and itself, then
 * snaps to a computed position with flip + shift collision handling.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Positioning Strategy 3: Element-Anchored Popover
 * ──────────────────────────────────────────────────────────────────────
 *
 * Strategies 1 (flexbox `anchor`) and 2 (explicit `top`/`left` offsets)
 * both position a layer relative to the VIEWPORT. Strategy 3 positions a
 * layer relative to ANOTHER ELEMENT: the anchor. This is what `<Popover>`
 * is for — floating callouts attached to a specific widget on screen.
 *
 * Unlike `anchor` (instant, no measurement), the Popover must MEASURE both
 * the anchor and its own content before it knows where to paint. That
 * measurement loop is the flash-free strategy described below.
 *
 * ── anchorRef ─────────────────────────────────────────────────────────
 *
 * `<Popover>` does not look up an element by id or selector — it requires a
 * React ref of type `RefObject<DOMElement | null>`. You obtain one via
 * `useRef<DOMElement | null>(null)` and attach it to any renderable `<Box>`
 * (or other ink element). The Popover reads the anchor's yoga layout
 * through that ref every time it repositions.
 *
 * ── placement (all 12 options) ────────────────────────────────────────
 *
 * The `placement` prop names the preferred side + optional cross-axis
 * alignment:
 *
 *   Main-axis sides:
 *     - 'top'            → above the anchor.
 *     - 'bottom'         → below the anchor.
 *     - 'left'           → to the left of the anchor.
 *     - 'right'          → to the right of the anchor.
 *
 *   Cross-axis alignment suffixes (start / end):
 *     - 'top-start'      → above the anchor, cross-aligned to the
 *                          anchor's LEFT edge.
 *     - 'top-end'        → above the anchor, cross-aligned to the
 *                          anchor's RIGHT edge.
 *     - 'bottom-start'   → below the anchor, cross-aligned left.
 *     - 'bottom-end'     → below the anchor, cross-aligned right.
 *     - 'left-start'     → left of the anchor, cross-aligned to the
 *                          anchor's TOP edge.
 *     - 'left-end'       → left of the anchor, cross-aligned bottom.
 *     - 'right-start'    → right of the anchor, cross-aligned top.
 *     - 'right-end'      → right of the anchor, cross-aligned bottom.
 *
 * "start" and "end" refer to the CROSS AXIS (the axis perpendicular to the
 * main placement side). For a vertical placement (top/bottom) the cross
 * axis is horizontal, so start = left and end = right. For a horizontal
 * placement (left/right) the cross axis is vertical, so start = top and
 * end = bottom.
 *
 * ── offset ────────────────────────────────────────────────────────────
 *
 * `offset` is the main-axis gap (in character cells) between the popover
 * and the anchor's edge. Default is `1`. This scene pins it to `1`.
 *
 * ── crossOffset ───────────────────────────────────────────────────────
 *
 * `crossOffset` is the cross-axis shift (in cells) from the anchor's
 * cross-axis start. Default is `0`. Pressing `x` cycles it through
 * `0 → 2 → 4 → 0` so you can watch the popover slide along the cross axis.
 *
 * ── flip ──────────────────────────────────────────────────────────────
 *
 * `flip` (default `true`) mirrors the placement along the MAIN axis when
 * the popover would overflow the viewport — e.g. a `'bottom'` placement
 * that does not fit below the anchor flips to `'top'`. Press `f` to toggle
 * it off and watch the popover clip instead.
 *
 * ── shift ─────────────────────────────────────────────────────────────
 *
 * `shift` (default `true`) clamps the popover within the viewport bounds
 * AFTER flip is resolved. This scene keeps it on.
 *
 * ── collisionPadding ──────────────────────────────────────────────────
 *
 * `collisionPadding` is the extra inset applied during shift clamping. It
 * accepts a single number (applied to all four edges) OR a
 * `Partial<OffsetEdges>` like `{top: 2, left: 2}` for per-edge control.
 * Press `d` to toggle between `0` and `{top: 2, left: 2}` and see the
 * popover pull further inboard from the edges.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Flash-free strategy
 * ──────────────────────────────────────────────────────────────────────
 *
 * The Popover renders OFFSCREEN (`top: -9999`, `left: -9999`) until BOTH
 * the anchor and the popover itself have been measured, then snaps to its
 * final computed position. The content therefore never flashes at (0,0).
 *
 * ──────────────────────────────────────────────────────────────────────
 * Limitation: no ancestor/sibling layout tracking
 * ──────────────────────────────────────────────────────────────────────
 *
 * The Popover repositions on anchor resize, popover content resize, and
 * terminal resize — but it does NOT track ancestor/sibling layout shifts.
 * If surrounding content moves the anchor without changing its
 * parent-relative metrics, the popover stays put. To recover, close and
 * reopen the popover, or key the `<Popover>` on the layout-affecting
 * state.
 *
 * ──────────────────────────────────────────────────────────────────────
 * capture
 * ──────────────────────────────────────────────────────────────────────
 *
 * `capture` defaults to `false` — popovers do not trap input by default.
 * Set `capture={true}` for menu-like popovers that should swallow all
 * keypresses until dismissed.
 *
 * @module demo/scenes/06-popover
 */

import {useState, useRef} from 'react';
import {Box, Text, useInput, type DOMElement} from 'ink';
import {
	Popover,
	useInputCaptureState,
	type Placement,
} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// The placements cycled by the `p` key. Covers the four main sides plus a
// couple of cross-axis-aligned variants so start/end behavior is visible.
const placements: Placement[] = [
	'bottom',
	'top',
	'left',
	'right',
	'bottom-start',
	'bottom-end',
];

// The cross-axis offsets cycled by the `x` key.
const crossOffsets = [0, 2, 4] as const;

/**
 * Scene 06 — element-anchored `<Popover>` with collision detection.
 */
export default function Scene06Popover() {
	// ── Cooperative input gating ────────────────────────────────────
	//
	// `useInputCaptureState()` returns true when an overlay with `capture`
	// is active. We gate this scene's own key handling on `!isCaptured` so
	// that a capturing overlay gets first crack at keypresses.
	const isCaptured = useInputCaptureState();

	// ── State ───────────────────────────────────────────────────────

	/** Index into `placements` — cycles via the `p` key. */
	const [placementIndex, setPlacementIndex] = useState(0);

	/** Controlled popover open state — toggled by the `o` key. */
	const [popoverOpen, setPopoverOpen] = useState(true);

	/** Toggle `flip` on/off — toggled by the `f` key. */
	const [flip, setFlip] = useState(true);

	/** Toggle collisionPadding between `0` and `{top:2,left:2}` — `d` key. */
	const [usePadding, setUsePadding] = useState(false);

	/** Index into `crossOffsets` — cycles via the `x` key. */
	const [crossOffsetIndex, setCrossOffsetIndex] = useState(0);
	const crossOffset = crossOffsets[crossOffsetIndex] ?? 0;

	// ── anchorRef ──────────────────────────────────────────────────
	//
	// REQUIRED by `<Popover>`. The ref must be `RefObject<DOMElement |
	// null>`; obtain it via `useRef<DOMElement | null>(null)` and attach it
	// to a `<Box ref={anchorRef}>` (or any other ink element). The Popover
	// reads the anchor's yoga layout through this ref to position itself.
	const anchorRef = useRef<DOMElement | null>(null);

	// ── Input (cooperative: disabled while a capturing overlay is up) ─
	//
	//   p — cycle placementIndex (wraps)
	//   o — toggle popoverOpen
	//   f — toggle flip
	//   d — toggle usePadding
	//   x — cycle crossOffset among [0, 2, 4] (wraps)
	useInput(
		(input: string) => {
			// `p` → cycle placementIndex with wrap-around.
			if (input === 'p') {
				setPlacementIndex(previous => (previous + 1) % placements.length);
				return;
			}

			// `o` → toggle popoverOpen.
			if (input === 'o') {
				setPopoverOpen(value => !value);
				return;
			}

			// `f` → toggle flip.
			if (input === 'f') {
				setFlip(value => !value);
				return;
			}

			// `d` → toggle usePadding.
			if (input === 'd') {
				setUsePadding(value => !value);
				return;
			}

			// `x` → cycle crossOffset among [0, 2, 4] with wrap-around.
			if (input === 'x') {
				setCrossOffsetIndex(previous => (previous + 1) % crossOffsets.length);
			}
		},
		{isActive: !isCaptured},
	);

	// ── Derived values ─────────────────────────────────────────────

	const placement = placements[placementIndex];

	// ── Render ─────────────────────────────────────────────────────

	return (
		<SceneShell
			title="Scene 06 — Popover"
			description="Element-anchored layer: flip, shift, offset & crossOffset."
			hints={[
				{key: 'p', label: 'cycle placement'},
				{key: 'o', label: 'open/close'},
				{key: 'f', label: 'flip'},
				{key: 'd', label: 'padding'},
				{key: 'x', label: 'crossOffset'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/*
			 * The anchor element. The Popover positions itself relative to
			 * this Box by reading `anchorRef`. Centered so that placement
			 * changes (top/bottom/left/right) are clearly visible.
			 */}
			<Box justifyContent="center" marginTop={4}>
				{/*
				 * `anchorRef` attaches here. The Popover measures this
				 * Box's yoga layout (via the ref) every time it
				 * repositions.
				 */}
				<Box ref={anchorRef} paddingX={1}>
					<Text bold>ANCHOR</Text>
				</Box>
			</Box>

			{/*
			 * ══════════════════════════════════════════════════════════
			 * Positioning Strategy 3: Element-Anchored Popover
			 * ══════════════════════════════════════════════════════════
			 *
			 * `placement`        → preferred side + cross-axis alignment
			 *                      (see the 12 options documented at the
			 *                      top of this file).
			 * `offset`           → main-axis gap from the anchor edge
			 *                      (cells). Default 1.
			 * `crossOffset`      → cross-axis shift from the anchor's
			 *                      cross-axis start (cells). Default 0.
			 * `flip`             → mirror the main axis on overflow
			 *                      (e.g. 'bottom' → 'top'). Default true.
			 * `shift`            → clamp within the viewport bounds after
			 *                      flip. Default true.
			 * `collisionPadding` → extra inset during shift clamping.
			 *                      A number (all edges) OR
			 *                      Partial<OffsetEdges> like
			 *                      {top: 2, left: 2}. Default 0.
			 *
			 * Flash-free strategy: the Popover renders offscreen
			 * (top: -9999, left: -9999) until BOTH the anchor and the
			 * popover have been measured, then snaps to its final
			 * position — never flashing at (0,0).
			 *
			 * Limitation: the Popover does NOT track ancestor/sibling
			 * layout shifts. If surrounding content moves the anchor
			 * without changing its parent-relative metrics, the popover
			 * stays put — close/reopen it, or key the <Popover> on the
			 * layout-affecting state.
			 *
			 * `capture` defaults to false (popovers don't trap input by
			 * default); set `capture={true}` for menu-like popovers.
			 */}
			{placement !== undefined && (
				<Popover
					anchorRef={anchorRef}
					placement={placement}
					open={popoverOpen}
					onOpenChange={() => {
						// Controlled: we own the open state via the `o` key,
						// so we ignore external open-change requests here.
					}}
					flip={flip}
					shift
					offset={1}
					crossOffset={crossOffset}
					collisionPadding={usePadding ? {top: 2, left: 2} : 0}
					z={50}
				>
					<Box borderStyle="round" paddingX={1}>
						<Text>placement: {placement}</Text>
					</Box>
				</Popover>
			)}
		</SceneShell>
	);
}
