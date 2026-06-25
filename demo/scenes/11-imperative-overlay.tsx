/**
 * Scene 11 — Imperative Overlay Service.
 *
 * Demonstrates the `overlay` imperative service: `open`, `close`,
 * `closeAll`, and `update` (including an atomic content replace).
 *
 * ════════════════════════════════════════════════════════════════════
 * Imperative Overlay Service
 * ════════════════════════════════════════════════════════════════════
 *
 * The `overlay` object is a thin imperative wrapper around the overlay
 * store. Unlike the declarative `<Layer>` / `<Modal>` components — whose
 * visibility is driven by React state in the tree — the imperative API
 * lets you open, update, and close overlays from anywhere: a plain
 * function, a key handler, a network callback, etc. No hook or provider
 * plumbing is required beyond the single `<OverlayHost>` mounted in the
 * app root.
 *
 * The four methods are:
 *
 *   ──────────────────── method ──────────────────────────────────────
 *   overlay.open(content, options?)   → string (id)
 *     `content` is a ReactNode; `options` is a `LayerOpts` object — the
 *     SAME shape of props that `<Layer>` accepts (anchor, backdrop, z,
 *     capture, role, transition, onDismiss, etc.). Returns the string id
 *     of the new overlay entry, which you pass back to `close` / `update`.
 *
 *   overlay.close(id)                 → void
 *     Closes the single overlay identified by `id`.
 *
 *   overlay.closeAll()                → void
 *     Closes every imperative overlay currently tracked by the store.
 *
 *   overlay.update(id, patch, newContent?) → void
 *     Shallow-merges `patch` (a `Partial<LayerOpts>`) into the existing
 *     entry's options AND optionally replaces the content. Both the
 *     option patch and the content swap land in a SINGLE store notify,
 *     so subscribers see one re-render — no close+open flicker.
 *
 * ── Deterministic ordering vs declarative overlays ─────────────────
 *
 * Imperative overlays always sort AFTER declarative overlays at the same
 * `z`. Internally the host assigns imperative entries an `order` value
 * starting at `IMPERATIVE_ORDER_BASE = 10_000_000` (see `host.tsx`),
 * whereas declarative `<Layer>` components receive an `order` that grows
 * from 0. This guarantees imperative and declarative layers coexist
 * deterministically — an imperative overlay never buries a declarative
 * one at the same `z`, and vice versa.
 *
 * ── Safe to call before the host mounts ────────────────────────────
 *
 * It is safe to call `overlay.open()` BEFORE `<OverlayHost>` mounts. The
 * store buffers the entries and surfaces them when the host subscribes.
 * This means an imperative overlay opened during module evaluation (or
 * before the first paint) will appear as soon as the host is ready — no
 * race, no lost overlay.
 *
 * ── capture: true — input trapping ─────────────────────────────────
 *
 * Setting `capture: true` in the options enables input trapping + raw
 * mode: the overlay's content can hook into the LIFO dispatcher (via
 * `useRegisterInput` inside its children) exactly like any capturing
 * `<Layer>`. Once a capturing imperative overlay is open, this scene's
 * keys will NOT fire — the cooperative gate `isCaptured` becomes true.
 *
 * IMPORTANT teaching point: because variant 3 uses `capture: true`, once
 * it is open the scene's `c` (closeAll) key is trapped too — you CANNOT
 * dismiss a capturing imperative overlay from the scene's own key
 * handler. A capturing imperative overlay behaves exactly like a
 * `<Modal>`: to dismiss it you must close it programmatically from
 * WITHIN its content — e.g. a child component that calls
 * `useRegisterInput` and then `overlay.close(id)` when Enter (or `c`)
 * is pressed. This scene does exactly that: the variant-3 content
 * includes a `<CapturingOverlayDismiss>` child that registers a LIFO
 * input handler, so pressing Enter or `c` dismisses the capturing
 * overlay even while input is trapped.
 *
 * @module demo/scenes/11-imperative-overlay
 */

import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {overlay, useRegisterInput} from '../../src/index.js';
import {SceneShell} from '../ui.js';
import {useGatedInput} from '../hooks.js';

// ── Capturing-overlay dismiss helper ────────────────────────────────

/**
 * In-content dismiss for the capturing (variant-3) overlay.
 *
 * Because `capture: true` traps all input, the scene's own `useInput`
 * is gated off and cannot close the overlay. This component registers
 * a handler directly on the LIFO dispatcher via `useRegisterInput`, so
 * it fires EVEN WHILE input is captured. Pressing Enter (or `c`)
 * closes the overlay by its id.
 *
 * `overlay.open()` generates its own id and does NOT accept a custom
 * one (see `src/store.ts` / `src/types.ts`), so we read the id lazily
 * via `getOverlayId()`: the caller assigns the returned id to a holder
 * object AFTER `overlay.open()` returns, and by the time a key is
 * pressed the holder is populated.
 */
