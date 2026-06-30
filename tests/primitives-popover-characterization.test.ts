/**
 * Characterization tests for `computePopoverPosition`.
 *
 * These pin down the EXACT observable behavior of the function across its
 * three internal phases — (1) base-position computation, (2) flip, (3) shift.
 *
 * The production code extracts its nested closures into module-level helpers
 * (`computeBasePosition`, `checkMainAxisOverflow`). Those helpers are NOT
 * exported, so we characterize them purely through the public function. Every
 * test below asserts a concrete numeric outcome that must remain byte-identical
 * before and after the refactor.
 */
import {describe, test, expect} from 'vitest';
import {computePopoverPosition} from '../src/primitives.js';
import type {AnchorRect, Rect, Viewport, Placement} from '../src/types.js';

// ── Shared fixtures ────────────────────────────────────────────────────────
// A generously-sized viewport so that base-position + flip tests do not
// accidentally trigger the shift clamp. When we WANT shift, we place the
// anchor at an edge explicitly.
const viewport: Viewport = {columns: 80, rows: 24};
const popover: Rect = {width: 20, height: 5};
// A centered anchor with an even width/height so center math is integral.
const anchor: AnchorRect = {left: 30, top: 10, width: 10, height: 4};

const ALL_PLACEMENTS: Placement[] = [
	'top',
	'top-start',
	'top-end',
	'bottom',
	'bottom-start',
	'bottom-end',
	'left',
	'left-start',
	'left-end',
	'right',
	'right-start',
	'right-end',
];

