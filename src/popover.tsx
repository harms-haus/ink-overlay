/**
 * Popover — element-anchored floating layer with collision detection.
 *
 * Renders a {@link Layer} positioned relative to an anchor element.
 * Uses {@link computePopoverPosition} for flip/shift/collision logic
 * and ink's {@link useBoxMetrics} for measurement.
 *
 * ## Flash-free strategy
 *
 * Until both the anchor and popover are measured, the layer is rendered
 * offscreen (top: -9999). Once measured, it snaps to the computed
 * position — never flashing at (0,0).
 *
 * ## Layout-shift limitation
 *
 * Popover repositions on anchor resize, popover content resize, and
 * terminal resize. It does **not** track ancestor/sibling layout shifts.
 * `useBoxMetrics` returns parent-relative metrics; `getRootRelativeRect`
 * walks `parentNode` to produce root-relative coordinates, but the
 * position effect only re-runs when the parent-relative metrics or
 * viewport change. When a sibling or ancestor moves the anchor's
 * root-relative position without changing its parent-relative metrics,
 * the popover will not reposition.
 *
 * Ink exposes no public per-node layout observer (`addLayoutListener`
 * exists in `ink/build/dom.js` but is not part of the public API). If
 * the anchor moves due to surrounding content changes, close and
 * reopen the popover, or key it on the layout-affecting state.
 *
 * @module popover
 */

import {
	type RefObject,
	type ReactNode,
	useRef,
	useState,
	useEffect,
} from 'react';
import {Box, useBoxMetrics, useWindowSize, type DOMElement} from 'ink';
import {computePopoverPosition} from './primitives.js';
import {Layer} from './layer.js';
import type {
	Placement,
	OffsetEdges,
	BackdropKind,
	AnchorRect,
} from './types.js';

/** Offscreen position used before the popover is measured (flash-free). */
const OFFSCREEN_SENTINEL = -9999;

// ── Props ───────────────────────────────────────────────────────────

export type PopoverProps = {
	/** Ref to the anchor DOMElement that the popover is positioned relative to. */
	anchorRef: RefObject<DOMElement | null>;
	/** Preferred placement of the popover relative to the anchor. Default `'bottom'`. */
	placement?: Placement;
	/** Main-axis offset (character cells) from the anchor edge. Default `1`. */
	offset?: number;
	/** Cross-axis offset from the anchor's cross-axis start. Default `0`. */
	crossOffset?: number;
	/** Allow the placement to flip when it would overflow. Default `true`. */
	flip?: boolean;
	/** Clamp position within the viewport after flip. Default `true`. */
	shift?: boolean;
	/** Extra padding applied during shift clamping. Default `0`. */
	collisionPadding?: number | Partial<OffsetEdges>;
	/** Controlled open state. */
	open?: boolean;
	/** Initial open state for uncontrolled mode. Default `true` (matches Layer). */
	defaultOpen?: boolean;
	/** Called when the open state changes. */
	onOpenChange?: (open: boolean) => void;
	/** Called when the popover is dismissed. */
	onDismiss?: () => void;
	/** Whether the popover captures input. Default `false`. */
	capture?: boolean;
	/** Backdrop kind. Default `'none'`. */
	backdrop?: BackdropKind;
	/** Z-index. Default `50`. */
	z?: number;
	/** Popover content. */
	children?: ReactNode;
};

// ── Root-relative walk ──────────────────────────────────────────────

/**
 * Walk the DOMElement's parentNode chain, summing each ancestor's
 * yoga `getComputedLayout()` left/top to produce root-relative
 * coordinates. Combined with the node's own layout to form an
 * {@link AnchorRect} in root-relative space.
 *
 * Mirrors the parent-chain walk in ink's `renderNodeToOutput.ts`.
 */
