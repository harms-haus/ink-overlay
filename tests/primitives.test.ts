import {describe, test, expect} from 'vitest';
import {
	anchorToFlexbox,
	computeAnchorCoords,
	computePopoverPosition,
	compareLayers,
	sortLayers,
} from '../src/primitives.js';

// ---------------------------------------------------------------------------
// (a) anchorToFlexbox
// ---------------------------------------------------------------------------
describe('anchorToFlexbox', () => {
	const cases: Array<{
		anchor: Parameters<typeof anchorToFlexbox>[0];
		alignItems: string;
		justifyContent: string;
	}> = [
		{anchor: 'center', alignItems: 'center', justifyContent: 'center'},
		{anchor: 'top', alignItems: 'flex-start', justifyContent: 'center'},
		{anchor: 'bottom', alignItems: 'flex-end', justifyContent: 'center'},
		{anchor: 'left', alignItems: 'center', justifyContent: 'flex-start'},
		{anchor: 'right', alignItems: 'center', justifyContent: 'flex-end'},
		{
			anchor: 'top-left',
			alignItems: 'flex-start',
			justifyContent: 'flex-start',
		},
		{anchor: 'top-right', alignItems: 'flex-start', justifyContent: 'flex-end'},
		{
			anchor: 'bottom-left',
			alignItems: 'flex-end',
			justifyContent: 'flex-start',
		},
		{
			anchor: 'bottom-right',
			alignItems: 'flex-end',
			justifyContent: 'flex-end',
		},
	];

	for (const {anchor, alignItems, justifyContent} of cases) {
		test(`anchor '${anchor}' → alignItems=${alignItems}, justifyContent=${justifyContent}`, () => {
			expect(anchorToFlexbox(anchor)).toEqual({alignItems, justifyContent});
		});
	}
});

// ---------------------------------------------------------------------------
// (b) computeAnchorCoords
// ---------------------------------------------------------------------------
describe('computeAnchorCoords', () => {
	const viewport = {columns: 80, rows: 24};
	const layer = {width: 20, height: 6};

	test('center: top=floor((rows-height)/2), left=floor((columns-width)/2)', () => {
		// Top=floor((24-6)/2)=9, left=floor((80-20)/2)=30
		expect(computeAnchorCoords('center', viewport, layer)).toEqual({
			top: 9,
			left: 30,
		});
	});

	test('top: top=0, left=centered', () => {
		// Top=0, left=floor((80-20)/2)=30
		expect(computeAnchorCoords('top', viewport, layer)).toEqual({
			top: 0,
			left: 30,
		});
	});

	test('bottom: top=rows-height, left=centered', () => {
		// Top=24-6=18, left=30
		expect(computeAnchorCoords('bottom', viewport, layer)).toEqual({
			top: 18,
			left: 30,
		});
	});

	test('left: left=0, top=centered', () => {
		// Left=0, top=9
		expect(computeAnchorCoords('left', viewport, layer)).toEqual({
			top: 9,
			left: 0,
		});
	});

	test('right: left=columns-width, top=centered', () => {
		// Left=80-20=60, top=9
		expect(computeAnchorCoords('right', viewport, layer)).toEqual({
			top: 9,
			left: 60,
		});
	});

	test('top-left: top=0, left=0', () => {
		expect(computeAnchorCoords('top-left', viewport, layer)).toEqual({
			top: 0,
			left: 0,
		});
	});

	test('top-right: top=0, left=columns-width', () => {
		expect(computeAnchorCoords('top-right', viewport, layer)).toEqual({
			top: 0,
			left: 60,
		});
	});

	test('bottom-left: top=rows-height, left=0', () => {
		expect(computeAnchorCoords('bottom-left', viewport, layer)).toEqual({
			top: 18,
			left: 0,
		});
	});

	test('bottom-right: top=rows-height, left=columns-width', () => {
		expect(computeAnchorCoords('bottom-right', viewport, layer)).toEqual({
			top: 18,
			left: 60,
		});
	});

	test('margin offsets are applied and clamped to >= 0', () => {
		const result = computeAnchorCoords('top-left', viewport, layer, {
			top: 2,
			left: 3,
		});
		expect(result).toEqual({top: 2, left: 3});
	});

	test('margin cannot produce negative values (clamped to 0)', () => {
		const result = computeAnchorCoords('center', viewport, layer, {
			top: -50,
			left: -50,
		});
		expect(result.top).toBeGreaterThanOrEqual(0);
		expect(result.left).toBeGreaterThanOrEqual(0);
	});

	test('bottom-anchored layer with margin.bottom moves UP (away from bottom edge)', () => {
		// Base top = rows - height = 24 - 6 = 18
		// margin.bottom = 2 → top = 18 - 2 = 16
		const result = computeAnchorCoords('bottom', viewport, layer, {bottom: 2});
		expect(result).toEqual({top: 16, left: 30});
	});

	test('right-anchored layer with margin.right moves LEFT (away from right edge)', () => {
		// Base left = columns - width = 80 - 20 = 60
		// margin.right = 2 → left = 60 - 2 = 58
		const result = computeAnchorCoords('right', viewport, layer, {right: 2});
		expect(result).toEqual({top: 9, left: 58});
	});

	test('all four margins push layer inward from edges', () => {
		// Top-left anchor: top=0, left=0
		// +margin.top=1, +margin.left=2, -margin.bottom=3, -margin.right=4
		// top = 0 + 1 - 3 = -2 → clamped to 0
		// left = 0 + 2 - 4 = -2 → clamped to 0
		const result = computeAnchorCoords('top-left', viewport, layer, {
			top: 1,
			left: 2,
			bottom: 3,
			right: 4,
		});
		expect(result.top).toBeGreaterThanOrEqual(0);
		expect(result.left).toBeGreaterThanOrEqual(0);
	});

	test('top-anchored layer with margin.top pushes it DOWN', () => {
		// Base top = 0, margin.top = 3 → top = 3
		const result = computeAnchorCoords('top', viewport, layer, {top: 3});
		expect(result).toEqual({top: 3, left: 30});
	});
});

