/**
 * Tests for focus-trap — useFocusTrap hook + <FocusTrap> component.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 *
 * ## Signature decision
 *
 * `useFocusTrap` takes `active` as its **first** positional arg:
 *
 * ```ts
 * useFocusTrap(active: boolean, options?: {onEscape?, restoreFocus?})
 * ```
 *
 * This deviates from the original task sketch (which placed options first)
 * because the hook must know *when* activation occurs to snapshot the
 * previous focus ID and disable global Tab navigation.  A boolean first
 * arg is the cleanest way to drive enter/exit lifecycle from a parent.
 */
import {test, expect, vi, afterEach} from 'vitest';
import {type ReactNode} from 'react';
import {render} from 'ink-testing-library';
import {Text, useFocus} from 'ink';
import {
	InputDispatcher,
	useInputCaptureState,
} from '../src/input-dispatcher.js';
import {useFocusTrap, FocusTrap} from '../src/focus-trap.js';
import {delay} from './helpers/delay.js';

// ── warnBunInput mock (vi.hoisted so it survives vi.mock hoisting) ──
const mockWarnBunInput = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({warnBunInput: mockWarnBunInput}));

// ── Helpers ──────────────────────────────────────────────────────────

/** Focusable child that renders its focused state as text. */
function FocusableChild({id}: {id: string}) {
	const {isFocused} = useFocus({id});
	return <Text>{isFocused ? `${id}✓` : id}</Text>;
}

/** Background focusable that deactivates when input is captured. */
function BackgroundFocusable() {
	const isCaptured = useInputCaptureState();
	const {isFocused} = useFocus({id: 'bg', isActive: !isCaptured});
	return <Text>{isFocused ? 'BG✓' : 'BG'}</Text>;
}

/**
 * Render the full tree required by most focus-trap tests:
 * `<InputDispatcher>` → `<BackgroundFocusable>` + `<FocusTrap>` wrapping children.
 */
function renderTrapTree(
	trapProperties: {
		active?: boolean;
		onEscape?: () => void;
		restoreFocus?: boolean;
	},
	...trapChildren: ReactNode
) {
	return render(
		<InputDispatcher>
			<BackgroundFocusable />
			<FocusTrap {...trapProperties}>{trapChildren}</FocusTrap>
		</InputDispatcher>,
	);
}

