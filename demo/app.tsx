/**
 * Demo app entry point — ties the scene registry, menu, and a single
 * shared {@link OverlayHost} into one interactive Ink application.
 *
 * ## Architecture
 *
 * This is a **single interactive app** driven by menu-based scene
 * selection. The root `<App>` component holds one piece of state —
 * the currently active scene (or `null`, meaning "show the menu").
 * Pressing Enter on a menu entry mounts that scene; pressing Esc
 * returns to the menu by clearing the active scene.
 *
 * The app is split into two components: `App` (the root, which owns
 * the scene state and mounts `<OverlayHost>`) and `DemoShell` (a
 * child rendered INSIDE `<OverlayHost>` that owns the global
 * `q`/Esc hotkeys and switches between the menu and the active
 * scene). This split is mandatory — see `DemoShell` below.
 *
 * ## Why a single `<OverlayHost>`?
 *
 * `<OverlayHost>` MUST be mounted exactly once, as close to the root
 * as practical. It owns the React context and the imperative overlay
 * store that every `<Modal>`, `<Popover>`, `<Toast>`, and
 * `<CommandPalette>` reads from. Nesting two hosts is unsupported and
 * will silently produce duplicate/conflicting overlays. Because every
 * scene lives underneath this one host, scenes can freely open
 * overlays without each supplying their own host.
 *
 * ## Why only one scene is mounted at a time?
 *
 * Each scene registers its own `useInput` listener. If several scenes
 * were mounted simultaneously their listeners would all fire on every
 * keypress (Ink has no event-consumption mechanism), causing
 * conflicts. By rendering either the menu OR exactly one scene
 * (`activeScene ? <Scene/> : <Menu/>`), only one set of input
 * handlers is ever active.
 *
 * ## Why are the global q/Esc hotkeys gated?
 *
 * The root `useInput` that handles `q` (quit) and Esc (back to menu)
 * is gated with `{isActive: !isCaptured}`. `useInputCaptureState()`
 * reports `true` whenever a capturing overlay (a modal or the command
 * palette) is open. Without this gate, pressing `q` or Esc while a
 * modal is open would quit the app or leave the scene instead of
 * interacting with the modal — violating the cooperative input model.
 *
 * ## Why `exitOnCtrlC: true`?
 *
 * Ink enables raw mode for input capture, which intercepts the usual
 * Ctrl+C signal. `exitOnCtrlC: true` ensures Ctrl+C still cleanly
 * terminates the process even while raw mode is active.
 *
 * ## Why import from `../src/index.js`?
 *
 * The demo imports the library via a relative path to its SOURCE
 * (not the package name or a compiled `dist/` bundle). This means
 * TypeScript type-checks the demo against the real, current library
 * surface, so any API drift between the demo and the library is
 * caught at compile time rather than at runtime.
 *
 * ## Running the demo
 *
 * `npm run demo` (which executes this file via `tsx`) requires an
 * interactive TTY. Ink throws `Raw mode is not supported` when stdin
 * is not a real terminal, so do NOT attempt to run it inside CI or
 * any piped/non-interactive shell.
 *
 * @module demo/app
 */

import {useState} from 'react';
import {render, useApp, useInput} from 'ink';
import {OverlayHost, useInputCaptureState} from '../src/index.js';
import {type SceneDefinition} from './types.js';
import {SceneMenu} from './menu.js';

// ── Scene imports ───────────────────────────────────────────────────
//
// Each scene is imported individually. Note the mixed export styles:
// scenes 01 and 03 use named exports; all others use default exports.
import {Scene01OverlayHost} from './scenes/01-overlay-host.js';
import Scene02LayerAnchors from './scenes/02-layer-anchors.js';
import {Scene03Backdrop} from './scenes/03-backdrop.js';
import Scene04ZOrdering from './scenes/04-z-ordering.js';
import Scene05ModalDeepdive from './scenes/05-modal-deepdive.js';
import Scene06Popover from './scenes/06-popover.js';
import Scene07Tooltip from './scenes/07-tooltip.js';
import Scene08Toasts from './scenes/08-toasts.js';
import Scene09CommandPalette from './scenes/09-command-palette.js';
import Scene10Animations from './scenes/10-animations.js';
import Scene11ImperativeOverlay from './scenes/11-imperative-overlay.js';
import Scene12InputFocus from './scenes/12-input-focus.js';
import Scene13Runtime from './scenes/13-runtime.js';

// ── Scene registry ──────────────────────────────────────────────────
//
// Ordered list of every demo scene. The menu renders this array
// verbatim, so the order here is the order shown to the user.