// ---------------------------------------------------------------------------
// (c) computePopoverPosition
// ---------------------------------------------------------------------------
describe('computePopoverPosition', () => {
	const viewport = {columns: 80, rows: 24};
	const popover = {width: 20, height: 5};

	test("placement 'bottom': popover appears below the anchor", () => {
		const anchorRect = {
			left: 30,
			top: 5,
			width: 10,
			height: 2,
		};
		// Bottom with default offset=4, variant center
		// top = anchorRect.top + anchorRect.height + offset = 5+2+4 = 11
		// left = anchorRect.left + (anchorRect.width - popoverSize.width)/2 = 30 + (10-20)/2 = 30-5 = 25
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom',
		);
		expect(result.top).toBe(11);
		expect(result.left).toBe(25);
		expect(result.placement).toBe('bottom');
	});

	test("placement 'bottom-start': left aligned to anchor left", () => {
		const anchorRect = {
			left: 30,
			top: 5,
			width: 10,
			height: 2,
		};
		// Top = 5+2+4 = 11, left = 30 + 0 = 30
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom-start',
		);
		expect(result.top).toBe(11);
		expect(result.left).toBe(30);
		expect(result.placement).toBe('bottom-start');
	});

	test("placement 'bottom-end': left aligned to anchor right edge minus popover width", () => {
		const anchorRect = {
			left: 30,
			top: 5,
			width: 10,
			height: 2,
		};
		// Top = 5+2+4 = 11, left = 30 + 10 - 20 = 20
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom-end',
		);
		expect(result.top).toBe(11);
		expect(result.left).toBe(20);
		expect(result.placement).toBe('bottom-end');
	});

	test("placement 'top': popover appears above the anchor", () => {
		const anchorRect = {
			left: 30,
			top: 15,
			width: 10,
			height: 2,
		};
		// Top = 15 - 4 - 5 = 6, left = 30 + (10-20)/2 = 25
		const result = computePopoverPosition(anchorRect, popover, viewport, 'top');
		expect(result.top).toBe(6);
		expect(result.left).toBe(25);
		expect(result.placement).toBe('top');
	});

	test("placement 'right': popover appears to the right of the anchor", () => {
		const anchorRect = {
			left: 10,
			top: 10,
			width: 5,
			height: 2,
		};
		// Right: left = anchorRect.left + anchorRect.width + offset = 10+5+4 = 19
		// top (center variant) = anchorRect.top + (anchorRect.height - popoverSize.height)/2 = 10 + (2-5)/2 = 8.5, floor → 8
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'right',
		);
		expect(result.left).toBe(19);
		expect(result.top).toBe(8);
		expect(result.placement).toBe('right');
	});

	test("placement 'left': popover appears to the left of the anchor", () => {
		const anchorRect = {
			left: 40,
			top: 10,
			width: 5,
			height: 2,
		};
		// Left: left = 40 - 4 - 20 = 16
		// top (center) = 10 + (2-5)/2 = 8.5, floor → 8
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'left',
		);
		expect(result.left).toBe(16);
		expect(result.top).toBe(8);
		expect(result.placement).toBe('left');
	});

	test('custom offset is used', () => {
		const anchorRect = {
			left: 30,
			top: 5,
			width: 10,
			height: 2,
		};
		// Bottom with offset=8: top = 5+2+8 = 15
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom',
			{offset: 8},
		);
		expect(result.top).toBe(15);
	});

	test('crossOffset shifts position on the cross axis', () => {
		const anchorRect = {
			left: 30,
			top: 5,
			width: 10,
			height: 2,
		};
		// Bottom-start with crossOffset=5: left = 30+5 = 35
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom-start',
			{
				crossOffset: 5,
			},
		);
		expect(result.left).toBe(35);
	});

	test('flip: near-bottom anchor flips to top', () => {
		// Place anchor near the bottom of viewport so popover overflows
		const anchorRect = {
			left: 30,
			top: 20,
			width: 10,
			height: 2,
		};
		// Bottom: top = 20+2+4 = 26 — exceeds viewport rows=24
		// flip → placement 'top': top = 20 - 4 - 5 = 11, left = 30 + (10-20)/2 = 25
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom',
		);
		expect(result.placement).toBe('top');
		expect(result.top).toBe(11);
		expect(result.left).toBe(25);
	});

	test('flip: near-top anchor with placement top flips to bottom', () => {
		const anchorRect = {
			left: 30,
			top: 0,
			width: 10,
			height: 2,
		};
		// Top: top = 0 - 4 - 5 = -9 — overflows
		// flip → bottom: top = 0+2+4 = 6, left = 25
		const result = computePopoverPosition(anchorRect, popover, viewport, 'top');
		expect(result.placement).toBe('bottom');
		expect(result.top).toBe(6);
	});

	test('flip disabled: position can overflow viewport', () => {
		const anchorRect = {
			left: 30,
			top: 0,
			width: 10,
			height: 2,
		};
		// Top: top = -9, no flip, no shift
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'top',
			{
				flip: false,
				shift: false,
			},
		);
		expect(result.placement).toBe('top');
		expect(result.top).toBe(-9);
	});

	test('flip: near-right anchor with right placement flips to left', () => {
		const anchorRect = {
			left: 65,
			top: 10,
			width: 5,
			height: 2,
		};
		// Right: left = 65+5+4 = 74; popover width=20 → right edge=94 > 80 → flip to left
		// left: left = 65 - 4 - 20 = 41, top = 10 + (2-5)/2 = 9
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'right',
		);
		expect(result.placement).toBe('left');
		expect(result.left).toBe(41);
	});

	test('shift: clamp right overflow', () => {
		const anchorRect = {
			left: 65,
			top: 10,
			width: 5,
			height: 2,
		};
		// Right-start: left = 65+5+4 = 74, popover width=20, right edge=94 > 80
		// flip → left-start: left = 65-4-20 = 41 (fits fine, no shift needed)
		// Use bottom-end to force a shift case instead:
		const anchorRect2 = {
			left: 0,
			top: 20,
			width: 10,
			height: 2,
		};
		// Bottom-end: top = 20+2+4 = 26, left = 0+10-20 = -10
		// flip → top-end: top = 20-4-5 = 11, left = 0+10-20 = -10
		// shift: clamp left to >= 0 → left = 0
		const result = computePopoverPosition(
			anchorRect2,
			popover,
			viewport,
			'bottom-end',
			{
				shift: true,
			},
		);
		expect(result.placement).toBe('top-end');
		expect(result.top).toBe(11);
		expect(result.left).toBe(0);
	});

	test('shift: clamp top overflow', () => {
		// Place a popover on bottom at the very edge, flip disabled:
		const anchorRect = {
			left: 30,
			top: 22,
			width: 10,
			height: 1,
		};
		// Bottom: top = 22+1+4 = 27, but shift clamps: top in [0, rows-height] = [0, 19]
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'bottom',
			{
				flip: false,
				shift: true,
				collisionPadding: 0,
			},
		);
		expect(result.top).toBe(19);
	});

	test('collisionPadding as object is respected during shift', () => {
		const anchorRect = {
			left: 65,
			top: 10,
			width: 5,
			height: 2,
		};
		// Right: left = 65+5+4 = 74 → popover right=94 > 80 → flip to left
		// left: left = 65-4-20 = 41, left fits
		// To force shift: use right placement, disable flip, allow shift
		const result = computePopoverPosition(
			anchorRect,
			popover,
			viewport,
			'right',
			{
				flip: false,
				shift: true,
				collisionPadding: {right: 5, left: 5},
			},
		);
		// Right: left=74, right edge = 74+20 = 94, max left = 80 - 20 - 5 = 55
		expect(result.left).toBe(55);
	});

	test('final position values are clamped to >= 0', () => {
		const anchorRect = {
			left: 0,
			top: 0,
			width: 5,
			height: 2,
		};
		// Top: top = 0-4-5 = -9 → flip → bottom: top = 0+2+4 = 6 (fine)
		const result = computePopoverPosition(anchorRect, popover, viewport, 'top');
		expect(result.top).toBeGreaterThanOrEqual(0);
		expect(result.left).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// (d) compareLayers
// ---------------------------------------------------------------------------
describe('compareLayers', () => {
	test('lower z sorts first', () => {
		expect(compareLayers({z: 1, order: 0}, {z: 2, order: 0})).toBeLessThan(0);
	});

	test('higher z sorts last', () => {
		expect(compareLayers({z: 5, order: 0}, {z: 2, order: 0})).toBeGreaterThan(
			0,
		);
	});

	test('equal z: lower order sorts first', () => {
		expect(compareLayers({z: 3, order: 1}, {z: 3, order: 2})).toBeLessThan(0);
	});

	test('equal z: higher order sorts last', () => {
		expect(compareLayers({z: 3, order: 5}, {z: 3, order: 2})).toBeGreaterThan(
			0,
		);
	});

	test('equal z and equal order returns 0', () => {
		expect(compareLayers({z: 3, order: 1}, {z: 3, order: 1})).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// (e) sortLayers
// ---------------------------------------------------------------------------
describe('sortLayers', () => {
	test('sorts ascending by z, ties broken by order', () => {
		const layers = [
			{z: 5, order: 1},
			{z: 1, order: 2},
			{z: 3, order: 3},
		];
		const sorted = sortLayers(layers);
		expect(sorted).toEqual([
			{z: 1, order: 2},
			{z: 3, order: 3},
			{z: 5, order: 1},
		]);
	});

	test('sorts by order when z values are equal', () => {
		const layers = [
			{z: 2, order: 3},
			{z: 2, order: 1},
			{z: 2, order: 2},
		];
		const sorted = sortLayers(layers);
		expect(sorted).toEqual([
			{z: 2, order: 1},
			{z: 2, order: 2},
			{z: 2, order: 3},
		]);
	});

	test('does not mutate the input array', () => {
		const layers = [
			{z: 5, order: 1},
			{z: 1, order: 2},
			{z: 3, order: 3},
		];
		const original = [...layers];
		sortLayers(layers);
		expect(layers).toEqual(original);
	});

	test('returns a new array (not the same reference)', () => {
		const layers = [{z: 1, order: 1}];
		const sorted = sortLayers(layers);
		expect(sorted).not.toBe(layers);
	});

	test('handles an empty array', () => {
		expect(sortLayers([])).toEqual([]);
	});

	test('handles a single element', () => {
		expect(sortLayers([{z: 1, order: 1}])).toEqual([{z: 1, order: 1}]);
	});
});
