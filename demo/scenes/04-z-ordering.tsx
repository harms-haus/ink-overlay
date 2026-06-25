/**
 * Scene 04 — Z-Ordering.
 *
 * Demonstrates `z`-controlled paint order across multiple simultaneously
 * visible layers.
 *
 * ════════════════════════════════════════════════════════════════════
 * Z-Ordering: Higher z Paints on Top
 * ════════════════════════════════════════════════════════════════════
 *
 * Each `<Layer>` carries a numeric `z` value (default 0). The framework
 * sorts layer descriptors by `(z, order)` and renders them back-to-front
 * in that sequence, so a higher `z` paints LATER and therefore appears ON
 * TOP of lower-`z` siblings. When two layers share the same `z`, the tie
 * is broken by `order` — the order in which the layers were
 * registered/inserted into the host.
 *
 * WHY `order` exists separately from `z`: imperative overlays (created via
 * `overlay.open()`) are assigned an `order` starting at
 * `IMPERATIVE_ORDER_BASE = 10_000_000` (see `host.tsx`). Declarative
 * overlays (like the `<Layer>` components in this scene) receive an
 * `order` that grows from 0. This guarantees imperative layers ALWAYS sort
 * AFTER declarative ones at the same `z`, so declarative and imperative
 * layers coexist deterministically — an imperative toast or popover will
 * never be buried beneath a declarative layer at the same `z`.
 *
 * IMPORTANT: Ink (and terminals in general) have NO real z-index. Paint
 * order is simply React tree-traversal order. The framework arranges the
 * layer nodes into the correct back-to-front sequence by sorting their
 * descriptors by `(z, order)` before rendering — there is no native
 * stacking context.
 *
 * ── Why `margin` is used here ─────────────────────────────────────────
 *
 * All three layers use `anchor='center'`, so without any margin they would
 * perfectly overlap at the centre of the screen and you would only see the
 * topmost (highest `z`). The `margin` prop pushes each layer slightly off
 * centre so the stacking staircase is VISIBLE — you can see all three
 * bordered boxes fanning out and confirm that higher `z` paints on top.
 *
 * @module demo/scenes/04-z-ordering
 */

import {useState} from 'react';
import {Box, Text} from 'ink';
import {Layer} from '../../src/index.js';
import {SceneShell} from '../ui.js';
import {useGatedInput} from '../hooks.js';

// ── Visibility keys for the three demo layers ───────────────────────
//
// We track each layer's visibility independently so the user can toggle
// them on and off to observe how removing a layer affects the stacking.
type LayerKey = 'a' | 'b' | 'c';

/**
 * Scene 04 — z-controlled paint order across three layers.
 *
 * Press `1`, `2`, or `3` to toggle layers A, B, and C respectively. Each
 * layer is centred (`anchor='center'`) and offset by a small `margin` so
 * all three remain visible as a diagonal staircase.
 */
