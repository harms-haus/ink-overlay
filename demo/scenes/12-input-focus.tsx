/**
 * Scene 12 — Input & Focus.
 *
 * Demonstrates the cooperative input model, the LIFO dispatcher, focus
 * trapping, nested capturing layers (Esc closes only the topmost), and
 * the `restoreFocus` option.
 *
 * ════════════════════════════════════════════════════════════════════
 * Cooperative Input Model
 * ════════════════════════════════════════════════════════════════════
 *
 * ── WHY (CRITICAL) ──────────────────────────────────────────────────
 *
 * Ink fires EVERY active `useInput` listener on EVERY keypress. There is
 * NO native "consume" / "propagation-stop" / priority mechanism — every
 * hook that subscribed via `useInput` sees the raw input string and key
 * object, unconditionally.
 *
 * The framework's `<InputDispatcher>` (mounted inside `<OverlayHost>`)
 * owns ONE `useInput` and walks a LIFO handler stack (top → bottom). A
 * handler returns `true` to CONSUME the event and stop the walk; it
 * returns `false` (or void) to pass through to the next handler down.
 *
 * ── useInputCaptureState() ──────────────────────────────────────────
 *
 * `useInputCaptureState()` returns `true` when at least one capturing
 * layer or focus trap is active (the capture depth counter is > 0).
 * Background components MUST gate their own `useInput` with
 * `{isActive: !isCaptured}`. This is a VOLUNTARY contract — an
 * uncooperative `useInput` still fires on every keypress regardless.
 *
 * ── useRegisterInput(id, handler, isActive?) ────────────────────────
 *
 * Registers a handler on the LIFO stack. Return `true` from the handler
 * to consume the event (stops the walk). `isActive` defaults to `true`;
 * when `false` the handler is not registered at all. Re-registering the
 * SAME `id` REPLACES the prior handler (the old entry is removed before
 * the new one is pushed).
 *
 * ── useFocusTrap(active, {onEscape?, restoreFocus?}) → {trapId, isTrapped} ─
 *
 * Confines Tab / Shift+Tab cycling to children while `active` is true.
 * `onEscape` fires on Escape. `restoreFocus` (default `true`) returns
 * focus to the element that was focused before the trap activated.
 *
 * ── <FocusTrap active? onEscape? restoreFocus? children> ────────────
 *
 * Convenience wrapper around `useFocusTrap`. `active` defaults to `true`,
 * `restoreFocus` defaults to `true`.
 *
 * ── WHY restoreFocus ────────────────────────────────────────────────
 *
 * `restoreFocus` returns focus to the previously-focused element on
 * deactivation. Useful when a trap is opened over an existing form or
 * list — focus springs back to where the user was.
 *
 * ── WHY nesting (ref-counted traps) ─────────────────────────────────
 *
 * Focus traps are ref-counted: only the FIRST trap to activate
 * (0 → 1) calls `disableFocus()`, and only the LAST to deactivate
 * (1 → 0) calls `enableFocus()`. This lets nested traps coexist
 * correctly — an inner trap's deactivation never prematurely re-enables
 * global Tab navigation while an outer trap is still confining.
 *
 * ── WHY Esc closes only the TOPMOST layer ───────────────────────────
 *
 * Because handlers are walked LIFO (most-recently-registered first) and
 * the first handler to return `true` stops the walk, Esc is consumed by
 * the TOPMOST layer's handler. Lower layers never see the event. This is
 * why pressing Esc in a nested modal stack closes only the innermost
 * modal — each layer's handler consumes the Esc event.
 *
 * @module demo/scenes/12-input-focus
 */

import {useState} from 'react';
import {
	Box,
	Text,
	useFocus,
	useInput,
} from 'ink';
import {
	FocusTrap,
	Modal,
	useInputCaptureState,
	useRegisterInput,
} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── Local helper: FocusableBox ──────────────────────────────────────

/**
 * Tiny local component that calls `useFocus()` so Ink considers it a
 * focusable element. It renders its focused state visibly so you can SEE
 * Tab / Shift+Tab cycling while a `<FocusTrap>` is active.
 *
 * This is a demo convenience only — it exists to make focus movement
 * observable inside the trap.
 */
