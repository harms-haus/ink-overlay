/**
 * Scene 01 · Getting Started — OverlayHost, declarative Modal, imperative
 * toasts.
 *
 * This scene mirrors the "Getting Started" guide: it exercises the two
 * foundational ideas the rest of the library is built on —
 *
 * 1.  A **declarative** `<Modal>` whose `open` state lives in React
 *     (`useState`), so the component tree controls visibility.
 * 2.  An **imperative** toast (`toasts.success(...)` /
 *     `toasts.error(...)`) fired from a plain `useInput` handler — no
 *     hook and no provider plumbing beyond the host.
 *
 * ## <OverlayHost> note
 *
 * We do **not** import or render `<OverlayHost>` here. The app root
 * (the demo menu shell) mounts a single `<OverlayHost>` **once** at the
 * top of the tree, and every overlay component — `<Modal>`, toasts,
 * `<Popover>`, etc. — must live **inside** that host. Because this
 * scene is rendered as a child of the app root, it is already inside
 * the host, so `<Modal>` and the toast service "just work".
 *
 * Importing `OverlayHost` here would be an unused import (it would
 * fail the project's `noUnusedLocals` rule), so it is deliberately
 * omitted.
 *
 * @module demo/scenes/01-getting-started
 */

import {useState} from 'react';
import {Box, Text} from 'ink';
import {Modal, toasts} from '../../src/index.js';
import {SceneShell} from '../ui.js';
import {useGatedInput} from '../hooks.js';

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 01 — the "Getting Started" scene.
 *
 * Demonstrates the two core patterns:
 *
 * - **Declarative `<Modal>`** — `open` is driven by a `useState` boolean;
 *   pressing `m` toggles it.
 * - **Imperative toasts** — `toasts.success(...)` / `toasts.error(...)`
 *   are plain function calls; no hook or provider is required beyond the
 *   host mounted in the app root.
 *
 * Input is **cooperatively gated**: when a modal (or any capturing
 * overlay) is open, `useInputCaptureState()` returns `true` and this
 * scene's own `useInput` is deactivated (`isActive: !isCaptured`) so the
 * modal's keypresses (Esc, etc.) are not double-handled by the scene.
 */
export function Scene01GettingStarted() {
	// ── Declarative modal state ──────────────────────────────────────
	//
	// The modal's visibility is controlled entirely by this boolean.
	// The `<Modal>` below receives it as its `open` prop and calls
	// `onOpenChange` (which is `setShowModal`) whenever the library
	// closes the modal (Escape, backdrop click, etc.).
	const [showModal, setShowModal] = useState(false);

	// ── Scene input handler ─────────────────────────────────
	//
	// `m` toggles the declarative modal; `s` and `e` fire imperative
	// toasts. useGatedInput automatically deactivates this handler while
	// a capturing overlay is open so keypresses are not double-handled.
	useGatedInput(input => {
		switch (input) {
			case 'm': {
				// Declarative: toggle the React state that controls <Modal open>.
				setShowModal(previous => !previous);
				break;
			}

			case 's': {
				// Imperative — callable from anywhere, no hook/provider needed.
				// Returns a toast id and auto-dismisses after 4000 ms (default).
				toasts.success('Saved successfully');
				break;
			}

			case 'e': {
				// Imperative — same as success but renders in the error style.
				// Returns a toast id and auto-dismisses after 4000 ms (default).
				toasts.error('Something went wrong');
				break;
			}

			default: {
				break;
			}
		}
	});

	return (
		<SceneShell
			title="01 · Getting Started"
			description="OverlayHost, declarative Modal, imperative toasts"
			hints={[
				{key: 'm', label: 'Modal'},
				{key: 's', label: 'success toast'},
				{key: 'e', label: 'error toast'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/* ── Informational copy explaining the scene ───────────── */}
			<Box flexDirection="column">
				<Text>
					Press <Text bold>m</Text> to toggle the declarative modal.
				</Text>
				<Text>
					Press <Text bold>s</Text> or <Text bold>e</Text> to fire an imperative
					toast from anywhere.
				</Text>
				<Text dimColor>
					{'<'}OverlayHost{'>'} is mounted once in the app root; every overlay
					component must live inside it.
				</Text>
			</Box>

			{/* ════════════════════════════════════════════════════════
			    Declarative modal.

			    The <Modal> renders nothing inline — it registers itself
			    with the <OverlayHost> layer list and is painted in the
			    absolute-positioned overlay plane. When `open` is false
			    it is not in the layer list at all.

			    Every prop is annotated below with its purpose **and**
			    default. The fixed <Layer> settings baked into <Modal>
			    (anchor='center', capture=true) are NOT overridable —
			    that is what makes <Modal> the opinionated "centered
			    dialog" component.

			    ════════════════════════════════════════════════════ */}
			<Modal
				// The `open` prop — controlled visibility. Driven by React
				// state. When omitted the modal runs in uncontrolled mode
				// (defaultOpen applies). Here we always pass it so the
				// scene owns the lifecycle.
				open={showModal}
				// The `onOpenChange` prop — the library calls this whenever
				// the open state changes (including after Escape / backdrop
				// dismissal). We wire it straight to setShowModal so the
				// React state stays in sync with the layer.
				onOpenChange={setShowModal}
				// The `onDismiss` prop — fires for Escape / backdrop BEFORE
				// the library calls onOpenChange(false).
				//
				// WHY side-effects only: do NOT call setShowModal(false)
				// here. The library already closes the modal (it calls
				// onOpenChange(false) right after onDismiss), so calling
				// setOpen(false) yourself would be a redundant second
				// state update. Use this callback for genuine side-effects
				// (logging, analytics, aborting a fetch, etc.) only.
				onDismiss={() => {
					/* Side-effects only — do NOT setOpen(false) here */
				}}
				// The `title` prop — bold header rendered inside the top
				// border. Default: undefined (no header row).
				title="Hello, Modal"
				// The `footer` prop — dim text rendered inside the bottom
				// border. Default: undefined (no footer row).
				footer="Esc to close"
			>
				{/* children — the modal body, rendered between the
				     optional title and footer inside the bordered box. */}
				{/* 
				  Omitted props use their defaults:
				  - width: 50
				  - backdrop: 'dim'
				  - borderStyle: 'round'
				  - borderColor: 'cyan'
				  - z: 100
				  - role: 'dialog'
				*/}
				<Text>Modal content goes here.</Text>
			</Modal>
		</SceneShell>
	);
}
