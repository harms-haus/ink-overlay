/**
 * Layer primitive for ink-overlay.
 *
 * Provides the declarative {@link Layer} component (public) and the
 * internal {@link LayerRenderer} component (used by the host to render
 * floating content).
 *
 * ## Architecture
 *
 * - **`<Layer>`** registers itself with the {@link OverlayHost} when open
 *   and renders `null`. The host renders the content via
 *   {@link LayerRenderer}.
 * - **`<LayerRenderer>`** is an internal component that renders the
 *   floating content with backdrop, anchor-based positioning (flexbox),
 *   transitions, input capture, and focus trapping.
 *
 * @module layer
 */

import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {Box, useWindowSize} from 'ink';
import {useOverlayHost} from './host-context.js';
import {anchorToFlexbox} from './primitives.js';
import {generateId} from './id.js';
import {useRegisterInput} from './input-dispatcher.js';
import {FocusTrap} from './focus-trap.js';
import {useEnterExit, mergeTransitionStyle, resolveTransition} from './animation.js';
import type {LayerOpts, OverlayDescriptor, TransitionConfig} from './types.js';

// ── Layer Props ─────────────────────────────────────────────────────

export type LayerProps = LayerOpts & {
	/** Controlled open state. If provided, the layer is controlled. */
	open?: boolean;
	/** Initial open state for uncontrolled mode. Default `true`. */
	defaultOpen?: boolean;
	/** Called when the open state changes. */
	onOpenChange?: (open: boolean) => void;
	/** Layer content. */
	children?: ReactNode;
	/** Optional stable id. If not provided, a random id is generated. */
	id?: string;
};

// ── Identity transition (no-op default) ────────────────────────────

const IDENTITY_TRANSITION: TransitionConfig = {
	enter: [{style: {}}],
	exit: [{style: {}}],
	duration: 0,
};

// ── Layer Component ─────────────────────────────────────────────────

/**
 * Declarative overlay layer.
 *
 * Registers itself with the {@link OverlayHost} when open, and renders
 * `null` — the host renders the content via {@link LayerRenderer}.
 *
 * Supports controlled (`open` prop) and uncontrolled (`defaultOpen`)
 * modes.
 */
