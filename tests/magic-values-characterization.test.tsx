/**
 * Characterization tests pinning the magic-value literals used across
 * the source files.
 *
 * These tests assert the *current observable behaviour* (exact durations,
 * exact margin-step sequences, exact colours, exact offscreen sentinel).
 * They must fail if any value is accidentally changed.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import {Text, Box, type DOMElement} from 'ink';
import {
	getTransitionSteps,
	useEnterExit,
	FRAME_INTERVAL_MS,
	SLIDE_STEPS,
} from '../src/animation.js';
import type {TransitionConfig} from '../src/types.js';
import {Layer} from '../src/layer.js';
import {Modal} from '../src/modal.js';
import {CommandPalette} from '../src/command-palette.js';
import {Popover} from '../src/popover.js';
import {OverlayHost} from '../src/host.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {renderResizable} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';

// ── Shared helpers ──────────────────────────────────────────────────

// FRAME_INTERVAL_MS and SLIDE_STEPS are imported from src/animation.js so
// that these tests stay in sync with the source constants automatically.

// ANSI sequences chalk emits in the test environment (FORCE_COLOR=1, level 1).
const CYAN_FG = '\u001B[36m'; // foreground cyan — used for borderColor="cyan"
const BLACK_BG = '\u001B[40m'; // background black — #1a1a2e rounds to this

// ── useEnterExit harness ────────────────────────────────────────────

type HookSnapshot = {
	stage: string;
	currentStyle: Record<string, number | string>;
	transitionKey: string;
};

function Harness({
	visible,
	config,
	onState,
}: {
	visible: boolean;
	config: TransitionConfig;
	onState: (snapshot: HookSnapshot) => void;
}) {
	const result = useEnterExit(visible, config);
	onState(result);
	return <Text>content</Text>;
}

afterEach(async () => {
	await delay(50);
});

// ════════════════════════════════════════════════════════════════════
// animation.tsx — FRAME_INTERVAL_MS (duration literal `80`)
// ════════════════════════════════════════════════════════════════════

describe('animation: frame interval duration (FRAME_INTERVAL_MS)', () => {
	test("every animated transition's duration is 80ms", () => {
		for (const name of [
			'fade',
			'slide-up',
			'slide-down',
			'slide-left',
			'slide-right',
		] as const) {
			expect(getTransitionSteps(name).duration).toBe(FRAME_INTERVAL_MS);
		}
	});

	test("'none' transition keeps duration 0 (not the frame interval)", () => {
		expect(getTransitionSteps('none').duration).toBe(0);
	});

	test('useEnterExit defaults to the 80ms interval when config.duration is undefined', async () => {
		// A 3-frame enter config with NO duration must still animate at the
		// ~80ms cadence (the `config.duration ?? 80` fallback). If the
		// fallback changed to something huge it would never complete within
		// a reasonable window; if it changed to 0 it would skip instantly.
		const config: TransitionConfig = {
			enter: [
				{style: {marginTop: SLIDE_STEPS}},
				{style: {marginTop: SLIDE_STEPS / 2}},
				{style: {marginTop: 0}},
			],
			exit: [{style: {}}],
			// duration intentionally omitted
		};

		let snapshot: HookSnapshot | undefined;

		render(
			<Harness
				visible={true}
				config={config}
				onState={s => {
					snapshot = s;
				}}
			/>,
		);

		// Immediately it is animating (entering), proving a finite interval.
		await delay(10);
		expect(snapshot!.stage).toBe('entering');

		// Two steps × 80ms = 160ms; well under 500ms. If the default were
		// e.g. 8000ms this would still be 'entering'.
		await delay(500);
		expect(snapshot!.stage).toBe('visible');
		expect(snapshot!.currentStyle).toEqual({marginTop: 0});
	});
});

// ════════════════════════════════════════════════════════════════════
// animation.tsx — SLIDE_STEPS (the `n = 4` literal in each slide-* case)
// ════════════════════════════════════════════════════════════════════

describe('animation: slide step distance (SLIDE_STEPS)', () => {
	test("slide-up steps marginTop n → n/2 → 0 (enter) and 0 → n/2 → n (exit)", () => {
		const cfg = getTransitionSteps('slide-up');
		expect(cfg.enter!.map(s => s.style.marginTop)).toEqual([
			SLIDE_STEPS,
			SLIDE_STEPS / 2,
			0,
		]);
		expect(cfg.exit!.map(s => s.style.marginTop)).toEqual([
			0,
			SLIDE_STEPS / 2,
			SLIDE_STEPS,
		]);
	});

	test("slide-down steps marginBottom n → n/2 → 0 (enter) and 0 → n/2 → n (exit)", () => {
		const cfg = getTransitionSteps('slide-down');
		expect(cfg.enter!.map(s => s.style.marginBottom)).toEqual([
			SLIDE_STEPS,
			SLIDE_STEPS / 2,
			0,
		]);
		expect(cfg.exit!.map(s => s.style.marginBottom)).toEqual([
			0,
			SLIDE_STEPS / 2,
			SLIDE_STEPS,
		]);
	});

	test("slide-left steps marginLeft n → n/2 → 0 (enter) and 0 → n/2 → n (exit)", () => {
		const cfg = getTransitionSteps('slide-left');
		expect(cfg.enter!.map(s => s.style.marginLeft)).toEqual([
			SLIDE_STEPS,
			SLIDE_STEPS / 2,
			0,
		]);
		expect(cfg.exit!.map(s => s.style.marginLeft)).toEqual([
			0,
			SLIDE_STEPS / 2,
			SLIDE_STEPS,
		]);
	});

	test("slide-right steps marginRight n → n/2 → 0 (enter) and 0 → n/2 → n (exit)", () => {
		const cfg = getTransitionSteps('slide-right');
		expect(cfg.enter!.map(s => s.style.marginRight)).toEqual([
			SLIDE_STEPS,
			SLIDE_STEPS / 2,
			0,
		]);
		expect(cfg.exit!.map(s => s.style.marginRight)).toEqual([
			0,
			SLIDE_STEPS / 2,
			SLIDE_STEPS,
		]);
	});

	test('slide step count is exactly 4 (midpoint is the integer 2)', () => {
		// Guards against accidentally changing the step distance: the
		// midpoint must be 2 (4 / 2), not a fractional value.
		const cfg = getTransitionSteps('slide-up');
		expect(cfg.enter!.length).toBe(3);
		expect(cfg.enter![1]!.style.marginTop).toBe(2);
	});
});

// ════════════════════════════════════════════════════════════════════
// modal.tsx — DEFAULT_BORDER_COLOR (borderColor = 'cyan')
// ════════════════════════════════════════════════════════════════════

describe('modal: default border colour (cyan)', () => {
	test('Modal border renders with the cyan ANSI colour code', async () => {
		const {lastFrame, unmount} = renderWithHost(
			<Modal title="T">
				<Text>body</Text>
			</Modal>,
		);

		await delay(200);

		const frame = lastFrame();
		// cyan foreground is emitted around the border characters.
		expect(frame).toContain(CYAN_FG);
		// A different colour (red) must NOT be present — pins the value
		// specifically to cyan rather than "some colour".
		expect(frame).not.toContain('\u001B[31m');

		unmount();
	});

	test('explicit borderColor overrides the cyan default', async () => {
		const {lastFrame, unmount} = renderWithHost(
			<Modal title="T" borderColor="red">
				<Text>body</Text>
			</Modal>,
		);

		await delay(200);

		const frame = lastFrame();
		expect(frame).toContain('\u001B[31m');
		// Cyan no longer present on the border.
		expect(frame).not.toContain(CYAN_FG);

		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// command-palette.tsx — BORDER_COLOR (borderColor="cyan" on the Box)
// ════════════════════════════════════════════════════════════════════

describe('command-palette: border colour (cyan)', () => {
	test('CommandPalette border renders with the cyan ANSI colour code', async () => {
		const {lastFrame, unmount} = renderWithHost(
			<CommandPalette
				items={[{id: 'a', label: 'Apple'}]}
				defaultOpen
			/>,
		);

		await delay(300);

		const frame = lastFrame();
		expect(frame).toContain(CYAN_FG);
		expect(frame).not.toContain('\u001B[31m');

		unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// layer.tsx — DEFAULT_DIM_BACKDROP_COLOR ('#1a1a2e')
// ════════════════════════════════════════════════════════════════════

describe('layer: dim backdrop colour (#1a1a2e)', () => {
	test('Layer with backdrop="dim" paints a background colour block', async () => {
		const {lastFrame, unmount} = renderWithHost(
			<>
				<Text>base content</Text>
				<Layer anchor="center" backdrop="dim">
					<Text>overlay</Text>
				</Layer>
			</>,
		);

		await delay(200);

		const frame = lastFrame();
		// The dim backdrop overpaints the base content (background applied).
		expect(frame).toContain('overlay');
		expect(frame).not.toContain('base content');
		// In the test colour level, #1a1a2e rounds to the black-background
		// ANSI escape. Its presence proves a non-none backdrop colour is
		// emitted (a literal change to a different hex would only change the
		// rounded code, but the default-vs-opaque branch is pinned below).
		expect(frame).toContain(BLACK_BG);

		unmount();
	});

	test('backdrop="opaque" uses black, backdrop="dim" uses the dim default (both paint)', async () => {
		const opaqueResult = renderWithHost(
			<>
				<Text>base</Text>
				<Layer anchor="center" backdrop="opaque">
					<Text>o</Text>
				</Layer>
			</>,
		);
		await delay(200);
		expect(opaqueResult.lastFrame()).toContain(BLACK_BG);
		opaqueResult.unmount();

		const dimResult = renderWithHost(
			<>
				<Text>base</Text>
				<Layer anchor="center" backdrop="dim">
					<Text>d</Text>
				</Layer>
			</>,
		);
		await delay(200);
		expect(dimResult.lastFrame()).toContain(BLACK_BG);
		dimResult.unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// popover.tsx — OFFSCREEN_SENTINEL (-9999)
// ════════════════════════════════════════════════════════════════════

describe('popover: offscreen sentinel (-9999)', () => {
	test('popover content is rendered offscreen (not visible) until the anchor is measured', async () => {
		// An anchorRef that is never attached to a real node means the
		// popover never becomes "measured", so it stays parked at the
		// offscreen sentinel coordinates and the content must not appear.
		const ref: {current: DOMElement | null} = {current: null};

		function App() {
			return (
				<OverlayHost>
					<Box>
						<Text>anchor-only</Text>
					</Box>
					<Popover anchorRef={ref}>
						<Text>OFFSCREEN_CONTENT</Text>
					</Popover>
				</OverlayHost>
			);
		}

		const {lastFrame, unmountAndCleanup} = renderResizable(<App />, {
			columns: 80,
			rows: 24,
		});

		await delay(400);

		const frame = lastFrame();
		expect(frame).toContain('anchor-only');
		// Content parked at -9999/-9999 is outside the visible buffer.
		expect(frame).not.toContain('OFFSCREEN_CONTENT');

		unmountAndCleanup();
	});

	test('once measured, popover content snaps into the visible frame', async () => {
		// Sanity counterpart: with a real anchor, measurement succeeds and
		// the content leaves the offscreen position and becomes visible.
		function App() {
			const ref = React.useRef<DOMElement | null>(null);
			return (
				<OverlayHost>
					<Box flexDirection="column" width={80}>
						<Box ref={ref}>
							<Text>anchor</Text>
						</Box>
					</Box>
					<Popover anchorRef={ref} placement="bottom">
						<Text>VISIBLE_POP</Text>
					</Popover>
				</OverlayHost>
			);
		}

		const {lastFrame, unmountAndCleanup} = renderResizable(<App />, {
			columns: 80,
			rows: 24,
		});

		await delay(500);

		expect(lastFrame()).toContain('VISIBLE_POP');

		unmountAndCleanup();
	});
});