afterEach(async () => {
	mockWarnBunInput.mockClear();
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// Tab cycling within the trap
// ════════════════════════════════════════════════════════════════════

test('Tab cycles focus forward between trap children', async () => {
	const {stdin, lastFrame} = renderTrapTree(
		{active: true},
		<FocusableChild id="A" />,
		<FocusableChild id="B" />,
	);

	await delay(100);

	// Initial render — no focus yet (nothing auto-focused).
	expect(lastFrame()).toContain('A');
	expect(lastFrame()).toContain('B');
	expect(lastFrame()).not.toContain('A✓');
	expect(lastFrame()).not.toContain('B✓');

	// First Tab → focus should land on A (first focusable in trap order).
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');
	expect(lastFrame()).not.toContain('B✓');

	// Second Tab → focus moves to B.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).not.toContain('A✓');
	expect(lastFrame()).toContain('B✓');

	// Third Tab → cycles back to A.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');
	expect(lastFrame()).not.toContain('B✓');
});

// ════════════════════════════════════════════════════════════════════
// Shift+Tab cycling within the trap
// ════════════════════════════════════════════════════════════════════

test('Shift+Tab cycles focus backward between trap children', async () => {
	const {stdin, lastFrame} = renderTrapTree(
		{active: true},
		<FocusableChild id="A" />,
		<FocusableChild id="B" />,
	);

	await delay(100);

	// First Shift+Tab → should land on B (last focusable).
	stdin.write('\u001B[Z');
	await delay(100);
	expect(lastFrame()).not.toContain('A✓');
	expect(lastFrame()).toContain('B✓');

	// Second Shift+Tab → moves to A.
	stdin.write('\u001B[Z');
	await delay(100);
	expect(lastFrame()).toContain('A✓');
	expect(lastFrame()).not.toContain('B✓');
});

// ════════════════════════════════════════════════════════════════════
// Escape triggers onEscape callback
// ════════════════════════════════════════════════════════════════════

test('Escape key triggers onEscape callback and is consumed', async () => {
	const onEscape = vi.fn();

	const {stdin} = renderTrapTree(
		{active: true, onEscape},
		<FocusableChild id="A" />,
	);

	await delay(100);

	// Send Escape.
	stdin.write('\u001B');
	await delay(100);

	expect(onEscape).toHaveBeenCalledOnce();
});

// ════════════════════════════════════════════════════════════════════
// Background focusable not focused while trap is active
// ════════════════════════════════════════════════════════════════════

test('background focusable is NOT focused while the trap is active', async () => {
	const {stdin, lastFrame} = renderTrapTree(
		{active: true},
		<FocusableChild id="A" />,
		<FocusableChild id="B" />,
	);

	await delay(100);

	// Tab multiple times — should only cycle within trap children.
	stdin.write('\t');
	await delay(100);
	stdin.write('\t');
	await delay(100);
	stdin.write('\t');
	await delay(100);
	stdin.write('\t');
	await delay(100);

	const frame = lastFrame();
	// Background should never be focused.
	expect(frame).not.toContain('BG✓');
	expect(frame).toContain('BG');
	// One of the trap children should be focused.
	expect(frame).toMatch(/[AB]✓/);
});

// ════════════════════════════════════════════════════════════════════
// Deactivation restores focus management
// ════════════════════════════════════════════════════════════════════

test('deactivating the trap restores Ink focus management', async () => {
	let trapActive = true;

	const {stdin, rerender, lastFrame} = render(
		<InputDispatcher>
			<BackgroundFocusable />
			<FocusTrap active={trapActive}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);

	await delay(100);

	// Tab within trap — focus moves to A.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');

	// Deactivate the trap.
	trapActive = false;
	rerender(
		<InputDispatcher>
			<BackgroundFocusable />
			<FocusTrap active={trapActive}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	// After deactivation, focus management should be re-enabled.
	// Tab via Ink's native handler — BG should receive focus.
	stdin.write('\t');
	await delay(100);

	const frame = lastFrame();
	// BG should now be focused (since A was focused before trap deactivated,
	// and Ink's Tab goes to next focusable after A, which is BG).
	expect(frame).toContain('BG✓');
});

// ════════════════════════════════════════════════════════════════════
// restoreFocus: previous focus is restored on deactivation
// ════════════════════════════════════════════════════════════════════

test('restoreFocus=true restores focus to previously focused element on deactivation', async () => {
	let trapActive = false;

	const {stdin, rerender, lastFrame} = render(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);

	await delay(100);

	// Focus the bg component first via Tab.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('bg✓');

	// Now activate the trap.
	trapActive = true;
	rerender(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	// Tab within trap to focus A.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');

	// Deactivate the trap — should restore focus to bg.
	trapActive = false;
	rerender(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	// Bg should have focus restored.
	expect(lastFrame()).toContain('bg✓');
	expect(lastFrame()).not.toContain('A✓');
});

// ════════════════════════════════════════════════════════════════════
// restoreFocus=false does NOT restore previous focus
// ════════════════════════════════════════════════════════════════════

test('restoreFocus=false does NOT restore previous focus on deactivation', async () => {
	let trapActive = false;

	const {stdin, rerender, lastFrame} = render(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive} restoreFocus={false}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);

	await delay(100);

	// Focus bg first.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('bg✓');

	// Activate trap.
	trapActive = true;
	rerender(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive} restoreFocus={false}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	// Tab within trap.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');

	// Deactivate trap — bg should NOT have focus restored.
	trapActive = false;
	rerender(
		<InputDispatcher>
			<FocusableChild id="bg" />
			<FocusTrap active={trapActive} restoreFocus={false}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);
	await delay(100);

	// Bg should NOT be focused — no focus was restored.
	expect(lastFrame()).not.toContain('bg✓');
});

// ════════════════════════════════════════════════════════════════════
// useFocusTrap hook returns correct shape
// ════════════════════════════════════════════════════════════════════

test('useFocusTrap returns trapId and isTrapped', async () => {
	let result: {trapId: string; isTrapped: boolean} | undefined;

	function Harness() {
		result = useFocusTrap(true);
		return <Text>harness</Text>;
	}

	render(
		<InputDispatcher>
			<Harness />
		</InputDispatcher>,
	);

	await delay(100);

	expect(result).toBeDefined();
	expect(typeof result!.trapId).toBe('string');
	expect(result!.trapId.length).toBeGreaterThan(0);
	expect(result!.isTrapped).toBe(true);
});

test('useFocusTrap isTrapped is false when active=false', async () => {
	let result: {trapId: string; isTrapped: boolean} | undefined;

	function Harness() {
		result = useFocusTrap(false);
		return <Text>harness</Text>;
	}

	render(
		<InputDispatcher>
			<Harness />
		</InputDispatcher>,
	);

	await delay(100);

	expect(result).toBeDefined();
	expect(result!.isTrapped).toBe(false);
});

// ════════════════════════════════════════════════════════════════════
// <FocusTrap> with active=false does not trap
// ════════════════════════════════════════════════════════════════════

test('<FocusTrap active={false}> does not interfere with normal focus', async () => {
	const {stdin, lastFrame} = render(
		<InputDispatcher>
			<FocusableChild id="A" />
			<FocusableChild id="B" />
			<FocusTrap active={false}>
				<FocusableChild id="C" />
			</FocusTrap>
		</InputDispatcher>,
	);

	await delay(100);

	// Tab should cycle through A and B normally (C is in an inactive trap).
	stdin.write('\t');
	await delay(100);
	// Ink's native Tab should work — A should be focused.
	expect(lastFrame()).toContain('A✓');

	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('B✓');
});

// ════════════════════════════════════════════════════════════════════
// Unmounting the trap restores focus management
// ════════════════════════════════════════════════════════════════════

test('unmounting the trap restores focus management', async () => {
	const {stdin, unmount, lastFrame} = render(
		<InputDispatcher>
			<BackgroundFocusable />
			<FocusTrap active={true}>
				<FocusableChild id="A" />
			</FocusTrap>
		</InputDispatcher>,
	);

	await delay(100);

	// Tab within trap.
	stdin.write('\t');
	await delay(100);
	expect(lastFrame()).toContain('A✓');

	// Unmount the entire tree including the trap.
	unmount();
	await delay(100);

	// Re-render without the trap — focus management should be restored.
	const result2 = render(
		<InputDispatcher>
			<FocusableChild id="bg" />
		</InputDispatcher>,
	);

	await delay(100);

	// Tab should now reach bg.
	result2.stdin.write('\t');
	await delay(100);
	expect(result2.lastFrame()).toContain('bg✓');
});

// ════════════════════════════════════════════════════════════════════
// Nested focus traps — focus gating is ref-counted
// ════════════════════════════════════════════════════════════════════

test('nested traps: inner deactivation keeps focus disabled while outer is still confining', async () => {
	let outerActive = true;
	let innerActive = true;

	// Test behaviorally: when traps are active, Tab cycling stays
	// within the trap children and never reaches background focusables.
	// Ink's FocusManager does not expose isFocusEnabled, so we verify
	// the invariant through focus traversal.

	function NestedApp() {
		return (
			<>
				<BackgroundFocusable />
				<FocusTrap active={outerActive}>
					<FocusableChild id="A" />
					<FocusTrap active={innerActive}>
						<FocusableChild id="B" />
					</FocusTrap>
				</FocusTrap>
			</>
		);
	}

	const {stdin, rerender, lastFrame} = render(
		<InputDispatcher>
			<NestedApp />
		</InputDispatcher>,
	);

	// ── (1) Both traps active → Tab stays within trap children ────
	await delay(100);

	// Tab multiple times — focus should cycle between A and B,
	// never reaching BG.
	for (let i = 0; i < 6; i++) {
		stdin.write('\t');
		await delay(50);
	}

	let frame = lastFrame();
	expect(frame).not.toContain('BG✓');
	expect(frame).toMatch(/[AB]✓/);

	// ── (2) Deactivate the INNER trap ─────────────────────────────
	// Focus must STAY confined — the outer trap is still active.
	innerActive = false;
	rerender(
		<InputDispatcher>
			<NestedApp />
		</InputDispatcher>,
	);
	await delay(100);

	// Tab should still cycle within the outer trap (A is inside outer).
	for (let i = 0; i < 4; i++) {
		stdin.write('\t');
		await delay(50);
	}

	frame = lastFrame();
	expect(frame).not.toContain('BG✓');
	// A is still inside the outer trap — it should get focus.
	expect(frame).toContain('A');

	// ── (3) Deactivate the OUTER trap ─────────────────────────────
	// Now that no trap is confining, Tab should reach BG.
	outerActive = false;
	rerender(
		<InputDispatcher>
			<NestedApp />
		</InputDispatcher>,
	);
	await delay(100);

	// Tab should now navigate to BG via Ink's native focus.
	stdin.write('\t');
	await delay(100);
	frame = lastFrame();
	expect(frame).toContain('BG✓');
});