export function Layer({
	open: controlledOpen,
	defaultOpen = true,
	onOpenChange,
	children,
	id: propertyId,
	anchor,
	top,
	left,
	right,
	bottom,
	z,
	capture = false,
	backdrop = 'none',
	backdropColor,
	role,
	overflow = 'hidden',
	margin,
	transition,
	onDismiss,
	onBackdropInput,
}: LayerProps) {
	const host = useOverlayHost();

	// ── Stable unique id ────────────────────────────────────────────

	const idReference = useRef<string>(
		propertyId ?? generateId(),
	);
	const id = idReference.current;

	// ── Controlled vs uncontrolled ──────────────────────────────────

	const isControlled = controlledOpen !== undefined;
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isOpen = isControlled ? controlledOpen : internalOpen;

	// ── Resolve transition (memoized) ───────────────────────────────

	const resolvedTransition: TransitionConfig | undefined = useMemo(
		() => resolveTransition(transition),
		[transition],
	);

	// ── explicitPosition (memoized) ────────────────────────────────

	const explicitPosition = useMemo(
		() =>
			!anchor
			&& (top !== undefined || left !== undefined || right !== undefined || bottom !== undefined)
				? {
					top, left, right, bottom,
				}
				: undefined,
		[top, left, right, bottom, anchor],
	);

	// ── Content ref (keeps latest children without triggering effect) ─

	const contentRef = useRef<ReactNode>(children);
	contentRef.current = children;

	// ── Track registration state ────────────────────────────────────

	const registeredReference = useRef(false);

	// ── Stable dismiss callback (reads latest props via ref) ────────

	const propertiesReference = useRef({onDismiss, onOpenChange, isControlled});
	propertiesReference.current = {onDismiss, onOpenChange, isControlled};

	const handleDismiss = useCallback(() => {
		const {onDismiss: od, onOpenChange: ooc, isControlled: ic} = propertiesReference.current;
		od?.();
		if (ic) {
			ooc?.(false);
		} else {
			setInternalOpen(false);
			ooc?.(false);
		}
	}, []);

	// ── Lifecycle: register / update / close ────────────────────────

	const previousOpenReference = useRef(false);

	useEffect(() => {
		const wasOpen = previousOpenReference.current;
		previousOpenReference.current = isOpen;

		if (isOpen) {
			const desc = {
				id,
				z: z ?? 0,
				capture,
				backdrop,
				backdropColor,
				role,
				anchor,
				explicitPosition,
				content: contentRef.current,
				overflow,
				margin,
				transition: resolvedTransition,
				onDismiss: handleDismiss,
				onBackdropInput,
			};

			if (!wasOpen) {
				// Opening: register a new layer
				host.registerLayer(desc);
				registeredReference.current = true;
			} else if (registeredReference.current) {
				// Already open: update with fresh props
				host.updateLayer(id, {
					content: contentRef.current,
					z: z ?? 0,
					capture,
					backdrop,
					backdropColor,
					role,
					anchor,
					explicitPosition,
					overflow,
					margin,
					transition: resolvedTransition,
					onDismiss: handleDismiss,
					onBackdropInput,
				});
			} else {
				// StrictMode re-mount: wasOpen but registration was cleared
				host.registerLayer(desc);
				registeredReference.current = true;
			}
		} else if (wasOpen && registeredReference.current) {
			// Closing: check for exit transition
			if (
				resolvedTransition?.exit
				&& resolvedTransition.exit.length > 1
			) {
				host.updateLayer(id, {exiting: true});
				registeredReference.current = false;
			} else {
				host.unregisterLayer(id);
				registeredReference.current = false;
			}
		}
	}, [
		isOpen,
		z,
		capture,
		backdrop,
		backdropColor,
		role,
		anchor,
		top,
		left,
		right,
		bottom,
		overflow,
		margin,
		transition,
		onBackdropInput,
	]);

	// ── Content sync: push contentRef changes to the host ────────
	//
	// Because `children` was deliberately removed from the main
	// effect deps (to avoid churning register/update on every
	// render), content-only updates would leave the host descriptor
	// stale.  This effect runs after every render, compares the
	// current contentRef with the last-synced snapshot, and pushes
	// an update when they differ.
	const previousContentSyncReference = useRef<ReactNode>(contentRef.current);
	useEffect(() => {
		if (
			registeredReference.current
			&& previousContentSyncReference.current !== contentRef.current
		) {
			previousContentSyncReference.current = contentRef.current;
			host.updateLayer(id, {content: contentRef.current});
		}
	});

	// ── Unmount cleanup ─────────────────────────────────────────────

	useEffect(
		() => () => {
			if (registeredReference.current) {
				host.unregisterLayer(id);
				registeredReference.current = false;
			}
		},
		[],
	);

	// Layer renders null — the host renders content via LayerRenderer.
	return null;
}

// ── LayerRenderer (internal) ────────────────────────────────────────

/**
 * Internal component used by the host to render a layer's floating
 * content.
 *
 * Handles: backdrop, anchor-based positioning via flexbox, transitions,
 * input capture, and focus trapping.
 *
 * @internal Exported as `LayerRenderer` for the host's import, but not
 * part of the public API.
 */