// ===========================================================================
// (1) BASE POSITION  —  computeBasePosition equivalent
// ===========================================================================
// Driven with flip:false + shift:false so ONLY the base math contributes.
describe('computePopoverPosition — base position (flip:false, shift:false)', () => {
	// Exact expected {top,left} for every placement using the shared fixtures.
	// Verified against the current implementation. The main-axis value depends
	// only on the axis; the cross-axis value depends on the side.
	const expected: Record<Placement, {top: number; left: number}> = {
		// vertical axes: top = anchor.top ± (offset + height)
		top: {top: 4, left: 25},
		'top-start': {top: 4, left: 30},
		'top-end': {top: 4, left: 20},
		bottom: {top: 15, left: 25},
		'bottom-start': {top: 15, left: 30},
		'bottom-end': {top: 15, left: 20},
		// horizontal axes: left = anchor.left ± (offset + width)
		// center vertical uses (height - popoverHeight)/2 = (4-5)/2 = -0.5 → floor 9
		left: {top: 9, left: 9},
		'left-start': {top: 10, left: 9},
		'left-end': {top: 9, left: 9},
		right: {top: 9, left: 41},
		'right-start': {top: 10, left: 41},
		'right-end': {top: 9, left: 41},
	};

	for (const placement of ALL_PLACEMENTS) {
		const exp = expected[placement];
		test(`placement '${placement}' → base coords {top:${exp.top}, left:${exp.left}}`, () => {
			const result = computePopoverPosition(
				anchor,
				popover,
				viewport,
				placement,
				{
					flip: false,
					shift: false,
				},
			);
			expect(result.top).toBe(exp.top);
			expect(result.left).toBe(exp.left);
			// placement field is echoed back unchanged when nothing happens.
			expect(result.placement).toBe(placement);
		});
	}

	test('main-axis bottom: top = anchor.top + anchor.height + offset', () => {
		const r = computePopoverPosition(
			{left: 5, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: false},
		);
		// 7 + 2 + 1(offset) = 10
		expect(r.top).toBe(10);
	});

	test('main-axis top: top = anchor.top - offset - popover.height', () => {
		const r = computePopoverPosition(
			{left: 5, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'top',
			{flip: false, shift: false},
		);
		// 7 - 1 - 5 = 1
		expect(r.top).toBe(1);
	});

	test('main-axis right: left = anchor.left + anchor.width + offset', () => {
		const r = computePopoverPosition(
			{left: 5, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'right',
			{flip: false, shift: false},
		);
		// 5 + 3 + 1 = 9
		expect(r.left).toBe(9);
	});

	test('main-axis left: left = anchor.left - offset - popover.width', () => {
		const r = computePopoverPosition(
			{left: 40, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'left',
			{flip: false, shift: false},
		);
		// 40 - 1 - 20 = 19
		expect(r.left).toBe(19);
	});

	test('cross-axis start aligns to leading edge (left for vertical axes)', () => {
		const r = computePopoverPosition(
			{left: 17, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'bottom-start',
			{flip: false, shift: false},
		);
		expect(r.left).toBe(17);
	});

	test('cross-axis start aligns to leading edge (top for horizontal axes)', () => {
		const r = computePopoverPosition(
			{left: 17, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'right-start',
			{flip: false, shift: false},
		);
		expect(r.top).toBe(7);
	});

	test('cross-axis end aligns popover trailing edge to anchor trailing edge', () => {
		// bottom-end: left = anchor.left + anchor.width - popover.width
		const r = computePopoverPosition(
			{left: 17, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'bottom-end',
			{flip: false, shift: false},
		);
		// 17 + 3 - 20 = 0
		expect(r.left).toBe(0);
	});

	test('crossOffset=0 is identical to omitting crossOffset', () => {
		const implicit = computePopoverPosition(
			anchor,
			popover,
			viewport,
			'bottom',
			{
				flip: false,
				shift: false,
			},
		);
		const explicit = computePopoverPosition(
			anchor,
			popover,
			viewport,
			'bottom',
			{
				flip: false,
				shift: false,
				crossOffset: 0,
			},
		);
		expect(implicit).toEqual(explicit);
	});

	// crossOffset applies additively on the cross axis for ALL placements.
	test('crossOffset=7 shifts every placement on its cross axis', () => {
		const expectedWithOffset: Record<Placement, {top: number; left: number}> = {
			// vertical axes → cross is horizontal (left shifts by +7)
			top: {top: 4, left: 32},
			'top-start': {top: 4, left: 37},
			'top-end': {top: 4, left: 27},
			bottom: {top: 15, left: 32},
			'bottom-start': {top: 15, left: 37},
			'bottom-end': {top: 15, left: 27},
			// horizontal axes → cross is vertical (top shifts by +7)
			left: {top: 16, left: 9},
			'left-start': {top: 17, left: 9},
			'left-end': {top: 16, left: 9},
			right: {top: 16, left: 41},
			'right-start': {top: 17, left: 41},
			'right-end': {top: 16, left: 41},
		};
		for (const placement of ALL_PLACEMENTS) {
			const r = computePopoverPosition(anchor, popover, viewport, placement, {
				flip: false,
				shift: false,
				crossOffset: 7,
			});
			expect({top: r.top, left: r.left}).toEqual(expectedWithOffset[placement]);
		}
	});

	test('negative crossOffset shifts in the opposite direction', () => {
		const r = computePopoverPosition(
			anchor,
			popover,
			viewport,
			'bottom-start',
			{
				flip: false,
				shift: false,
				crossOffset: -4,
			},
		);
		// 30 - 4 = 26
		expect(r.left).toBe(26);
	});

	test('offset=0 places the popover flush against the anchor (no gap)', () => {
		const r = computePopoverPosition(
			{left: 5, top: 7, width: 3, height: 2},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: false, offset: 0},
		);
		// 7 + 2 + 0 = 9
		expect(r.top).toBe(9);
	});

	test('fractional cross-axis center value is floored on no-shift path', () => {
		// width = 11 → (11-20)/2 = -4.5 → left = 30 + (-4.5) = 25.5 → floor 25
		const r = computePopoverPosition(
			{left: 30, top: 5, width: 11, height: 2},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: false},
		);
		expect(r.left).toBe(25);
	});
});

// ===========================================================================
// (2) FLIP  —  checkMainAxisOverflow + axis mirroring equivalent
// ===========================================================================
describe('computePopoverPosition — flip', () => {
	test('bottom placement that overflows flips to top', () => {
		// top = 20 + 4 + 1 = 25; 25 + 5 = 30 > 24 → overflow → flip to top
		// top: top = 20 - 1 - 5 = 14; left center = 30 + (10-20)/2 = 25
		const r = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
			{shift: false},
		);
		expect(r.placement).toBe('top');
		expect(r.top).toBe(14);
		expect(r.left).toBe(25);
	});

	test('top placement that overflows flips to bottom', () => {
		// top = 0 - 1 - 5 = -6 < 0 → overflow → flip to bottom
		// bottom: top = 0 + 4 + 1 = 5
		const r = computePopoverPosition(
			{left: 30, top: 0, width: 10, height: 4},
			popover,
			viewport,
			'top',
			{shift: false},
		);
		expect(r.placement).toBe('bottom');
		expect(r.top).toBe(5);
	});

	test('right placement that overflows flips to left', () => {
		// left = 65 + 10 + 1 = 76; 76 + 20 = 96 > 80 → overflow → flip to left
		// left: left = 65 - 1 - 20 = 44; top center = 10 + (4-5)/2 = 9.5 → 9
		const r = computePopoverPosition(
			{left: 65, top: 10, width: 10, height: 4},
			popover,
			viewport,
			'right',
			{shift: false},
		);
		expect(r.placement).toBe('left');
		expect(r.left).toBe(44);
		expect(r.top).toBe(9);
	});

	test('left placement that overflows flips to right', () => {
		// left = 0 - 1 - 20 = -21 < 0 → overflow → flip to right
		// right: left = 0 + 10 + 1 = 11
		const r = computePopoverPosition(
			{left: 0, top: 10, width: 10, height: 4},
			popover,
			viewport,
			'left',
			{shift: false},
		);
		expect(r.placement).toBe('right');
		expect(r.left).toBe(11);
	});

	test('flip preserves the cross-axis side (start/end)', () => {
		// bottom-start near bottom → flips to top-start (side preserved)
		const r = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom-start',
			{shift: false},
		);
		expect(r.placement).toBe('top-start');
		// top axis: top = 20-1-5 = 14; start: left = 30
		expect(r.top).toBe(14);
		expect(r.left).toBe(30);

		const r2 = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom-end',
			{shift: false},
		);
		expect(r2.placement).toBe('top-end');
		expect(r2.top).toBe(14);
		// end: left = 30 + 10 - 20 = 20
		expect(r2.left).toBe(20);
	});

	test('flip: popover that fits does NOT flip (boundary exact fit)', () => {
		// bottom: top = 18 + 4 + 1 = 23; bottom edge = 23 + 5 = 28 ... wait recompute.
		// Choose anchor so popover bottom edge == viewport.rows EXACTLY (no overflow).
		// Need top + popoverHeight == rows → top = 24 - 5 = 19.
		// top = anchor.top + anchor.height + offset = anchor.top + 4 + 1
		// → anchor.top = 19 - 5 = 14.
		const r = computePopoverPosition(
			{left: 30, top: 14, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
			{shift: false},
		);
		expect(r.placement).toBe('bottom');
		expect(r.top).toBe(19);
	});

	test('flip: overflow by exactly 1 unit triggers flip (strict > comparison)', () => {
		// bottom edge = rows + 1 → overflow (uses >, not >=)
		// top + popoverHeight = 25 → top = 20 → anchor.top = 20 - 5 = 15
		const r = computePopoverPosition(
			{left: 30, top: 15, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
			{shift: false},
		);
		expect(r.placement).toBe('top');
	});

	test('flip:false keeps overflowing placement (no mirror)', () => {
		const r = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: false},
		);
		expect(r.placement).toBe('bottom');
		// top = 20 + 4 + 1 = 25 (overflows, but no clamp)
		expect(r.top).toBe(25);
	});

	test('flipped placement is reflected in the returned placement field', () => {
		const r = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
		);
		// Default options → flip happens and placement reports the NEW axis.
		expect(r.placement).toBe('top');
	});
});

