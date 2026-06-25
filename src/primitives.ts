import {
	type Anchor,
	type Placement,
	type Viewport,
	type Rect,
	type AnchorRect,
	type OffsetEdges,
} from './types.js';

// ---------------------------------------------------------------------------
// (a) anchorToFlexbox
// Maps an Anchor to alignItems (cross-axis=vertical) and
// justifyContent (main-axis=horizontal) for a flexDirection='row' wrapper.
// ---------------------------------------------------------------------------

const anchorFlexMap: Record<
	Anchor,
	{
		alignItems: 'flex-start' | 'center' | 'flex-end';
		justifyContent: 'flex-start' | 'center' | 'flex-end';
	}
> = {
	center: {alignItems: 'center', justifyContent: 'center'},
	top: {alignItems: 'flex-start', justifyContent: 'center'},
	bottom: {alignItems: 'flex-end', justifyContent: 'center'},
	left: {alignItems: 'center', justifyContent: 'flex-start'},
	right: {alignItems: 'center', justifyContent: 'flex-end'},
	'top-left': {alignItems: 'flex-start', justifyContent: 'flex-start'},
	'top-right': {alignItems: 'flex-start', justifyContent: 'flex-end'},
	'bottom-left': {alignItems: 'flex-end', justifyContent: 'flex-start'},
	'bottom-right': {alignItems: 'flex-end', justifyContent: 'flex-end'},
};

export function anchorToFlexbox(anchor: Anchor): {
	alignItems: 'flex-start' | 'center' | 'flex-end';
	justifyContent: 'flex-start' | 'center' | 'flex-end';
} {
	return anchorFlexMap[anchor];
}

// ---------------------------------------------------------------------------
// (b) computeAnchorCoords
// Pure coordinate math for positioning a layer of known size inside a viewport.
// ---------------------------------------------------------------------------



export function computeAnchorCoords(
	anchor: Anchor,
	viewport: Viewport,
	layerSize: Rect,
	margin?: OffsetEdges,
): {top: number; left: number} {
	const centerTop = Math.floor((viewport.rows - layerSize.height) / 2);
	const centerLeft = Math.floor((viewport.columns - layerSize.width) / 2);

	let top: number;
	let left: number;

	switch (anchor) {
		case 'center': {
			top = centerTop;
			left = centerLeft;
			break;
		}

		case 'top': {
			top = 0;
			left = centerLeft;
			break;
		}

		case 'bottom': {
			top = viewport.rows - layerSize.height;
			left = centerLeft;
			break;
		}

		case 'left': {
			top = centerTop;
			left = 0;
			break;
		}

		case 'right': {
			top = centerTop;
			left = viewport.columns - layerSize.width;
			break;
		}

		case 'top-left': {
			top = 0;
			left = 0;
			break;
		}

		case 'top-right': {
			top = 0;
			left = viewport.columns - layerSize.width;
			break;
		}

		case 'bottom-left': {
			top = viewport.rows - layerSize.height;
			left = 0;
			break;
		}

		case 'bottom-right': {
			top = viewport.rows - layerSize.height;
			left = viewport.columns - layerSize.width;
			break;
		}
	}

	// Apply margin offsets — each margin pushes the layer INWARD,
	// away from its respective viewport edge:
	//   margin.top    → push DOWN  (+top)
	//   margin.left   → push RIGHT (+left)
	//   margin.bottom → push UP    (−top)
	//   margin.right  → push LEFT  (−left)
	//
	// This works regardless of anchor: for a bottom-anchored layer
	// the base top = rows-height, so margin.bottom subtracting from
	// top moves it upward (away from the bottom edge).
	if (margin) {
		top += margin.top ?? 0;
		left += margin.left ?? 0;
		top -= margin.bottom ?? 0;
		left -= margin.right ?? 0;
	}

	return {top: Math.max(Math.floor(top), 0), left: Math.max(Math.floor(left), 0)};
}

// ---------------------------------------------------------------------------
// Helpers for computePopoverPosition
// ---------------------------------------------------------------------------

type PlacementAxis = 'top' | 'bottom' | 'left' | 'right';
type PlacementSide = 'start' | 'center' | 'end';

function parsePlacement(placement: Placement): {
	axis: PlacementAxis;
	side: PlacementSide;
} {
	const parts = placement.split('-');
	const axis = parts[0] as PlacementAxis;
	const side = (parts[1] ?? 'center') as PlacementSide;
	return {axis, side};
}

function flipAxis(axis: PlacementAxis): PlacementAxis {
	switch (axis) {
		case 'top': {
			return 'bottom';
		}

		case 'bottom': {
			return 'top';
		}

		case 'left': {
			return 'right';
		}

		case 'right': {
			return 'left';
		}
	}
}

function placementKey(axis: PlacementAxis, side: PlacementSide): Placement {
	return side === 'center' ? axis : (`${axis}-${side}` as Placement);
}

function resolveCollisionPadding(
	padding: number | Partial<OffsetEdges> | undefined,
): {top: number; right: number; bottom: number; left: number} {
	if (padding === undefined || padding === 0) {
		return {
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		};
	}

	if (typeof padding === 'number') {
		return {
			top: padding,
			right: padding,
			bottom: padding,
			left: padding,
		};
	}

	return {
		top: padding.top ?? 0,
		right: padding.right ?? 0,
		bottom: padding.bottom ?? 0,
		left: padding.left ?? 0,
	};
}