export function LayerRenderer({
	descriptor,
}: {
	descriptor: OverlayDescriptor;
}) {
	const host = useOverlayHost();

	// ── Resize awareness (triggers re-render on terminal resize) ────

	useWindowSize();

	// ── Transition ──────────────────────────────────────────────────

	const transitionConfig = descriptor.transition ?? IDENTITY_TRANSITION;

	const {currentStyle} = useEnterExit(
		!descriptor.exiting,
		transitionConfig,
		descriptor.exiting
			? {
				onExited() {
					host.onLayerExited(descriptor.id);
				},
			}
			: undefined,
	);

	// ── Input handler (Escape dismiss + backdrop) ───────────────────

	// For role='dialog' ONLY, default backdrop input dismissal to
	// descriptor.onDismiss so consumers get click-away dismiss without
	// wiring onBackdropInput explicitly.  role='alertdialog' blocks —
	// it must only close via explicit user action.  role='menu',
	// 'tooltip', 'toast', and untyped layers must NOT auto-dismiss on
	// backdrop input, otherwise non-escape/non-tab keys are consumed
	// before the component's own input handler can process them.
	const effectiveBackdropInput = descriptor.onBackdropInput
		?? (descriptor.role === 'dialog' ? descriptor.onDismiss : undefined);

	useRegisterInput(
		descriptor.id,
		(input, key) => {
			// Escape → dismiss (defensive; FocusTrap also handles this)
			if (key.escape || input === '\u001B') {
				if (descriptor.role !== 'alertdialog') {
					descriptor.onDismiss?.();
				}

				return true;
			}

			// Tab / Shift+Tab → let the focus trap handle cycling
			if (input === '\t' || input === '\u001B[Z') {
				return false;
			}

			// Any other input → backdrop handling
			if (effectiveBackdropInput) {
				effectiveBackdropInput();
				return true;
			}

			return false;
		},
		descriptor.capture,
	);

	// ── Backdrop color ──────────────────────────────────────────────

	const backdropColor = descriptor.backdropColor
		?? (descriptor.backdrop === 'opaque' ? 'black' : '#1a1a2e');

	// ── Transition style overrides ──────────────────────────────────

	const transitionStyle = mergeTransitionStyle({}, currentStyle);

	// ── Inner content box (with overflow + transition styles) ────────

	const contentBox = (
		<Box
			overflow={descriptor.overflow}
			marginTop={descriptor.margin?.top}
			marginBottom={descriptor.margin?.bottom}
			marginLeft={descriptor.margin?.left}
			marginRight={descriptor.margin?.right}
			{...transitionStyle}
		>
			{descriptor.content}
		</Box>
	);

	// ── Wrap in FocusTrap when capture is active ────────────────────

	const wrappedContent = descriptor.capture ? (
		<FocusTrap active onEscape={descriptor.onDismiss} restoreFocus>
			{contentBox}
		</FocusTrap>
	) : (
		contentBox
	);

	// ── Content wrapper (anchor-based flexbox or explicit position) ─

	let contentWrapper: ReactNode;

	if (descriptor.explicitPosition) {
		const {top: t, left: l, right: r, bottom: b}
			= descriptor.explicitPosition;
		contentWrapper = (
			<Box
				position='absolute'
				top={t}
				left={l}
				right={r}
				bottom={b}
			>
				{wrappedContent}
			</Box>
		);
	} else {
		const {alignItems, justifyContent} = anchorToFlexbox(
			descriptor.anchor ?? 'center',
		);
		contentWrapper = (
			<Box
				position='absolute'
				top={0}
				left={0}
				width='100%'
				height='100%'
				flexDirection='row'
				alignItems={alignItems}
				justifyContent={justifyContent}
			>
				{wrappedContent}
			</Box>
		);
	}

	// ── Render ──────────────────────────────────────────────────────

	return (
		<>
			{descriptor.backdrop !== 'none' && (
				/**
				 * OVERPAINT backdrop — terminals have no real transparency.
				 * This is a solid-color block painted beneath the content,
				 * not a true alpha dimming layer.
				 */
				<Box
					position='absolute'
					top={0}
					left={0}
					width='100%'
					height='100%'
					backgroundColor={backdropColor}
				/>
			)}
			{contentWrapper}
		</>
	);
}
