/**
 * Scene 05 — Modal Deep Dive.
 *
 * Exercises the opinionated `<Modal>` component (all overridable props
 * except `defaultOpen`; `backdrop` and `z` use their defaults), the
 * `role='alertdialog'` variant (which blocks all dismissal), and two bare
 * `<Layer>` variants that cover the otherwise-unexercised `role='toast'`
 * and `role='tooltip'` values.
 *
 * ════════════════════════════════════════════════════════════════════
 * Modal: Opinionated Centered Dialog
 * ════════════════════════════════════════════════════════════════════
 *
 * `<Modal>` is a thin convenience wrapper around `<Layer>` with a set of
 * FIXED baked-in settings plus a handful of overridable presentation props.
 *
 * FIXED <Layer> settings (NOT overridable on <Modal>):
 *
 *   - anchor='center'  → the modal is always perfectly centered.
 *   - capture=true     → the modal traps input (FocusTrap) while open.
 *   - overflow='hidden'→ content is clipped to the bordered box.
 *
 * If you need different positioning, a non-capturing layer, or visible
 * overflow, drop down to a bare `<Layer>` and style the children yourself.
 *
 * OVERRIDABLE props (demonstrated below; `backdrop`, `z`, and `defaultOpen`
 * are not explicitly set, so they use their documented defaults):
 *
 *   ──────────────── prop ──────────────── default ───────────────────
 *   open                  undefined (→ uncontrolled via defaultOpen)
 *   defaultOpen           true
 *   onOpenChange          undefined
 *   onDismiss             undefined
 *   title                 undefined (no header row)
 *   footer                undefined (no footer row)
 *   children              undefined (empty body)
 *   width                 50
 *   borderStyle           'round'
 *   borderColor           'cyan'
 *   backdrop              'dim'
 *   z                     100
 *   role                  'dialog'
 *
 * borderStyle OPTIONS: 'single', 'double', 'round', 'bold', 'classic',
 *                       'arrow', 'singleDouble', 'doubleSingle'.
 *
 * ── onDismiss vs onOpenChange ──────────────────────────────────────
 *
 * The library calls `onDismiss` (Escape / backdrop) and THEN calls
 * `onOpenChange(false)` itself. Therefore `onDismiss` is for SIDE-EFFECTS
 * ONLY — logging, analytics, aborting a fetch. Do NOT call
 * `setOpen(false)` inside it; the library already does that.
 *
 * ── role='alertdialog' ─────────────────────────────────────────────
 *
 * When `role='alertdialog'` is set, the framework BLOCKS both Escape and
 * backdrop dismissal. This is the correct behaviour for destructive
 * confirmations: the user must explicitly confirm or cancel via a button
 * (rendered in the modal body or footer) that calls `onOpenChange(false)`.
 *
 * Because the modal captures input while open, this scene's `3` key will
 * NOT fire again while the alert dialog is visible — that is the whole
 * point. The user can still exit the entire demo via Ctrl+C
 * (`exitOnCtrlC` on the app root). This "trapped until explicitly
 * confirmed" behaviour is exactly what `role='alertdialog'` guarantees.
 *
 * ════════════════════════════════════════════════════════════════════
 * The full Role union
 * ════════════════════════════════════════════════════════════════════
 *
 *   - 'dialog'      → click-away dismiss (backdrop input calls onDismiss).
 *   - 'alertdialog' → blocks ALL dismiss (Escape + backdrop). Use for
 *                     destructive confirmations.
 *   - 'menu'        → used internally by `<CommandPalette>`.
 *   - 'toast'       → passive notification; never auto-dismisses on input.
 *   - 'tooltip'     → passive hint; never auto-dismisses on input.
 *
 * `<Toast>` and `<Tooltip>` wrap the `'toast'` and `'tooltip'` roles with
 * extra behaviour (auto-timeout, anchor measurement). This scene shows the
 * BARE `<Layer role='toast'>` / `<Layer role='tooltip'>` forms to exercise
 * those two Role values at the lowest level.
 *
 * @module demo/scenes/05-modal-deepdive
 */

import {useState} from 'react';
import {Box, Text} from 'ink';
import {Modal, Layer, useRegisterInput} from '../../src/index.js';
import {SceneShell} from '../ui.js';
import {useGatedInput} from '../hooks.js';

// ── AlertDialogDismiss ───────────────────────────────────────────────

/**
 * In-modal dismiss path for the `role='alertdialog'` Modal.
 *
 * `role='alertdialog'` BLOCKS both Escape and backdrop dismissal, so the
 * consumer MUST provide a close path. This component registers a LIFO
 * input handler via `useRegisterInput` — which participates in the
 * dispatcher stack and therefore fires EVEN WHILE the modal is capturing
 * input (unlike the scene's gated `useInput`). In a real app you would
 * render confirm/cancel buttons and wire them to `onClose`; here we use a
 * keyboard handler to demonstrate that `useRegisterInput` still fires
 * inside a capturing layer.
 */
