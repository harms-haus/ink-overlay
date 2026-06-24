import {describe, test, expect} from 'vitest';

// ── Runtime values ──────────────────────────────────────────────────
import {
	// Components
	OverlayHost,
	Layer,
	Modal,
	Popover,
	Tooltip,
	Toast,
	CommandPalette,
	// Focus trap
	FocusTrap,
	useFocusTrap,
	// Input dispatcher
	InputDispatcher,
	useRegisterInput,
	useInputCaptureState,
	// Imperative services
	overlay,
	toasts,
	// Animation
	getTransitionSteps,
	// Pure helpers
	anchorToFlexbox,
	computeAnchorCoords,
	computePopoverPosition,
	sortLayers,
	// Runtime detection
	isBun,
	isNonInteractive,
	getRuntimeInfo,
} from '../src/index.js';

// ── Types (compile-time validation only) ────────────────────────────
import type {
	OverlayHostProps,
	LayerProps,
	ModalProps,
	PopoverProps,
	TooltipProps,
	ToastProps,
	CommandPaletteProps,
	Anchor,
	Placement,
	BackdropKind,
	Role,
	LayerOpts,
	OverlayDescriptor,
	ToastKind,
	ToastOptions,
	CommandPaletteItem,
	FilterFunction,
	TransitionName,
	TransitionConfig,
} from '../src/index.js';

/**
 * This test file asserts that every public name is exported from the
 * package barrel (`src/index.tsx`).
 *
 * - Runtime values (components, functions, objects) are imported as
 *   values and asserted to be defined at runtime.
 * - Types are imported with `import type` — the mere presence of these
 *   imports validates at compile time (via `npm run typecheck`) that
 *   the types are exported. The `_types` object below is a
 *   compile-time-only reference to suppress "unused type" lints.
 */
const _types = {

	OverlayHostProps: null as unknown as OverlayHostProps,

	LayerProps: null as unknown as LayerProps,

	ModalProps: null as unknown as ModalProps,

	PopoverProps: null as unknown as PopoverProps,

	TooltipProps: null as unknown as TooltipProps,

	ToastProps: null as unknown as ToastProps,

	CommandPaletteProps: null as unknown as CommandPaletteProps,

	Anchor: null as unknown as Anchor,

	Placement: null as unknown as Placement,

	BackdropKind: null as unknown as BackdropKind,

	Role: null as unknown as Role,

	LayerOpts: null as unknown as LayerOpts,

	OverlayDescriptor: null as unknown as OverlayDescriptor,

	ToastKind: null as unknown as ToastKind,

	ToastOptions: null as unknown as ToastOptions,

	CommandPaletteItem: null as unknown as CommandPaletteItem,

	FilterFunction: null as unknown as FilterFunction,

	TransitionName: null as unknown as TransitionName,

	TransitionConfig: null as unknown as TransitionConfig,
};
void _types;

// ── Runtime assertions ──────────────────────────────────────────────

describe('public barrel exports', () => {
	describe('components', () => {
		test('OverlayHost is defined', () => {
			expect(typeof OverlayHost).toBe('function');
		});

		test('Layer is defined', () => {
			expect(typeof Layer).toBe('function');
		});

		test('Modal is defined', () => {
			expect(typeof Modal).toBe('function');
		});

		test('Popover is defined', () => {
			expect(typeof Popover).toBe('function');
		});

		test('Tooltip is defined', () => {
			expect(typeof Tooltip).toBe('function');
		});

		test('Toast is defined', () => {
			expect(typeof Toast).toBe('function');
		});

		test('CommandPalette is defined', () => {
			expect(typeof CommandPalette).toBe('function');
		});
	});

	describe('focus trap', () => {
		test('FocusTrap is defined', () => {
			expect(typeof FocusTrap).toBe('function');
		});

		test('useFocusTrap is defined', () => {
			expect(typeof useFocusTrap).toBe('function');
		});
	});

	describe('input dispatcher', () => {
		test('InputDispatcher is defined', () => {
			expect(typeof InputDispatcher).toBe('function');
		});

		test('useRegisterInput is defined', () => {
			expect(typeof useRegisterInput).toBe('function');
		});

		test('useInputCaptureState is defined', () => {
			expect(typeof useInputCaptureState).toBe('function');
		});
	});

	describe('imperative services', () => {
		test('overlay is defined', () => {
			expect(typeof overlay).toBe('object');
			expect(overlay).not.toBeNull();
		});

		test('toasts is defined', () => {
			expect(typeof toasts).toBe('object');
			expect(toasts).not.toBeNull();
		});
	});

	describe('animation', () => {
		test('getTransitionSteps is defined', () => {
			expect(typeof getTransitionSteps).toBe('function');
		});
	});

	describe('pure helpers', () => {
		test('anchorToFlexbox is defined', () => {
			expect(typeof anchorToFlexbox).toBe('function');
		});

		test('computeAnchorCoords is defined', () => {
			expect(typeof computeAnchorCoords).toBe('function');
		});

		test('computePopoverPosition is defined', () => {
			expect(typeof computePopoverPosition).toBe('function');
		});

		test('sortLayers is defined', () => {
			expect(typeof sortLayers).toBe('function');
		});
	});

	describe('runtime detection', () => {
		test('isBun is defined', () => {
			expect(typeof isBun).toBe('function');
		});

		test('isNonInteractive is defined', () => {
			expect(typeof isNonInteractive).toBe('function');
		});

		test('getRuntimeInfo is defined', () => {
			expect(typeof getRuntimeInfo).toBe('function');
		});
	});
});
