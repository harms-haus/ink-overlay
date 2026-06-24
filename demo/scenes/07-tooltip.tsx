/**
 * Scene 07 — Tooltip.
 *
 * Demonstrates the `<Tooltip>` component in all three of its common
 * configurations: a default key-trigger tooltip, a custom-key tooltip
 * with a non-standard dismiss delay, and a focus-driven tooltip.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Tooltip: Transient Anchored Hints
 * ──────────────────────────────────────────────────────────────────────
 *
 * A `<Tooltip>` is a thin wrapper around `<Popover>` that adds transient
 * show/hide semantics. Unlike a `<Modal>` or a controlled `<Popover>`, a
 * tooltip manages its OWN visibility state internally — you never toggle
 * `open` yourself. Instead you choose a **trigger mode** and the tooltip
 * handles the rest:
 *
 *   trigger='key'    (default)
 *     Toggles visibility whenever `triggerKey` is pressed. An auto-dismiss
 *     timer starts on show and resets on each subsequent toggle. This is
 *     the classic "?"-for-help pattern.
 *
 *   trigger='focus'
 *     Visibility is driven entirely by the `anchorFocused` boolean prop.
 *     Typically you wire this to `useFocus().isFocused` inside the anchor
 *     element's own component, so the tooltip appears whenever its anchor
 *     is focus-active and disappears when it loses focus. No key handling
 *     is involved.
 *
 * SELF-GATING (built into the library):
 *   The Tooltip automatically gates its triggerKey input handler behind
 *   `useInputCaptureState`, so pressing the trigger key will NOT toggle
 *   background tooltips while a capturing modal/layer is open. This is
 *   built into the library — you do not wire it yourself. That is why this
 *   scene needs NO scene-level `useInput` and NO `useInputCaptureState`
 *   import: every input gate the tooltip needs is internal.
 *
 * MOUNT/UNMOUNT MODEL:
 *   The Tooltip renders a `<Popover>` internally and returns `null` when
 *   hidden — it mounts/unmounts the Popover rather than toggling its
 *   `open` prop. This keeps the registration lifecycle clean: when the
 *   tooltip is hidden it is simply absent from the host's layer list.
 *
 * @module demo/scenes/07-tooltip
 */

import {useRef} from 'react';
import {Box, Text, useFocus, type DOMElement} from 'ink';
import {Tooltip} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── Local helper: FocusAnchor ──────────────────────────────────────

/**
 * Tiny local component that calls `useFocus()` so Ink considers it a
 * focusable element. It owns both its anchor ref and the tooltip that
 * depends on its focus state, so `isFocused` reflects THIS element's
 * focus — not the whole scene's.
 *
 * Extracting the focus anchor into its own component (rather than calling
 * `useFocus()` at the scene level) ensures that Tab actually focuses this
 * specific `<Box>` and the tooltip's `anchorFocused` tracks it correctly.
 * This mirrors the `FocusableBox` pattern used in Scene 12.
 */
function FocusAnchor() {
	const anchorRef = useRef<DOMElement | null>(null);
	const {isFocused} = useFocus();
	return (
		<>
			<Box ref={anchorRef} borderStyle="round" paddingX={1}>
				<Text>Tab-focus me to show my tooltip</Text>
			</Box>
			<Tooltip
				anchorRef={anchorRef}
				content="I follow focus state (trigger=focus, anchorFocused=isFocused)"
				placement="bottom"
				trigger="focus"
				anchorFocused={isFocused}
				z={10}
			/>
		</>
	);
}

/**
 * Scene 07 — Tooltip trigger modes, custom key, and dismiss delay.
 */