function AlertDialogDismiss({onClose}: {onClose: () => void}) {
	useRegisterInput('alert-dialog-dismiss', (input, key) => {
		if (key.return || input === 'c' || key.backspace) {
			onClose();
			return true;
		}

		return false;
	});

	return null;
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 05 — deep dive into `<Modal>` and the two bare-`<Layer>` Role
 * variants not covered by any other scene.
 *
 * Keys (cooperatively gated while a capturing overlay is open):
 *
 *   - `1` → toggle the standard `<Modal>` (defaults, role='dialog').
 *   - `2` → toggle the custom-styled `<Modal>` (width, border, footer).
 *   - `3` → toggle the `role='alertdialog'` modal (dismissal blocked).
 *   - `4` → toggle a bare `<Layer role='toast'>`.
 *   - `5` → toggle a bare `<Layer role='tooltip'>`.
 */
export default function Scene05ModalDeepdive() {
	// ── Declarative visibility state ────────────────────────────────
	//
	// Each overlay is controlled by its own boolean. The keys below
	// toggle them on/off. When `open` is false the overlay is not in
	// the host's layer list at all.

	/** Standard default-styled modal (role='dialog'). */
	const [showStandard, setShowStandard] = useState(false);

	/** Custom-styled modal (width, borderStyle, borderColor, footer). */
	const [showCustom, setShowCustom] = useState(false);

	/** Destructive-confirmation modal (role='alertdialog'). */
	const [showAlert, setShowAlert] = useState(false);

	/** Bare `<Layer role='toast'>` — bottom-right passive notification. */
	const [showRoleToast, setShowRoleToast] = useState(false);

	/** Bare `<Layer role='tooltip'>` — top-anchored passive hint. */
	const [showRoleTooltip, setShowRoleTooltip] = useState(false);

	// ── Scene input handler ─────────────────────────────────────────
	//
	// A single switch (per the `unicorn/prefer-switch` rule) dispatches
	// the five toggle keys. Each arm flips one boolean state.
	useGatedInput(input => {
		switch (input) {
			case '1': {
				setShowStandard(previous => !previous);
				break;
			}

			case '2': {
				setShowCustom(previous => !previous);
				break;
			}

			case '3': {
				setShowAlert(previous => !previous);
				break;
			}

			case '4': {
				setShowRoleToast(previous => !previous);
				break;
			}

			case '5': {
				setShowRoleTooltip(previous => !previous);
				break;
			}

			default: {
				break;
			}
		}
	});

	// ── Render ──────────────────────────────────────────────────────

	return (
		<SceneShell
			title="Scene 05 — Modal Deep Dive"
			description="Modal props (except defaultOpen), role=alertdialog, and bare toast/tooltip Layers."
			hints={[
				{key: '1', label: 'standard modal'},
				{key: '2', label: 'custom modal'},
				{key: '3', label: 'alertdialog'},
				{key: '4', label: 'role=toast'},
				{key: '5', label: 'role=tooltip'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/* ── Instructional copy ──────────────────────────────── */}
			<Box flexDirection="column">
				<Text>
					Press <Text bold>1</Text>–<Text bold>5</Text> to toggle each overlay
					variant.
				</Text>
				<Text dimColor>
					The alertdialog blocks Esc and click-away — Ctrl+C exits the whole
					demo.
				</Text>
			</Box>

			{/*
			 * ════════════════════════════════════════════════════════
			 * (1) STANDARD MODAL — all defaults except open/onOpenChange.
			 *
			 * This uses every <Modal> default: anchor='center',
			 * capture=true, overflow='hidden', backdrop='dim', width=50,
			 * borderStyle='round', borderColor='cyan', z=100,
			 * role='dialog'.
			 *
			 * ── Prop walkthrough ───────────────────────────────────
			 *
			 *   open          → controlled visibility (React state).
			 *   onOpenChange  → library calls this with false on Esc /
			 *                   backdrop dismiss; wired to the setter.
			 *   onDismiss     → fires BEFORE onOpenChange(false).
			 *                   SIDE-EFFECTS ONLY — the library already
			 *                   closes the modal, so do NOT call
			 *                   setOpen(false) here.
			 *   title         → bold header inside the top border.
			 *   children      → modal body.
			 * ════════════════════════════════════════════════════════
			 */}
			<Modal
				/* Open — controlled. Default: undefined (uncontrolled). */
				open={showStandard}
				/* OnOpenChange — default undefined. Wired to the setter. */
				onOpenChange={setShowStandard}
				/*
				 * OnDismiss — default undefined. SIDE-EFFECTS ONLY.
				 * The library calls onOpenChange(false) right after this,
				 * so do NOT call setShowStandard(false) in here — that
				 * would be a redundant second state update.
				 */
				onDismiss={() => {
					/* Side-effects only */
				}}
				/* Title — default undefined (no header row). */
				title="Standard Modal"
			>
				<Text>Basic dialog. Esc or click-away dismisses.</Text>
			</Modal>

			{/*
			 * ════════════════════════════════════════════════════════
			 * (2) CUSTOM-STYLED MODAL — exercises width, borderStyle,
			 * borderColor, and footer.
			 *
			 * ── Overridden props ───────────────────────────────────
			 *
			 *   title         → 'Custom Styled'
			 *   footer        → dim text inside the bottom border.
			 *   width         → 40 (default 50).
			 *   borderStyle   → 'single' (default 'round').
			 *   borderColor   → 'magenta' (default 'cyan').
			 *
			 * borderStyle OPTIONS: 'single', 'double', 'round', 'bold',
			 * 'classic', 'arrow', 'singleDouble'.
			 * ════════════════════════════════════════════════════════
			 */}
			<Modal
				open={showCustom}
				onOpenChange={setShowCustom}
				/* Title — default undefined. */
				title="Custom Styled"
				/* Footer — default undefined (no footer row). */
				footer="Press Esc to close"
				/* Width — default 50. */
				width={40}
				/* BorderStyle — default 'round'. */
				borderStyle="single"
				/* BorderColor — default 'cyan'. */
				borderColor="magenta"
			>
				<Text>Custom width, border, and footer.</Text>
			</Modal>

			{/*
			 * ════════════════════════════════════════════════════════
			 * (3) ALERT DIALOG — role='alertdialog'.
			 *
			 * role='alertdialog' BLOCKS both Escape and backdrop
			 * dismissal. The user CANNOT close this modal with Esc or
			 * click-away — they must press an explicit confirm button.
			 * In this demo the footer explains the situation; a real app
			 * would render a confirm button that calls
			 * `onOpenChange(false)`.
			 *
			 * Because the modal captures input while open, this scene's
			 * `3` key will NOT fire again while the alert dialog is
			 * visible — the scene's useInput is gated on !isCaptured.
			 * The user can still exit the entire demo via Ctrl+C
			 * (exitOnCtrlC on the app root). This "trapped until
			 * explicitly confirmed" behaviour is exactly the point of
			 * role='alertdialog' — it guarantees a user cannot
			 * accidentally dismiss a destructive confirmation.
			 *
			 * ── Prop walkthrough ───────────────────────────────────
			 *
			 *   role          → 'alertdialog' (default 'dialog').
			 * ════════════════════════════════════════════════════════
			 */}
			<Modal
				open={showAlert}
				onOpenChange={setShowAlert}
				/*
				 * Role='alertdialog' — default 'dialog'. Blocks Escape
				 * AND backdrop dismissal. Use for destructive
				 * confirmations.
				 */
				role="alertdialog"
				title="Confirm Action"
				footer="Esc is blocked — press Enter (or c) to acknowledge and close"
			>
				<Text>
					Destructive confirmation. Escape and click-away are both blocked.
				</Text>
				<Text dimColor>
					Press Enter (or c) to acknowledge and close — this is the in-modal
					useRegisterInput dismiss path.
				</Text>
				{/*
				 * A real app would render confirm/cancel buttons here. We
				 * register an in-content LIFO handler to demonstrate that the
				 * consumer MUST provide the close path and that
				 * useRegisterInput still fires inside a capturing layer.
				 */}
				<AlertDialogDismiss
					onClose={() => {
						setShowAlert(false);
					}}
				/>
			</Modal>

			{/*
			 * ════════════════════════════════════════════════════════
			 * (4) BARE <Layer role='toast'>.
			 *
			 * The `'toast'` role is normally wrapped by the `<Toast>`
			 * component (which adds auto-timeout and anchoring). Here we
			 * use a bare `<Layer>` to exercise the raw `'toast'` Role
			 * value at the lowest level. A toast layer never
			 * auto-dismisses on input — it is a passive notification.
			 *
			 * z={10} sits below the default modal z (100) but above the
			 * scene chrome.
			 * ════════════════════════════════════════════════════════
			 */}
			{showRoleToast && (
				<Layer role="toast" anchor="bottom-right" z={10} open>
					<Box borderStyle="round" paddingX={1}>
						<Text dimColor>A bare Layer with role='toast'</Text>
					</Box>
				</Layer>
			)}

			{/*
			 * ════════════════════════════════════════════════════════
			 * (5) BARE <Layer role='tooltip'>.
			 *
			 * The `'tooltip'` role is normally wrapped by the
			 * `<Tooltip>` component (which anchors to a trigger and
			 * handles show/hide). Here we use a bare `<Layer>` to
			 * exercise the raw `'tooltip'` Role value. A tooltip layer
			 * never auto-dismisses on input — it is a passive hint.
			 * ════════════════════════════════════════════════════════
			 */}
			{showRoleTooltip && (
				<Layer role="tooltip" anchor="top" z={10} open>
					<Box borderStyle="round" paddingX={1}>
						<Text dimColor>A bare Layer with role='tooltip'</Text>
					</Box>
				</Layer>
			)}
		</SceneShell>
	);
}