function CapturingOverlayDismiss({getOverlayId}: {getOverlayId: () => string}) {
	useRegisterInput('capturing-overlay-dismiss', (input, key) => {
		if (key.return || input === 'c' || key.escape) {
			overlay.close(getOverlayId());
			return true;
		}

		return false;
	});
	return null;
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 11 — the imperative `overlay` service.
 *
 * Keys (cooperatively gated while a capturing overlay is open):
 *
 *   - `1` → open a centred, dimmed overlay (tracked id for the update
 *           demo; capped at 3 concurrent — oldest is evicted first).
 *   - `2` → open a top-anchored, backdrop-less overlay.
 *   - `3` → open a CAPTURING centred overlay (input is trapped!);
 *           press Enter or `c` inside it to dismiss via the
 *           in-content `useRegisterInput` handler.
 *   - `u` → update the FIRST variant-1 overlay: patch backdrop to
 *           'opaque' AND atomically replace its content.
 *   - `c` → closeAll + reset the local tracking state.
 */
export default function Scene11ImperativeOverlay() {
	// ── Local state ──────────────────────────────────────────────────
	//
	// `variant1Ids` tracks ONLY variant-1 overlay ids so we can (a)
	// enforce the 3-overlay cap and (b) target the FIRST one with the
	// `u` (update) key. `allIds` tracks EVERY overlay id (all variants)
	// so the displayed count is honest. The imperative store does NOT
	// notify React when an overlay opens — it is fire-and-forget — so we
	// mirror the ids here for display/cap purposes only.
	const [variant1Ids, setVariant1Ids] = useState<string[]>([]);
	const [allIds, setAllIds] = useState<string[]>([]);

	/** How many times the `u` key has updated the first overlay. */
	const [updateCount, setUpdateCount] = useState(0);

	// ── Unmount cleanup — prevents ghost-overlay leak ─────────────────
	//
	// The imperative `overlay` service writes to a module-singleton store
	// that persists across scene changes. Without this cleanup, overlays
	// left open when the user navigates away (Esc → menu) would ghost
	// over the menu and other scenes. closeAll() on unmount guarantees a
	// clean slate.
	useEffect(
		() => () => {
			overlay.closeAll();
		},
		[],
	);

	// ── Scene input handler ──────────────────────────────────────────
	//
	// A single switch (per the `unicorn/prefer-switch` rule) dispatches
	// the five keys. Each arm is wrapped in braces because several of
	// the `overlay.*` methods return void and the project's xo config
	// enforces `no-confusing-void-expression`.
	useGatedInput((input: string) => {
		switch (input) {
			case '1': {
				// ── variant 1: centred, dimmed overlay ───────────────
				//
				// overlay.open(content, options?) returns a STRING id.
				// `content` is a ReactNode; `options` is LayerOpts —
				// the SAME props <Layer> accepts. We capture the id so
				// the `u` key can target the FIRST variant-1 overlay
				// for the update demo below.
				//
				// Cap at 3 concurrent variant-1 overlays: when at the
				// limit, evict the OLDEST before opening a new one so
				// they don't accumulate indefinitely.
				if (variant1Ids.length >= 3) {
					const oldest = variant1Ids[0]!;
					overlay.close(oldest);
					setVariant1Ids(previous => previous.slice(1));
					setAllIds(previous => previous.filter(i => i !== oldest));
				}

				const id = overlay.open(
					<Box borderStyle="round" padding={1}>
						<Text>{`Centered overlay #${variant1Ids.length + 1}`}</Text>
					</Box>,
					{anchor: 'center', backdrop: 'dim', z: 50},
				);
				setVariant1Ids(previous => [...previous, id]);
				setAllIds(previous => [...previous, id]);
				break;
			}

			case '2': {
				// ── variant 2: top-anchored, backdrop-less overlay ──
				//
				// Same open() call, different LayerOpts: anchor='top'
				// pins it to the top edge, backdrop='none' means no
				// dim/opaque wash behind it. We capture the id so the
				// display row stays honest about how many overlays are
				// live across ALL variants.
				const id2 = overlay.open(
					<Box borderStyle="round" paddingX={1}>
						<Text>Top-anchored overlay</Text>
					</Box>,
					{anchor: 'top', backdrop: 'none', z: 60},
				);
				setAllIds(previous => [...previous, id2]);
				break;
			}

			case '3': {
				// ── variant 3: CAPTURING overlay (input is trapped!) ─
				//
				// capture: true enables input trapping + raw mode. The
				// overlay's content can hook into the LIFO dispatcher
				// via useRegisterInput — exactly like any capturing
				// <Layer>. Once this is open the scene's keys are
				// gated off (isCaptured becomes true), so you CANNOT
				// close it with the scene's `c` key. The overlay is
				// dismissible from WITHIN: a <CapturingOverlayDismiss>
				// child registers a LIFO handler that closes the
				// overlay when Enter or `c` is pressed.
				//
				// overlay.open() generates its own id and does NOT
				// accept a custom one, so we use a mutable holder: the
				// dismiss component reads `holder.id` lazily (only when
				// a key is pressed, by which point the assignment below
				// has already run).
				const holder: {id: string} = {id: ''};
				const id3 = overlay.open(
					<>
						<Box borderStyle="round" padding={1} flexDirection="column">
							<Text>Capturing overlay — input is trapped.</Text>
							<Text dimColor>
								Press Enter (or c) to close via an in-content useRegisterInput
								handler.
							</Text>
						</Box>
						<CapturingOverlayDismiss getOverlayId={() => holder.id} />
					</>,
					{
						anchor: 'center',
						capture: true,
						backdrop: 'opaque',
						z: 70,
					},
				);
				holder.id = id3;
				setAllIds(previous => [...previous, id3]);
				break;
			}

			case 'u': {
				// ── update: atomic patch + content replace ──────────
				//
				// overlay.update(id, patch, newContent?) shallow-merges
				// the patch (Partial<LayerOpts>) into the existing
				// entry AND optionally replaces the content — both in
				// a SINGLE store notify. Here we patch backdrop to
				// 'opaque' AND swap the text in one shot. We target the
				// FIRST variant-1 overlay (variant1Ids[0]).
				const first = variant1Ids[0];
				if (first) {
					overlay.update(
						first,
						{backdrop: 'opaque'},
						<Box borderStyle="round" padding={1}>
							<Text>{`Updated content (update #${updateCount + 1})`}</Text>
						</Box>,
					);
					setUpdateCount(count => count + 1);
				}

				break;
			}

			case 'c': {
				// ── closeAll + reset local tracking ─────────────────
				//
				// overlay.closeAll() closes every imperative overlay
				// tracked by the store. We also reset the local
				// mirror state so the display row and update counter
				// start fresh. NOTE: this key will NOT fire while
				// variant 3 (capture: true) is open — see that arm.
				overlay.closeAll();
				setVariant1Ids([]);
				setAllIds([]);
				setUpdateCount(0);
				break;
			}

			default: {
				break;
			}
		}
	});

	// ── Render ───────────────────────────────────────────────────────

	return (
		<SceneShell
			title="Scene 11 — Imperative Overlay Service"
			description="overlay.open / close / closeAll / update — no hooks required."
			hints={[
				{key: '1', label: 'open centered'},
				{key: '2', label: 'open top'},
				{key: '3', label: 'open capturing'},
				{key: 'u', label: 'update first'},
				{key: 'c', label: 'closeAll'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/* ── Instructional copy ──────────────────────────────── */}
			<Box flexDirection="column">
				<Text>
					Press <Text bold>1</Text> to open a centred, dimmed overlay.
				</Text>
				<Text>
					Press <Text bold>2</Text> to open a top-anchored overlay.
				</Text>
				<Text>
					Press <Text bold>3</Text> to open a capturing overlay (input trapped —
					dismiss with Enter or c).
				</Text>
				<Text>
					Press <Text bold>u</Text> to update the first overlay (patch + content
					swap).
				</Text>
				<Text>
					Press <Text bold>c</Text> to close all imperative overlays.
				</Text>

				{/* Live status row — reflects the local mirror state. */}
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>{`Open overlays: ${allIds.length}`}</Text>
					<Text dimColor>{`Update count: ${updateCount}`}</Text>
				</Box>

				{/* Teaching-point callout about the capturing variant. */}
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						Once variant 3 (capture: true) is open, the scene's keys are gated
						off — you cannot dismiss it with `c`.
					</Text>
					<Text dimColor>
						Press Enter (or `c`) INSIDE the capturing overlay to dismiss it via
						the in-content useRegisterInput handler.
					</Text>
				</Box>
			</Box>
		</SceneShell>
	);
}