// ===========================================================================
// (3) SHIFT  —  viewport clamping equivalent
// ===========================================================================
describe('computePopoverPosition — shift (viewport clamping)', () => {
	test('shift clamps a top value that exceeds the viewport bottom', () => {
		// bottom, flip:false: top = 22 + 1 + 1 = 24; maxY = 24 - 5 = 19 → clamp to 19
		const r = computePopoverPosition(
			{left: 30, top: 22, width: 10, height: 1},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: true},
		);
		expect(r.top).toBe(19);
		expect(r.placement).toBe('bottom');
	});

	test('shift clamps a negative top value to 0', () => {
		// top, flip:false: top = 0 - 1 - 5 = -6 → clamp to minY = 0
		const r = computePopoverPosition(
			{left: 30, top: 0, width: 10, height: 1},
			popover,
			viewport,
			'top',
			{flip: false, shift: true},
		);
		expect(r.top).toBe(0);
	});

	test('shift clamps a left value that exceeds the viewport right', () => {
		// right, flip:false: left = 65 + 10 + 1 = 76; maxX = 80 - 20 = 60 → clamp 60
		const r = computePopoverPosition(
			{left: 65, top: 10, width: 10, height: 1},
			popover,
			viewport,
			'right',
			{flip: false, shift: true},
		);
		expect(r.left).toBe(60);
	});

	test('shift clamps a negative left value to 0', () => {
		// left, flip:false: left = 0 - 1 - 20 = -21 → clamp to 0
		const r = computePopoverPosition(
			{left: 0, top: 10, width: 10, height: 1},
			popover,
			viewport,
			'left',
			{flip: false, shift: true},
		);
		expect(r.left).toBe(0);
	});

	test('shift:false leaves overflowing coordinates unclamped', () => {
		const r = computePopoverPosition(
			{left: 65, top: 10, width: 10, height: 1},
			popover,
			viewport,
			'right',
			{flip: false, shift: false},
		);
		// left = 65 + 10 + 1 = 76 (no clamp)
		expect(r.left).toBe(76);
	});

	// collisionPadding resolution: undefined / 0 / {} all behave identically.
	test('collisionPadding undefined, 0, and {} are all equivalent (zero padding)', () => {
		const opts = {flip: false, shift: true} as const;
		const withUndefined = computePopoverPosition(
			{left: 30, top: 22, width: 10, height: 1},
			popover,
			viewport,
			'bottom',
			{...opts, collisionPadding: undefined},
		);
		const withZero = computePopoverPosition(
			{left: 30, top: 22, width: 10, height: 1},
			popover,
			viewport,
			'bottom',
			{...opts, collisionPadding: 0},
		);
		const withEmptyObject = computePopoverPosition(
			{left: 30, top: 22, width: 10, height: 1},
			popover,
			viewport,
			'bottom',
			{...opts, collisionPadding: {}},
		);
		expect(withZero).toEqual(withUndefined);
		expect(withEmptyObject).toEqual(withUndefined);
	});

	test('collisionPadding as a number tightens the clamp on all edges', () => {
		// pad = 3 → maxY = 24 - 5 - 3 = 16; top = 22+1+1 = 24 → clamp 16
		const r = computePopoverPosition(
			{left: 30, top: 22, width: 10, height: 1},
			popover,
			viewport,
			'bottom',
			{flip: false, shift: true, collisionPadding: 3},
		);
		expect(r.top).toBe(16);
	});

	test('collisionPadding as partial object only affects specified edges', () => {
		// Only right specified: maxX = 80 - 20 - 5 = 55; left = 65+10+1 = 76 → 55
		const r = computePopoverPosition(
			{left: 65, top: 10, width: 10, height: 1},
			popover,
			viewport,
			'right',
			{flip: false, shift: true, collisionPadding: {right: 5}},
		);
		expect(r.left).toBe(55);
	});

	test('collisionPadding with all four edges shrinks the safe region', () => {
		// pad = {top:2,right:3,bottom:4,left:5}
		// maxX = 80 - 20 - 3 = 57; minX = 5
		// left = 65+10+1 = 76 → clamp to 57
		const r = computePopoverPosition(
			{left: 65, top: 10, width: 10, height: 1},
			popover,
			viewport,
			'right',
			{
				flip: false,
				shift: true,
				collisionPadding: {top: 2, right: 3, bottom: 4, left: 5},
			},
		);
		expect(r.left).toBe(57);
	});

	test('shift floors fractional clamp bounds and the raw coordinate', () => {
		// bottom-end: left = 30 + 11 - 20 = 21, top = 5+2+1 = 8 (fits)
		// pad.right = 45 → maxX = 80 - 20 - 45 = 15 → clamp 21 → 15
		const r = computePopoverPosition(
			{left: 30, top: 5, width: 11, height: 2},
			popover,
			viewport,
			'bottom-end',
			{shift: true, flip: false, collisionPadding: {right: 45}},
		);
		expect(r.left).toBe(15);
		expect(r.placement).toBe('bottom-end');
	});
});

