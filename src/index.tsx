/**
 * Public barrel exports for `@harms-haus/ink-overlay`.
 *
 * Re-exports the public API surface only. Internal helpers
 * (`LayerRenderer`, `OverlayHostContext`, `useOverlayHost`,
 * `overlayStore`, `useInputDispatcher`, etc.) are intentionally not
 * re-exported here.
 *
 * @module @harms-haus/ink-overlay
 */

// ── Components ──────────────────────────────────────────────────────

export {OverlayHost} from './host.js';
export {Layer} from './layer.js';
export {Modal} from './modal.js';
export {Popover} from './popover.js';
export {Tooltip} from './tooltip.js';
export {Toast, defaultToastColors} from './toast.js';
export {CommandPalette} from './command-palette.js';

// ── Focus trap ──────────────────────────────────────────────────────

export {FocusTrap, useFocusTrap} from './focus-trap.js';

// ── Input dispatcher ────────────────────────────────────────────────

export {
	InputDispatcher,
	useRegisterInput,
	useInputCaptureState,
} from './input-dispatcher.js';

// ── Imperative overlay & toast services ─────────────────────────────

export {overlay, toasts} from './manager.js';

// ── Animation ───────────────────────────────────────────────────────

export {getTransitionSteps, resolveTransition} from './animation.js';

// ── Pure positioning helpers ────────────────────────────────────────

export {
	anchorToFlexbox,
	computeAnchorCoords,
	computePopoverPosition,
	sortLayers,
} from './primitives.js';

// ── Runtime detection ───────────────────────────────────────────────

export {isBun, isNonInteractive, getRuntimeInfo} from './runtime.js';

// ── Component Props types ───────────────────────────────────────────

export type {OverlayHostProps} from './host.js';
export type {LayerProps} from './layer.js';
export type {ModalProps} from './modal.js';
export type {PopoverProps} from './popover.js';
export type {TooltipProps} from './tooltip.js';
export type {ToastProps} from './toast.js';
export type {CommandPaletteProps} from './command-palette.js';

// ── Shared domain types ─────────────────────────────────────────────

export type {
	Anchor,
	Placement,
	BackdropKind,
	Role,
	LayerOpts,
	OverlayDescriptor,
	LayerPatch,
	ToastKind,
	ToastOptions,
	CommandPaletteItem,
	FilterFunction,
	TransitionName,
	TransitionConfig,
	AnchorRect,
	Rect,
	Viewport,
	OffsetEdges,
} from './types.js';
