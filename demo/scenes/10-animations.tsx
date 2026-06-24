/**
 * Scene 10 — Animations (Stepped Style Transitions).
 *
 * Demonstrates every named transition preset, a custom `TransitionConfig`
 * built by cloning a preset, the `fade` = height-grow caveat, and the
 * exit-animation behavior.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Stepped Style Transitions
 * ══════════════════════════════════════════════════════════════════════
 *
 * Terminal UIs have no real alpha/transparency — there is no RGBA blending
 * at the cell level in a standard ANSI terminal. That means a genuine
 * "fade in / fade out" opacity ramp is physically impossible. Instead,
 * `ink-overlay` implements transitions as a SEQUENCE OF STYLE STEPS: each
 * frame swaps in a partial Box-style override (margins, height, etc.) so
 * the layer APPEARS to slide or collapse rather than dissolve.
 *
 * A `TransitionConfig` is `{enter?: TransitionStep[]; exit?: TransitionStep[];
 * duration?: number}` where `TransitionStep = {style: Record<string, number |
 * string>}`. The `enter` array is the list of frames played on mount/open;
 * `exit` is played on close/unmount. `duration` is the PER-FRAME delay in
 * milliseconds (NOT the total animation length).
 *
 * `getTransitionSteps(name)` returns one of six cached presets. The presets
 * are cached per name because their configs are deterministic — the same
 * name always yields the same frame sequence, so there is no need to
 * rebuild the object on every call. You can clone a preset and override
 * `duration` (or any other field) to tweak the speed — that is exactly what
 * the `c` key in this scene does (slide-up at 200ms/frame instead of 80).
 *
 * ── The six TransitionName presets ─────────────────────────────────────
 *
 * 'none'      → single no-op frame on enter and exit. Effectively no
 *               animation at all. The layer mounts/unmounts instantly.
 *
 * 'fade'      → a HEIGHT GROW (0 → 1 rows), NOT opacity. Terminals have NO
 *               alpha/transparency channel, so a true dissolve is
 *               impossible. The name 'fade' is kept for API familiarity
 *               (it matches the vocabulary of web/CSS overlay libraries)
 *               but the visual effect is a collapse/expand: the layer
 *               starts at height 0 and snaps to height 1. Because the jump
 *               is from 0 to 1 in a single step, the effect is subtle —
 *               prefer the 'slide-*' presets for a clearly visible
 *               entrance.
 *
 * 'slide-up'   → marginTop steps 4 → 2 → 0. The layer slides up from
 *                below into its resting position.
 *
 * 'slide-down' → marginBottom steps 4 → 2 → 0. The layer slides down from
 *                above into its resting position.
 *
 * 'slide-left' → marginLeft steps 4 → 2 → 0. The layer slides in from the
 *                right toward the left.
 *
 * 'slide-right'→ marginRight steps 4 → 2 → 0. The layer slides in from the
 *                left toward the right.
 *
 * ── duration ───────────────────────────────────────────────────────────
 *
 * `duration` is the PER-FRAME delay in milliseconds, NOT the total
 * animation length. The slide presets each have 3 frames, so at the default
 * `duration` of 80ms the full enter animation is 3 × 80ms = 240ms total.
 * The custom config in this scene overrides `duration` to 200ms — slowing
 * it to 3 × 200ms = 600ms total — so you can clearly see each frame step.
 *
 * ── Exit animations ────────────────────────────────────────────────────
 *
 * An exit transition needs AT LEAST 2 exit frames to be visible. If the
 * `exit` array has ≤1 frame, the layer unmounts immediately with NO exit
 * animation at all — it simply disappears. The slide presets all have
 * 3 exit frames (the mirror of their enter frames), so toggling the layer
 * closed produces a visible slide-out. Press `o` to toggle open/closed and
 * watch the enter AND exit sequences play.
 *
 * ── Implementation note: setInterval, not ink's useAnimation ───────────
 *
 * Transitions are driven by a plain `setInterval` inside `useEnterExit`,
 * deliberately chosen over ink's built-in `useAnimation` hook. `useAnimation`
 * depends on the AnimationContext provider (only present inside ink's `<App>`)
 * and its shared timer/render-throttle semantics make deterministic
 * frame-counting hard to drive in tests. A self-contained interval is
 * trivially testable with real timers and `await delay()`.
 *
 * @module demo/scenes/10-animations
 */

import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	Layer,
	getTransitionSteps,
	useInputCaptureState,
	type TransitionName,
	type TransitionConfig,
} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── The six named transition presets ───────────────────────────────────
//
// These map 1:1 to the `TransitionName` union type. `getTransitionSteps`
// returns the cached `TransitionConfig` for each. We cycle through them
// with the `a` key.
const transitions: TransitionName[] = [
	'none',
	'fade',
	'slide-up',
	'slide-down',
	'slide-left',
	'slide-right',
];

// ── Custom TransitionConfig (cloned from a preset) ─────────────────────
//
// `getTransitionSteps('slide-up')` returns the cached slide-up preset. We
// clone it (spread) and override `duration` from 80 to 200 ms PER FRAME so
// the animation plays visibly slower in the demo. You could equally author
// a completely custom `{enter, exit, duration}` object by hand — the
// preset is just a convenience.
//
// `TransitionConfig` shape:
//   {enter?: TransitionStep[]; exit?: TransitionStep[]; duration?: number}
// where `TransitionStep = {style: Record<string, number | string>}`.
const customConfig: TransitionConfig = {
	...getTransitionSteps('slide-up'),
	duration: 200,
};

