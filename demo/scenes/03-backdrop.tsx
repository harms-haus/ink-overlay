/**
 * Scene 03 — Backdrop.
 *
 * Demonstrates the three `backdrop` kinds (`'none'`, `'dim'`, `'opaque'`),
 * a custom `backdropColor`, and `Layer.onBackdropInput` — a first-class
 * prop not exercised in any other demo scene.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Backdrop: Overpaint, Not Transparency
 * ──────────────────────────────────────────────────────────────────────
 *
 * Terminal renderers have NO concept of alpha/transparency. A "backdrop"
 * in ink-overlay is therefore NOT a semi-transparent dimming layer draped
 * over the content behind it. Instead it is a SOLID COLOR BLOCK painted
 * beneath the floating content (an "overpaint"). The kind names — `'dim'`
 * and `'opaque'` — are semantic labels, not literal descriptions of
 * blending behaviour:
 *
 * OPTIONS (the `backdrop` prop):
 *
 *   - 'none'    → No backdrop <Box> is rendered at all. The content behind
 *                 the layer shows through unchanged. This is the default.
 *
 *   - 'dim'     → A SOLID block of #1a1a2e is painted beneath the content.
 *                 This is NOT real transparency — it is a flat dark fill
 *                 that visually "dims" the region by occluding whatever
 *                 was previously painted there.
 *
 *   - 'opaque'  → A SOLID block of black is painted beneath the content.
 *                 Again, not true opacity — just a fully black overpaint.
 *
 * WHY: because terminals cannot blend pixels, every "backdrop" must be an
 * opaque fill. The names communicate intent ('dim' = dark navy, 'opaque' =
 * pure black) so consumers can pick the visual effect they want without
 * thinking about the overpaint implementation detail.
 *
 * ── backdropColor ─────────────────────────────────────────────────────
 *
 * `backdropColor` overrides the default fill color for ANY non-'none'
 * kind. It is ignored entirely when `backdrop === 'none'` (no box exists
 * to color). Defaults: dim → #1a1a2e, opaque → black. Pressing `c` in this
 * scene swaps in '#2d1b4e' to show the override.
 *
 * ── onBackdropInput ───────────────────────────────────────────────────
 *
 * `onBackdropInput` is a prop DISTINCT from `onDismiss`. It fires on EVERY
 * non-Escape, non-Tab keypress that reaches the backdrop region —
 * regardless of the layer's `role`. It is useful for custom "click-away"
 * semantics: e.g. advance a step, log the key, or trigger domain logic.
 *
 * When `onBackdropInput` is omitted on a `role='dialog'` layer, the
 * framework falls back to calling `onDismiss` for backdrop input — that is
 * the built-in click-away dismiss. This scene passes an explicit
 * `onBackdropInput` so we can observe it firing independently.
 *
 * IMPORTANT — `capture` is REQUIRED: ALL `LayerRenderer` input handling
 * (Escape dismissal, Tab pass-through, AND `onBackdropInput`) only fires
 * when the layer has `capture: true`. The handler is registered on the
 * LIFO stack via `useRegisterInput(id, handler, descriptor.capture)`, so
 * when `capture` is `false` the handler is never pushed and NONE of these
 * callbacks can fire. This scene therefore sets `capture` on the `<Layer>`
 * so that `onBackdropInput` actually works.
 *
 * NOTE: Backdrops only render when the layer is visible AND
 * `backdrop !== 'none'`. An invisible or 'none' layer paints nothing.
 *
 * @module demo/scenes/03-backdrop
 */

import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {Layer, useInputCaptureState, type BackdropKind} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// The three backdrop kinds, cycled by the `b` key.
const kinds: BackdropKind[] = ['none', 'dim', 'opaque'];

/**
 * Scene 03 — Backdrop kinds, custom color, and onBackdropInput.
 */
export function Scene03Backdrop() {
	// ── State ────────────────────────────────────────────────────────

	/** Index into `kinds` — cycles 0 → 1 → 2 → 0 via the `b` key. */
	const [kindIndex, setKindIndex] = useState(0);

	/** When true, override the backdrop fill with '#2d1b4e'. */
	const [customColor, setCustomColor] = useState(false);

	/**
	 * Last key observed by `onBackdropInput`. Starts as an em dash to show
	 * "nothing pressed yet". Updated whenever a backdrop keypress arrives.
	 */
	const [lastBackdropKey, setLastBackdropKey] = useState('—');

	// ── Input gating ─────────────────────────────────────────────────
	//
	// `useInputCaptureState()` returns true when an overlay with `capture`
	// is active. We gate this scene's own key handling so that a captured
	// layer's input is never stolen by the background scene.
	const isCaptured = useInputCaptureState();

	useInput(
		(input, key) => {
			if (key.escape) {
				return;
			}

			// `b` → cycle backdrop kind with wrap-around.
			if (input === 'b') {
				setKindIndex(previous => (previous + 1) % kinds.length);
				return;
			}

			// `c` → toggle the custom backdropColor override.
			if (input === 'c') {
				setCustomColor(value => !value);
			}
		},
		{isActive: !isCaptured},
	);

	// ── Resolve current backdrop kind ────────────────────────────────

	const kind = kinds[kindIndex];

	// ── Render ───────────────────────────────────────────────────────
	//
	// The Layer is `open` (controlled) and visible. We set `capture` so the
	// LayerRenderer input handler is pushed onto the LIFO stack and
	// `onBackdropInput` actually fires. We pass `role='dialog'` so the
	// framework keeps backdrop input handling active; combined with an
	// explicit `onBackdropInput` we observe backdrop keypresses directly.
	// Because `capture` is on, the scene-level `useInput` is gated off
	// (via `!isCaptured`), so the cycling logic is duplicated inside
	// `onBackdropInput` to keep the scene interactive. (See the file-level
	// doc comment for the full rationale.)

	return (
		<SceneShell
			title='Scene 03 — Backdrop'
			description='Overpaint backdrops: none / dim / opaque + custom color.'
			hints={[
				{key: 'b', label: 'cycle backdrop (via onBackdropInput)'},
				{key: 'c', label: 'toggle color'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/*
				Layer: anchored center, capture + role='dialog' so backdrop
				input is active and onBackdropInput fires. z={10} sits above
				the scene chrome.
			*/}
			<Layer
				anchor='center'
				role='dialog'
				capture
				backdrop={kind}
				backdropColor={customColor ? '#2d1b4e' : undefined}
				z={10}
				open
				onBackdropInput={input => {
					setLastBackdropKey(`"${input}"`);
					if (input === 'b') {
						setKindIndex(previous => (previous + 1) % kinds.length);
					} else if (input === 'c') {
						setCustomColor(value => !value);
					}
				}}
			>
				<Box borderStyle='round' padding={1} flexDirection='column'>
					<Text>Backdrop kind: {kind}</Text>
					<Text>
						customColor: {customColor ? '#2d1b4e' : '(default)'}
					</Text>
					<Text dimColor>backdrop input: {lastBackdropKey}</Text>
				</Box>
			</Layer>
		</SceneShell>
	);
}