/**
 * Compute the base (pre-flip, pre-shift) popover position for a given axis
 * and side. Pure coordinate math — no viewport or collision awareness.
 */
function computeBasePosition(
	axis: PlacementAxis,
	side: PlacementSide,
	anchorRect: AnchorRect,
	popoverSize: Rect,
	offset: number,
	crossOffset: number,
): {top: number; left: number} {
	let top: number;
	let left: number;

	// Main-axis positioning.
	switch (axis) {
		case 'bottom': {
			top = anchorRect.top + anchorRect.height + offset;
			break;
		}

		case 'top': {
			top = anchorRect.top - offset - popoverSize.height;
			break;
		}

		case 'right': {
			left = anchorRect.left + anchorRect.width + offset;
			break;
		}

		case 'left': {
			left = anchorRect.left - offset - popoverSize.width;
			break;
		}
	}

	// Cross-axis positioning.
	switch (axis) {
		case 'bottom':
		case 'top': {
			// Cross axis is horizontal.
			switch (side) {
				case 'start': {
					left = anchorRect.left + crossOffset;
					break;
				}

				case 'center': {
					left =
						anchorRect.left +
						(anchorRect.width - popoverSize.width) / 2 +
						crossOffset;
					break;
				}

				case 'end': {
					left =
						anchorRect.left +
						anchorRect.width -
						popoverSize.width +
						crossOffset;
					break;
				}
			}

			break;
		}

		case 'left':
		case 'right': {
			// Cross axis is vertical.
			switch (side) {
				case 'start': {
					top = anchorRect.top + crossOffset;
					break;
				}

				case 'center': {
					top =
						anchorRect.top +
						(anchorRect.height - popoverSize.height) / 2 +
						crossOffset;
					break;
				}

				case 'end': {
					top =
						anchorRect.top +
						anchorRect.height -
						popoverSize.height +
						crossOffset;
					break;
				}
			}

			break;
		}
	}

	return {top: top!, left: left!};
}

/**
 * Determine whether a popover at `pos` overflows the viewport along its
 * main axis (the axis the placement points toward).
 */
function checkMainAxisOverflow(
	axis: PlacementAxis,
	pos: {top: number; left: number},
	popoverSize: Rect,
	viewport: Viewport,
): boolean {
	switch (axis) {
		case 'bottom': {
			return pos.top + popoverSize.height > viewport.rows;
		}

		case 'top': {
			return pos.top < 0;
		}

		case 'right': {
			return pos.left + popoverSize.width > viewport.columns;
		}

		case 'left': {
			return pos.left < 0;
		}
	}
}

// ---------------------------------------------------------------------------
// (c) computePopoverPosition
// ---------------------------------------------------------------------------

export function computePopoverPosition(
	anchorRect: AnchorRect,
	popoverSize: Rect,
	viewport: Viewport,
	placement: Placement,
	options: {
		offset?: number;
		crossOffset?: number;
		flip?: boolean;
		shift?: boolean;
		collisionPadding?: number | Partial<OffsetEdges>;
	} = {},
): {top: number; left: number; placement: Placement} {
	const offset = options.offset ?? 1;
	const crossOffset = options.crossOffset ?? 0;
	const shouldFlip = options.flip !== false;
	const shouldShift = options.shift !== false;
	const pad = resolveCollisionPadding(options.collisionPadding);

	let {axis, side} = parsePlacement(placement);

	// PHASE 1 — compute the base position for the requested placement.
	let pos = computeBasePosition(axis, side, anchorRect, popoverSize, offset, crossOffset);

	// PHASE 2 — FLIP: mirror the placement along the main axis if the
	// popover would overflow the viewport.
	if (shouldFlip && checkMainAxisOverflow(axis, pos, popoverSize, viewport)) {
		axis = flipAxis(axis);
		pos = computeBasePosition(axis, side, anchorRect, popoverSize, offset, crossOffset);
	}

	// PHASE 3 — SHIFT: clamp the popover within the viewport, respecting
	// the collision padding.
	if (shouldShift) {
		const minX = pad.left;
		const maxX = viewport.columns - popoverSize.width - pad.right;
		const minY = pad.top;
		const maxY = viewport.rows - popoverSize.height - pad.bottom;

		pos.left = Math.min(Math.max(Math.floor(pos.left), Math.floor(minX)), Math.floor(maxX));
		pos.top = Math.min(Math.max(Math.floor(pos.top), Math.floor(minY)), Math.floor(maxY));
	}

	return {
		top: shouldShift ? pos.top : Math.floor(pos.top),
		left: shouldShift ? pos.left : Math.floor(pos.left),
		placement: placementKey(axis, side),
	};
}

// ---------------------------------------------------------------------------
// (d) compareLayers
// Sort ascending by z; ties broken by order ascending.
// Returns negative if a before b, positive if a after b, 0 if equal.
// ---------------------------------------------------------------------------

export function compareLayers(
	a: {z: number; order: number},
	b: {z: number; order: number},
): number {
	if (a.z !== b.z) {
		return a.z - b.z;
	}

	return a.order - b.order;
}

// ---------------------------------------------------------------------------
// (e) sortLayers
// Returns a NEW sorted array (does not mutate input).
// ---------------------------------------------------------------------------

export function sortLayers<T extends {z: number; order: number}>(
	layers: T[],
): T[] {
	return [...layers].sort(compareLayers);
}