function FocusableBox({label}: {label: string}) {
	const {isFocused} = useFocus();
	return (
		<Box
			borderStyle={isFocused ? 'double' : 'single'}
			borderColor={isFocused ? 'green' : undefined}
			paddingX={1}
		>
			<Text color={isFocused ? 'green' : undefined}>
				{isFocused ? `▶ ${label} (focused)` : label}
			</Text>
		</Box>
	);
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 12 — the cooperative input model, LIFO dispatch, focus trapping,
 * nested capturing layers, and `restoreFocus`.
 *
 * Keys (cooperatively gated while a capturing layer is open):
 *
 *   - `j` → decrement the counter (cooperative gating demo).
 *   - `k` → increment the counter (cooperative gating demo).
 *   - `m` → toggle the gating Modal (sub-demo 1).
 *   - `t` → toggle the standalone FocusTrap (sub-demo 3).
 *   - `n` → open the nested Modal pair (sub-demo 4).
 *
 * The `x` key is handled by a LIFO-registered handler (sub-demo 2).
 */
export default function Scene12InputFocus() {
	// ── Local state ──────────────────────────────────────────────────
	//
	// `counter` — driven by j/k, demonstrates cooperative gating (while
	// the gating Modal is open, j/k do nothing because input is captured).
	//
	// `lastIntercepted` — shows the last `x` key handled by the LIFO
	// useRegisterInput handler (sub-demo 2).
	//
	// `trapActive` — drives the standalone <FocusTrap> (sub-demo 3).
	//
	// `showModal` — drives the gating <Modal> (sub-demo 1).
	//
	// `nestedOuter` / `nestedInner` — drive the two nested Modals
	// (sub-demo 4). Both open at once via the `n` key; Esc closes only
	// the innermost (LIFO), then Esc again closes the outer.
	const [counter, setCounter] = useState(0);
	const [lastIntercepted, setLastIntercepted] = useState('—');
	const [trapActive, setTrapActive] = useState(false);
	const [showModal, setShowModal] = useState(false);
	const [nestedOuter, setNestedOuter] = useState(false);
	const [nestedInner, setNestedInner] = useState(false);

	// ── Cooperative input gating ─────────────────────────────────────
	//
	// `useInputCaptureState()` returns true whenever at least one
	// capturing layer (the gating Modal, the nested Modals) or focus
	// trap is active. While it is true we deactivate this scene's own
	// `useInput` via `{isActive: !isCaptured}` AND the LIFO-registered
	// `x` handler below — both honour the voluntary cooperative contract.
	//
	// IMPORTANT: this is VOLUNTARY. An uncooperative `useInput` that
	// ignores `isCaptured` would still fire on every keypress.
	const isCaptured = useInputCaptureState();

	// ── Sub-demo 1: cooperative gating (scene-level useInput) ────────
	//
	// The gated `useInput` drives the counter (j/k), toggles the gating
	// Modal (m), toggles the FocusTrap (t), and opens the nested Modal
	// pair (n). While ANY capturing layer is open `isCaptured` becomes
	// true, so `{isActive: !isCaptured}` deactivates this hook — j/k do
	// nothing. THIS is the cooperative gate in action: the scene
	// voluntarily steps aside while a capturing layer is active.
	useInput(
		(input: string) => {
			switch (input) {
				case 'j': {
					// Decrement — demonstrates that j only works while
					// no capturing layer is open.
					setCounter(value => value - 1);
					break;
				}

				case 'k': {
					// Increment — the cooperative-gating counterpart to j.
					setCounter(value => value + 1);
					break;
				}

				case 'm': {
					// Toggle the gating Modal. Once it is open, isCaptured
					// is true and this whole useInput is deactivated.
					setShowModal(open => !open);
					break;
				}

				case 't': {
					// Toggle the standalone FocusTrap (sub-demo 3).
					setTrapActive(active => !active);
					break;
				}

				case 'n': {
					// Open the nested Modal PAIR (sub-demo 4). Both modals
					// open in a single state update — once either is open
					// isCaptured is true and this useInput is gated off,
					// so we must open them together. Esc then closes only
					// the innermost (LIFO); press Esc again to close the
					// outer.
					setNestedOuter(true);
					setNestedInner(true);
					break;
				}

				default: {
					break;
				}
			}
		},
		{isActive: !isCaptured},
	);

	// ── Sub-demo 2: custom LIFO handler via useRegisterInput ─────────
	//
	// `useRegisterInput('scene12-x', handler, !isCaptured)` registers a
	// handler on the LIFO stack (gated on !isCaptured so it too steps
	// aside while a capturing layer is open). The handler returns `true`
	// to CONSUME the `x` event and stop the walk; it returns `false` for
	// every other key, letting them pass through to lower handlers.
	//
	// Re-registering the SAME id ('scene12-x') would REPLACE the prior
	// handler — but here the id is stable and the handler identity is
	// stabilised internally by useEffectEvent.
	useRegisterInput(
		'scene12-x',
		input => {
			if (input === 'x') {
				setLastIntercepted(`x intercepted at ${Date.now()}`);
				return true; // Consume — stops the LIFO walk here.
			}

			return false; // Pass through to the next handler down.
		},
		!isCaptured,
	);

	// ── Sub-demo 3: standalone FocusTrap (component form) ────────────
	//
	// `<FocusTrap active onEscape restoreFocus>` is the component-form
	// wrapper around `useFocusTrap`. We use restoreFocus: true (the
	// default) so focus springs back to the previously-focused element
	// on deactivation. Only a single trap is active at a time to keep
	// the restoreFocus behaviour unambiguous.

	// ── Render ───────────────────────────────────────────────────────

	return (
		<SceneShell
			title='Scene 12 — Input & Focus'
			description='Cooperative gating, LIFO dispatch, focus traps, nested layers.'
			hints={[
				{key: 'j', label: 'counter −1'},
				{key: 'k', label: 'counter +1'},
				{key: 'm', label: 'toggle gating modal'},
				{key: 'x', label: 'LIFO-intercepted'},
				{key: 't', label: 'toggle focus trap'},
				{key: 'n', label: 'open nested pair'},
				{key: 'Esc', label: 'menu / close topmost'},
			]}
		>
			{/* ── Live status readout ─────────────────────────────── */}
			<Box flexDirection='column'>
				<Text>
					{'Counter: '}
					<Text bold color='cyan'>
						{counter}
					</Text>
				</Text>
				<Text dimColor>{`Last intercepted: ${lastIntercepted}`}</Text>
				<Text dimColor>{`isCaptured: ${isCaptured}`}</Text>
				<Text dimColor>{`Nested — outer: ${nestedOuter}, inner: ${nestedInner}`}</Text>
			</Box>

			{/*
			 * ════════════════════════════════════════════════════════
			 * Sub-demo 1 — Cooperative gating (the gating Modal).
			 *
			 * While this Modal is open, isCaptured is true, so the
			 * scene's useInput is deactivated ({isActive: !isCaptured}).
			 * That means j/k do NOTHING while the modal is up — this is
			 * the cooperative gate in action. The scene VOLUNTARILY
			 * steps aside.
			 *
			 * Close the modal with Esc; isCaptured drops back to false
			 * and j/k resume working.
			 * ════════════════════════════════════════════════════════
			 */}
			<Modal
				open={showModal}
				onOpenChange={setShowModal}
				title='Gating Modal (sub-demo 1)'
				z={100}
			>
				<Box flexDirection='column'>
					<Text>While this modal is open, isCaptured is true.</Text>
					<Text>
						The scene&apos;s j/k keys do nothing — the cooperative gate
						is in action.
					</Text>
					<Text dimColor>Press Esc to close; j/k resume.</Text>
				</Box>
			</Modal>

			{/*
			 * ════════════════════════════════════════════════════════
			 * Sub-demo 3 — Standalone FocusTrap (component form).
			 *
			 * <FocusTrap active onEscape restoreFocus> wraps the hook.
			 * We use restoreFocus: true (the component default) so focus
			 * springs back to the previously-focused element on
			 * deactivation.
			 *
			 * While the trap is active:
			 *   - Tab / Shift+Tab cycles between the FocusableBox
			 *     children (global Tab nav is disabled by the trap).
			 *   - Esc fires onEscape → setTrapActive(false).
			 *   - isCaptured becomes true, so the scene's j/k/m keys
			 *     are gated off too (cooperative contract).
			 *
			 * The FocusableBox children call useFocus() so Ink treats
			 * them as focusable — you can SEE the focused state change
			 * as you press Tab.
			 * ════════════════════════════════════════════════════════
			 */}
			{trapActive && (
				<Box marginTop={1} flexDirection='column'>
					<Text bold underline>
						FocusTrap (component form, restoreFocus: true)
					</Text>
					<FocusTrap
						active={trapActive}
						onEscape={() => {
							setTrapActive(false);
						}}
						restoreFocus={true}
					>
						<Box flexDirection='row' gap={1}>
							<FocusableBox label='Item 1' />
							<FocusableBox label='Item 2' />
						</Box>
					</FocusTrap>
					<Text dimColor>
						Tab cycles focus; Esc closes the trap. restoreFocus: true
						(focus returns to the prior element on close).
					</Text>
				</Box>
			)}

			{/*
			 * ════════════════════════════════════════════════════════
			 * Sub-demo 4 — Nested capturing layers + Esc-closes-topmost.
			 *
			 * Two Modals: outer (z=100) and inner (z=150). Both are
			 * opened at once via the `n` key (a single state update)
			 * because once either Modal is open isCaptured is true and
			 * the scene's useInput is gated off — we could never open
			 * the second one from the scene level.
			 *
			 * Each Modal captures input and registers its own handler on
			 * the LIFO stack. Because handlers are walked TOP-DOWN
			 * (most-recent first), the INNER Modal's handler sees Esc
			 * FIRST and consumes it (returns true), so the OUTER
			 * Modal's handler never sees the event.
			 *
			 * Result: pressing Esc closes ONLY the innermost modal. To
			 * close the outer you press Esc again (after the inner is
			 * gone and its handler unregistered).
			 * ════════════════════════════════════════════════════════
			 */}
			<Modal
				open={nestedOuter}
				onOpenChange={setNestedOuter}
				title='Outer (z=100)'
				z={100}
			>
				<Box flexDirection='column'>
					<Text>
						Outer modal (z=100). Esc closes the inner modal first
						(LIFO), then this one.
					</Text>
				</Box>
			</Modal>

			<Modal
				open={nestedInner}
				onOpenChange={setNestedInner}
				title='Inner (z=150)'
				z={150}
			>
				<Box flexDirection='column'>
					<Text>Inner modal. Esc closes ONLY this one.</Text>
					<Text dimColor>
						The outer modal&apos;s handler never sees the Esc event —
						it was consumed at the top of the LIFO stack.
					</Text>
				</Box>
			</Modal>
		</SceneShell>
	);
}