/**
 * Scene 10 — Stepped style transitions.
 *
 * Demonstrates all six named `TransitionName` presets, a custom
 * `TransitionConfig` (cloned from a preset with a slower `duration`), and
 * the enter/exit animation lifecycle.
 */
export default function Scene10Animations() {
	// ── Cooperative input gating ────────────────────────────────────
	//
	// `useInputCaptureState()` returns true when an overlay with `capture`
	// is active. We gate this scene's own key handling on `!isCaptured` so
	// that a capturing overlay gets first crack at keypresses.
	const isCaptured = useInputCaptureState();

	// ── State ───────────────────────────────────────────────────────

	/** Index into `transitions` — cycles via the `a` key. Starts at 1 ('fade'). */
	const [transitionIndex, setTransitionIndex] = useState(1);

	/** Controlled layer open state — toggled by the `o` key (to see enter/exit). */
	const [open, setOpen] = useState(true);

	/** Toggle the custom (slow) config — toggled by the `c` key. */
	const [useCustom, setUseCustom] = useState(false);

	// ── Input (cooperative: disabled while a capturing overlay is up) ─
	//
	//   a — cycle transitionIndex with wrap-around.
	//   o — toggle open (to see the enter/exit animation).
	//   c — toggle useCustom (slide-up preset at 200ms/frame).
	useInput(
		(input: string) => {
			// `a` → cycle transitionIndex with wrap-around.
			if (input === 'a') {
				setTransitionIndex(
					previous => (previous + 1) % transitions.length,
				);
				return;
			}

			// `o` → toggle open.
			if (input === 'o') {
				setOpen(value => !value);
				return;
			}

			// `c` → toggle useCustom.
			if (input === 'c') {
				setUseCustom(value => !value);
			}
		},
		{isActive: !isCaptured},
	);

	// ── Derived values ─────────────────────────────────────────────

	const transitionName = transitions[transitionIndex];

	/*
	 * The `transition` prop on `<Layer>` accepts a `TransitionName`
	 * (string) OR a full `TransitionConfig` object OR `undefined`.
	 * Here we pass either the custom config (slide-up slowed to
	 * 200ms/frame) or the preset for the currently selected name.
	 * A string name is resolved internally via `getTransitionSteps`.
	 */
	const transition = useCustom ? customConfig : transitionName;

	/*
	 * Label for the layer's content box. Reflects whether the custom
	 * config is active or which preset name is selected.
	 */
	const label = useCustom
		? 'custom (slide-up, 200ms/frame)'
		: transitionName;

	// ── Render ─────────────────────────────────────────────────────

	return (
		<SceneShell
			title='Scene 10 — Animations'
			description='Stepped style transitions: presets, custom config & exit.'
			hints={[
				{key: 'a', label: 'cycle transition'},
				{key: 'o', label: 'open/close'},
				{key: 'c', label: 'custom config'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			<Box flexDirection='column' gap={1}>
				<Text dimColor>
					current: {label} {' '}
					{!useCustom && transitionName !== undefined
						? '(preset)'
						: ''}
				</Text>
				{/*
				 * ════════════════════════════════════════════════════════
				 * Layer with a transition
				 * ════════════════════════════════════════════════════════
				 *
				 * `transition` accepts a `TransitionName` string, a full
				 * `TransitionConfig` object, or `undefined`.
				 *
				 * - A string is resolved internally via
				 *   `getTransitionSteps(name)`, which returns the CACHED
				 *   preset `TransitionConfig` for that name. Because the
				 *   presets are cached/deterministic, you can call it as
				 *   often as you like with no allocation cost. Clone it
				 *   and override `duration` to tweak the speed — that is
				 *   what the `customConfig` above does (slide-up at
				 *   200ms/frame instead of the default 80).
				 *
				 * - A `TransitionConfig` object is used as-is. Its shape is
				 *   {enter?: TransitionStep[]; exit?: TransitionStep[];
				 *    duration?: number} where
				 *   TransitionStep = {style: Record<string, number | string>}.
				 *   You can fully author your own frame sequences this way.
				 *
				 * `open` / `onOpenChange` control the layer's visibility.
				 * Toggling `open` from true → false starts the EXIT
				 * animation (if the `exit` array has ≥2 frames), then
				 * unmounts. Toggling false → true re-runs the ENTER
				 * sequence. Press `o` to compare.
				 *
				 * EXIT ANIMATION REQUIREMENT: an exit transition needs
				 * ≥2 frames to be visible. If `exit` has ≤1 frame the
				 * layer unmounts immediately with no exit animation. All
				 * slide presets have 3 exit frames and 'fade' has 2 exit
				 * frames, so all of them play a visible exit animation;
				 * only 'none' is effectively instant on exit given its
				 * single exit frame.
				 *
				 * WHY setInterval (not ink's useAnimation): transitions are
				 * driven by a self-contained setInterval inside
				 * useEnterExit for deterministic, testable timing.
				 */}
				{transitionName !== undefined && (
					<Layer
						anchor='center'
						z={10}
						transition={transition}
						open={open}
						onOpenChange={setOpen}
					>
						<Box borderStyle='round' padding={1}>
							<Text>{label}</Text>
						</Box>
					</Layer>
				)}
			</Box>
		</SceneShell>
	);
}