const scenes: SceneDefinition[] = [
	{
		id: '01',
		title: '01 · Getting Started',
		description: 'OverlayHost, declarative Modal, imperative toasts',
		tags: ['Modal', 'toasts'],
		component: Scene01OverlayHost,
	},
	{
		id: '02',
		title: '02 · Layer & Anchors',
		description: '9 anchors, explicit offsets, overflow, margin',
		tags: ['Layer', 'Anchor'],
		component: Scene02LayerAnchors,
	},
	{
		id: '03',
		title: '03 · Backdrop',
		description: 'none/dim/opaque, custom color, onBackdropInput',
		tags: ['Layer', 'Backdrop'],
		component: Scene03Backdrop,
	},
	{
		id: '04',
		title: '04 · Z-Ordering',
		description: 'z paint order across stacked layers',
		tags: ['Layer', 'z'],
		component: Scene04ZOrdering,
	},
	{
		id: '05',
		title: '05 · Modal Deep-Dive',
		description: 'all Modal props, alertdialog, role variants',
		tags: ['Modal', 'Role'],
		component: Scene05ModalDeepdive,
	},
	{
		id: '06',
		title: '06 · Popover',
		description: 'anchorRef, placements, flip/shift, collisionPadding',
		tags: ['Popover'],
		component: Scene06Popover,
	},
	{
		id: '07',
		title: '07 · Tooltip',
		description: 'key/focus triggers, custom triggerKey & dismissDelay',
		tags: ['Tooltip'],
		component: Scene07Tooltip,
	},
	{
		id: '08',
		title: '08 · Toasts',
		description: 'imperative service + presentational Toast',
		tags: ['toasts', 'Toast'],
		component: Scene08Toasts,
	},
	{
		id: '09',
		title: '09 · Command Palette',
		description: 'filtering, nav, windowing, custom renderItem',
		tags: ['CommandPalette'],
		component: Scene09CommandPalette,
	},
	{
		id: '10',
		title: '10 · Animations',
		description: 'named transitions, custom config, exit animations',
		tags: ['Animation'],
		component: Scene10Animations,
	},
	{
		id: '11',
		title: '11 · Imperative Overlay',
		description: 'overlay.open/close/closeAll/update',
		tags: ['overlay', 'imperative'],
		component: Scene11ImperativeOverlay,
	},
	{
		id: '12',
		title: '12 · Input & Focus',
		description: 'capture gating, LIFO dispatch, FocusTrap, nesting',
		tags: ['Input', 'Focus'],
		component: Scene12InputFocus,
	},
	{
		id: '13',
		title: '13 · Runtime & Environments',
		description: 'getRuntimeInfo, Bun/non-TTY graceful degradation',
		tags: ['Runtime'],
		component: Scene13Runtime,
	},
];

// ── DemoShell (inner component — inside <OverlayHost>) ──────────────

/**
 * Props for {@link DemoShell}.
 */
type DemoShellProps = {
	/** The currently active scene, or `null` when the menu is showing. */
	activeScene: SceneDefinition | null;
	/** Setter for the active-scene state (Esc clears it to `null`). */
	setActiveScene: (scene: SceneDefinition | null) => void;
	/** Ink exit — invoked when the user presses `q`. */
	exitDemo: () => void;
};

/**
 * Inner shell rendered **inside** `<OverlayHost>`.
 *
 * Owns the global `q`/Esc hotkeys and switches between the menu and
 * the active scene.
 *
 * ## Why does the global input handling live here and NOT in `App`?
 *
 * `useInputCaptureState()` (and every other overlay hook) reads from
 * the `InputDispatcher` context, which is only provided INSIDE the
 * `<OverlayHost>` subtree. `App` is the **parent** of
 * `<OverlayHost>`, so calling `useInputCaptureState()` directly in
 * `App` throws
 * `useInputDispatcher must be used within an <InputDispatcher>`.
 * `DemoShell`, being a child of `<OverlayHost>`, is within the context
 * and can safely read the capture state.
 */
function DemoShell({activeScene, setActiveScene, exitDemo}: DemoShellProps) {
	// Cooperative capture flag — `true` while a capturing overlay
	// (modal/command-palette) is open.
	const isCaptured = useInputCaptureState();

	// Global hotkeys. Gated on `!isCaptured` so they yield to any
	// capturing overlay: you cannot accidentally quit or leave while a
	// modal is open.
	useInput(
		(input, key) => {
			// `q` quits the entire app.
			if (input === 'q') {
				exitDemo();
				return;
			}

			// Esc returns to the menu — but only when a scene is
			// active. While the menu itself is showing, Esc is a
			// no-op here.
			if (key.escape && activeScene !== null) {
				setActiveScene(null);
			}
		},
		{isActive: !isCaptured},
	);

	// JSX requires a capitalized identifier for a component reference.
	// Extract the component from the (non-null) active scene so we can
	// render it as `<ActiveScene />`.
	const ActiveScene = activeScene?.component;

	return activeScene !== null && ActiveScene !== undefined ? (
		<ActiveScene />
	) : (
		<SceneMenu scenes={scenes} onSelect={setActiveScene} />
	);
}

// ── App component ───────────────────────────────────────────────────

/**
 * Root demo component.
 *
 * Holds the active-scene state and renders the single shared
 * `<OverlayHost>` that wraps {@link DemoShell} (which in turn switches
 * between the menu and the active scene).
 */
function App() {
	// The currently active scene, or `null` when the menu is showing.
	const [activeScene, setActiveScene] = useState<SceneDefinition | null>(null);

	// `useApp()` is Ink's own context — available everywhere Ink renders.
	const {exit} = useApp();

	return (
		<OverlayHost>
			<DemoShell
				activeScene={activeScene}
				setActiveScene={setActiveScene}
				exitDemo={exit}
			/>
		</OverlayHost>
	);
}

// ── Render ──────────────────────────────────────────────────────────

render(<App />, {exitOnCtrlC: true});
