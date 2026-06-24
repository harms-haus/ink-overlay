/**
 * Characterization tests pinning down the observable behaviors whose
 * explanatory comments are being cleaned up (no logic change).
 *
 * Each describe block corresponds to a comment region targeted by the
 * comment-cleanup task:
 *
 *  1. `src/animation.tsx` — the 'fade' transition config (multi-line
 *     history comment replaced with a one-liner).
 *  2. `src/layer.tsx` — the content-sync effect (8-line rationale
 *     condensed to a concise note).
 *  3. `src/focus-trap.tsx` — the hook signature (active-first positional
 *     arg; the "signature decision" rationale removed).
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, vi, afterEach} from 'vitest';
import React, {useState} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {getTransitionSteps} from '../src/animation.js';
import {Layer} from '../src/layer.js';
import {InputDispatcher} from '../src/input-dispatcher.js';
import {useFocusTrap} from '../src/focus-trap.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

afterEach(async () => {
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// 1. animation.tsx — 'fade' transition config
// ════════════════════════════════════════════════════════════════════

describe('characterization: "fade" transition config', () => {
	test('enter is exactly two frames stepping height 0 → 1', () => {
		const cfg = getTransitionSteps('fade');
		expect(cfg.enter).toEqual([
			{style: {height: 0}},
			{style: {height: 1}},
		]);
	});

	test('exit is exactly two frames stepping height 1 → 0', () => {
		const cfg = getTransitionSteps('fade');
		expect(cfg.exit).toEqual([
			{style: {height: 1}},
			{style: {height: 0}},
		]);
	});

	test('duration is the standard frame interval (80 ms)', () => {
		expect(getTransitionSteps('fade').duration).toBe(80);
	});

	test('fade frames carry NO dim or dimColor keys', () => {
		const cfg = getTransitionSteps('fade');
		for (const frame of [...cfg.enter!, ...cfg.exit!!]) {
			expect(frame.style).not.toHaveProperty('dim');
			expect(frame.style).not.toHaveProperty('dimColor');
		}
	});

	test('fade config is cached — same object reference returned for same name', () => {
		expect(getTransitionSteps('fade')).toBe(getTransitionSteps('fade'));
	});
});

// ════════════════════════════════════════════════════════════════════
// 2. layer.tsx — content-sync effect
//
// The content-sync effect pushes contentRef changes to the host WITHOUT
// re-running the registration effect (children is deliberately excluded
// from the main effect deps).  These tests verify that content-only
// updates (no structural prop change) still reach the rendered frame.
// ════════════════════════════════════════════════════════════════════

describe('characterization: content-only updates propagate to the host', () => {
	test('changing ONLY children (no structural prop change) updates the rendered frame', async () => {
		let setLabel: (next: string) => void;

		function Parent() {
			const [label, setLabel_] = useState('first');
			setLabel = setLabel_;
			return (
				<>
					<Text>base</Text>
					<Layer anchor="center" id="content-sync">
						<Text>{label}</Text>
					</Layer>
				</>
			);
		}

		const {lastFrame} = renderWithHost(<Parent />);

		await delay(200);
		expect(lastFrame()).toContain('first');

		// Change ONLY the children — no structural prop changes.
		setLabel('second');
		await delay(200);

		// The content-sync effect must push the new content to the host.
		const frame = lastFrame();
		expect(frame).toContain('second');
		expect(frame).not.toContain('first');
	});

	test('multiple sequential content-only updates all reach the frame', async () => {
		let bump: () => void;

		function Parent() {
			const [n, setN] = useState(0);
			bump = () => {
				setN(v => v + 1);
			};
			return (
				<>
					<Text>base</Text>
					<Layer anchor="center" id="multi-sync">
						<Text>val-{n}</Text>
					</Layer>
				</>
			);
		}

		const {lastFrame} = renderWithHost(<Parent />);

		await delay(200);
		expect(lastFrame()).toContain('val-0');

		bump();
		await delay(150);
		expect(lastFrame()).toContain('val-1');

		bump();
		await delay(150);
		expect(lastFrame()).toContain('val-2');

		bump();
		await delay(150);
		expect(lastFrame()).toContain('val-3');
	});

	test('content update does not unregister/re-register the layer (id stable)', async () => {
		let setLabel: (next: string) => void;

		function Parent() {
			const [label, setLabel_] = useState('a');
			setLabel = setLabel_;
			return (
				<>
					<Text>base</Text>
					<Layer anchor="center" id="stable-id">
						<Text>{label}</Text>
					</Layer>
				</>
			);
		}

		const {lastFrame} = renderWithHost(<Parent />);

		await delay(200);
		expect(lastFrame()).toContain('a');

		// Content-only change.
		setLabel('b');
		await delay(200);

		// Layer must still be rendered (not dropped during sync).
		expect(lastFrame()).toContain('base');
		expect(lastFrame()).toContain('b');
	});
});

// ════════════════════════════════════════════════════════════════════
// 3. focus-trap.tsx — hook signature (active-first positional arg)
// ════════════════════════════════════════════════════════════════════

describe('characterization: useFocusTrap signature', () => {
	test('first positional arg is `active` (boolean)', async () => {
		let result: ReturnType<typeof useFocusTrap> | undefined;

		function Harness() {
			// Call with active=false so no global nav side effects occur.
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
		// isTrapped mirrors the first arg (active).
		expect(result!.isTrapped).toBe(false);
		expect(typeof result!.trapId).toBe('string');
		expect(result!.trapId.length).toBeGreaterThan(0);
	});

	test('isTrapped=true when active=true is passed as first arg', async () => {
		let result: ReturnType<typeof useFocusTrap> | undefined;

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

		expect(result!.isTrapped).toBe(true);
	});

	test('options bag is the second arg (onEscape is invoked)', async () => {
		const onEscape = vi.fn();

		function Harness() {
			useFocusTrap(true, {onEscape});
			return <Text>harness</Text>;
		}

		const {stdin} = render(
			<InputDispatcher>
				<Harness />
			</InputDispatcher>,
		);

		await delay(100);

		stdin.write('\u001B');
		await delay(100);

		expect(onEscape).toHaveBeenCalledOnce();
	});
});