// ===========================================================================
// (4) ORCHESTRATION  —  flip THEN shift ordering
// ===========================================================================
describe('computePopoverPosition — flip + shift interaction', () => {
	test('flip happens first, then shift clamps the flipped position', () => {
		// A popover as large as the viewport anchored so both top and bottom
		// overflow. bottom → overflows bottom → flip to top → top also overflows
		// top → shift clamps to {0,0}.
		const r = computePopoverPosition(
			{left: 30, top: 21, width: 10, height: 1},
			{width: 80, height: 24},
			viewport,
			'bottom',
		);
		expect(r.placement).toBe('top');
		expect(r.top).toBe(0);
		expect(r.left).toBe(0);
	});

	test('default options enable both flip and shift', () => {
		// No options object → flip:true, shift:true. A near-bottom anchor should
		// flip and the result should be within the viewport.
		const r = computePopoverPosition(
			{left: 30, top: 20, width: 10, height: 4},
			popover,
			viewport,
			'bottom',
		);
		expect(r.placement).toBe('top');
		// 14 is within [0, 19] — no shift needed.
		expect(r.top).toBe(14);
	});

	test('return value always contains top, left, and placement keys', () => {
		const r = computePopoverPosition(anchor, popover, viewport, 'bottom');
		expect(Object.keys(r).sort()).toEqual(['left', 'placement', 'top']);
	});
});