function getRootRelativeRect(node: DOMElement): AnchorRect {
	const {yogaNode} = node;
	const layout = yogaNode?.getComputedLayout() ?? {
		left: 0,
		top: 0,
		width: 0,
		height: 0,
	};

	let offsetX = 0;
	let offsetY = 0;
	let current: DOMElement | undefined = node.parentNode;

	while (current) {
		const parentLayout = current.yogaNode?.getComputedLayout();
		if (parentLayout) {
			offsetX += parentLayout.left;
			offsetY += parentLayout.top;
		}

		current = current.parentNode;
	}

	return {
		left: offsetX + layout.left,
		top: offsetY + layout.top,
		width: layout.width,
		height: layout.height,
	};
}

/**
 * <Popover> — element-anchored layer with collision detection.
 *
 * Popover defaults to `defaultOpen={true}` (matching {@link Layer}'s
 * default) so the content is visible without an explicit `open` prop.
 * Pass `defaultOpen={false}` or `open={false}` to keep it hidden
 * until triggered.
 *
 * @param props See {@link PopoverProps}.
 */
export function Popover({
	anchorRef,
	placement = 'bottom',
	offset = 1,
	crossOffset = 0,
	flip = true,
	shift = true,
	collisionPadding = 0,
	open: controlledOpen,
	defaultOpen = true,
	onOpenChange,
	onDismiss,
	capture = false,
	backdrop = 'none',
	z = 50,
	children,
}: PopoverProps) {
	const anchorMetrics = useBoxMetrics(anchorRef);
	const {columns, rows} = useWindowSize();

	const popoverReference = useRef<DOMElement | null>(null);
	const popoverMetrics = useBoxMetrics(popoverReference);

	// Position state — starts offscreen (flash-free strategy).
	// 'bottom' is a neutral sentinel for the offscreen placeholder;
	// the real placement is resolved once both elements are measured.
	const [position, setPosition] = useState<{
		top: number;
		left: number;
		placement: Placement;
	}>({top: OFFSCREEN_SENTINEL, left: OFFSCREEN_SENTINEL, placement: 'bottom'});

	const isMeasured =
		anchorMetrics.hasMeasured &&
		popoverMetrics.hasMeasured &&
		popoverMetrics.width > 0 &&
		popoverMetrics.height > 0;

	// Compute final position once both anchor and popover are measured.
	//
	// LIMITATION: Popover repositions on anchor resize, popover content
	// resize, and terminal resize, but does NOT track ancestor/sibling
	// layout shifts (Ink exposes no public per-node layout observer).
	// If the anchor moves due to surrounding content changes, close and
	// reopen the popover, or key it on the layout-affecting state.
	useEffect(() => {
		if (!isMeasured) {
			return;
		}

		const anchorNode = anchorRef.current;
		if (!anchorNode) {
			return;
		}

		const anchorRect = getRootRelativeRect(anchorNode);
		const popoverSize = {
			width: popoverMetrics.width,
			height: popoverMetrics.height,
		};

		const viewport = {columns, rows};

		const result = computePopoverPosition(
			anchorRect,
			popoverSize,
			viewport,
			placement,
			{
				offset,
				crossOffset,
				flip,
				shift,
				collisionPadding,
			},
		);

		setPosition(previous => {
			if (
				previous.top === result.top &&
				previous.left === result.left &&
				previous.placement === result.placement
			) {
				return previous;
			}

			return result;
		});
	}, [
		isMeasured,
		anchorMetrics.left,
		anchorMetrics.top,
		anchorMetrics.width,
		anchorMetrics.height,
		popoverMetrics.width,
		popoverMetrics.height,
		columns,
		rows,
		placement,
		offset,
		crossOffset,
		flip,
		shift,
		collisionPadding,
		anchorRef,
	]);

	return (
		<Layer
			top={isMeasured ? position.top : OFFSCREEN_SENTINEL}
			left={isMeasured ? position.left : OFFSCREEN_SENTINEL}
			capture={capture}
			backdrop={backdrop}
			z={z}
			open={controlledOpen}
			defaultOpen={defaultOpen}
			onOpenChange={onOpenChange}
			onDismiss={onDismiss}
		>
			<Box ref={popoverReference}>{children}</Box>
		</Layer>
	);
}