export default function Scene04ZOrdering() {
	// ── State ────────────────────────────────────────────────────────

	/** Per-layer visibility flags. All three start visible. */
	const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
		a: true,
		b: true,
		c: true,
	});

	// ── Scene input handler ──────────────────────────────────────────
	//
	// `1` → toggle layer A (z=10), `2` → toggle layer B (z=20),
	// `3` → toggle layer C (z=30). The `unicorn/prefer-switch` rule
	// requires a switch on the input character here.
	useGatedInput((input: string) => {
		switch (input) {
			case '1': {
				setVisible(previous => ({...previous, a: !previous.a}));
				break;
			}

			case '2': {
				setVisible(previous => ({...previous, b: !previous.b}));
				break;
			}

			case '3': {
				setVisible(previous => ({...previous, c: !previous.c}));
				break;
			}

			default: {
				break;
			}
		}
	});

	// ── Render ───────────────────────────────────────────────────────
	//
	// Three conditionally-mounted `<Layer>` components. Each is centred
	// (`anchor='center'`) and given a small `margin` offset so the
	// stacking is visible. They are conditionally mounted (rather than
	// controlled via `open`) so that toggling off truly removes them from
	// the host's layer list — making the paint-order effect unmistakable.

	return (
		<SceneShell
			title="Scene 04 — Z-Ordering"
			description="Higher z paints on top. Toggle layers to see paint order."
			hints={[
				{key: '1', label: 'toggle A (z=10)'},
				{key: '2', label: 'toggle B (z=20)'},
				{key: '3', label: 'toggle C (z=30)'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/*
			 * ══════════════════════════════════════════════════════════
			 * LAYER A — z=10 (bottom of the stack)
			 * ══════════════════════════════════════════════════════════
			 *
			 * `z` (default 0): higher values paint LATER / on top. Ties
			 * are broken by insertion/registration order.
			 *
			 * `margin` (here {top: 0, left: 0}): used purely to offset
			 * the layers so the stacking is VISIBLE. Without margin all
			 * three would perfectly overlap and you'd only see the
			 * topmost. Ink has no real z-index; paint order = React tree
			 * traversal order, and the framework arranges layer nodes in
			 * the correct back-to-front sequence by sorting descriptors
			 * by (z, order).
			 */}
			{visible.a && (
				<Layer
					anchor="center"
					// Layer A's z=10 is the LOWEST of the three, so it paints
					// first and ends up on the BOTTOM of the visible stack.
					z={10}
					// No offset — this is the base of the staircase.
					margin={{top: 0, left: 0}}
					open
				>
					<Box
						borderStyle="round"
						borderColor="red"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="red">
							z=10 (bottom)
						</Text>
					</Box>
				</Layer>
			)}

			{/*
			 * ══════════════════════════════════════════════════════════
			 * LAYER B — z=20 (middle of the stack)
			 * ══════════════════════════════════════════════════════════
			 *
			 * Same `anchor='center'`, but `z=20` paints AFTER layer A so
			 * it appears ON TOP of the red box. The `margin` offsets it
			 * down-right so you can see both boxes at once.
			 *
			 * WHY imperative overlays sort after declarative ones:
			 * `overlay.open()` assigns `order` starting at
			 * IMPERATIVE_ORDER_BASE = 10,000,000, so imperative layers
			 * ALWAYS sort AFTER declarative layers at the same z — this
			 * makes declarative and imperative layers coexist
			 * deterministically.
			 */}
			{visible.b && (
				<Layer
					anchor="center"
					// Layer B's z=20 sits in the middle — paints on top of z=10.
					z={20}
					// Offset down 2 rows, right 4 columns — middle step.
					margin={{top: 2, left: 4}}
					open
				>
					<Box
						borderStyle="round"
						borderColor="green"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="green">
							z=20 (middle)
						</Text>
					</Box>
				</Layer>
			)}

			{/*
			 * ══════════════════════════════════════════════════════════
			 * LAYER C — z=30 (top of the stack)
			 * ══════════════════════════════════════════════════════════
			 *
			 * `z=30` is the highest, so this paints LAST and sits on TOP
			 * of both lower layers. We keep `backdrop='none'` so all
			 * three remain visible simultaneously — a backdrop would
			 * overpaint (occlude) the layers beneath.
			 *
			 * `margin` offsets it further down-right so the full
			 * staircase is visible: red → green → blue, each painting on
			 * top of the last.
			 */}
			{visible.c && (
				<Layer
					anchor="center"
					// Layer C's z=30 is the highest — paints on top of everything below.
					z={30}
					// Keep it simple: no backdrop so all three layers stay
					// visible at once.
					backdrop="none"
					// Offset down 4 rows, right 8 columns — top step.
					margin={{top: 4, left: 8}}
					open
				>
					<Box
						borderStyle="round"
						borderColor="blue"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="blue">
							z=30 (top)
						</Text>
					</Box>
				</Layer>
			)}
		</SceneShell>
	);
}