export function Scene07Tooltip() {
	// ── Anchor refs ─────────────────────────────────────────────────
	//
	// Each key-trigger tooltip needs a ref to the DOMElement it
	// positions itself against. These are plain
	// `useRef<DOMElement | null>(null)` hooks attached to the <Box>
	// anchors rendered below.
	//
	// The focus-driven tooltip (sub-demo 3) lives inside its own
	// <FocusAnchor> component which calls `useFocus()` internally —
	// see that component for the per-element focus wiring.
	const keyRef = useRef<DOMElement | null>(null);
	const customKeyRef = useRef<DOMElement | null>(null);

	return (
		<SceneShell
			title="Scene 07 — Tooltip"
			description="Key-trigger, custom-key, and focus-driven tooltips"
			hints={[
				{key: '?', label: 'toggle top tooltip'},
				{key: 'h', label: 'toggle right tooltip'},
				{key: 'Tab', label: 'focus the bottom box'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/*
				The three anchors are laid out in a column. Each anchor
				<Box> is immediately followed by its <Tooltip>. The
				Tooltips return null when hidden, so they contribute
				nothing to the flow layout until toggled/focused.
			*/}
			<Box flexDirection="column" gap={1}>
				{/* ════════════════════════════════════════════════════════
				    (1) Default key-trigger tooltip.

				    trigger='key' (the default) — toggles visibility when
				    triggerKey is pressed. An auto-dismiss timer fires
				    after dismissDelay (default 3000 ms); the timer resets
				    on each toggle.

				    triggerKey — the key that toggles the tooltip in
				    'key' mode. Default '?'. Only relevant when
				    trigger='key' (ignored in 'focus' mode). The variant
				    below uses 'h' to demonstrate a non-default key.

				    placement — preferred placement relative to the
				    anchor. Default 'top'. Forwarded straight through to
				    the internal <Popover>. Likewise offset, crossOffset,
				    flip, and shift all pass through to <Popover>
				    unchanged.

				    ══════════════════════════════════════════════════ */}
				<Box ref={keyRef} borderStyle="round" paddingX={1}>
					<Text>Press ? for a tooltip</Text>
				</Box>
				<Tooltip
					anchorRef={keyRef}
					content="I toggle when you press ? and auto-dismiss after 3s (the default dismissDelay)"
					placement="top"
					trigger="key"
					triggerKey="?"
					z={10}
				/>

				{/* ════════════════════════════════════════════════════════
				    (2) Custom-key tooltip with a non-default dismissDelay.

				    triggerKey='h' — a custom trigger key. Shown here to
				    prove triggerKey is not hard-coded to '?'.

				    dismissDelay — auto-dismiss timeout in milliseconds
				    (key mode only). Default 3000. The tooltip
				    auto-dismisses after this delay and the timer resets
				    on each toggle. Here we use 10,000 ms so the tooltip
				    lingers much longer than the default.

				    placement='right' with offset={2} — demonstrates that
				    placement and offset forward through to <Popover>.

				    ══════════════════════════════════════════════════ */}
				<Box ref={customKeyRef} borderStyle="round" paddingX={1}>
					<Text>Press h for a custom-key tooltip (10s delay)</Text>
				</Box>
				<Tooltip
					anchorRef={customKeyRef}
					content="Bound to 'h' with a 10,000ms dismissDelay"
					placement="right"
					trigger="key"
					triggerKey="h"
					dismissDelay={10_000}
					offset={2}
					z={10}
				/>

				{/* ════════════════════════════════════════════════════════
				    (3) Focus-driven tooltip.

				    trigger='focus' — visibility is driven entirely by the
				    anchorFocused boolean prop rather than by a trigger
				    key. No useInput handler is involved on the tooltip
				    side; you simply tell it whether its anchor is
				    focused.

				    anchorFocused — the focus-mode boolean driver.
				    Typically wired to `useFocus().isFocused` of the
				    anchor element itself. The <FocusAnchor> component
				    above calls `useFocus()` internally so `isFocused`
				    tracks THIS specific anchor, not the whole scene.
				    When true the tooltip shows; when false it hides.

				    placement='bottom' — again forwarded to <Popover>.

				    ══════════════════════════════════════════════════ */}
				<FocusAnchor />
			</Box>
		</SceneShell>
	);
}

export default Scene07Tooltip;
