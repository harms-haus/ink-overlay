/**
 * Tests for the Toast visual component.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React from 'react';
import {render as baseRender} from 'ink-testing-library';
import {Toast, defaultToastColors} from '../src/toast.js';
import type {ToastKind} from '../src/types.js';

// Track the active render instance so afterEach can tear it down.
let activeInstance: ReturnType<typeof baseRender> | undefined;

afterEach(() => {
	activeInstance?.unmount();
	activeInstance = undefined;
});

/** render wrapper that tracks the instance for afterEach cleanup. */
function render(tree: React.ReactElement) {
	activeInstance?.unmount();
	activeInstance = baseRender(tree);
	return activeInstance;
}

// ════════════════════════════════════════════════════════════════════
// (a) defaultToastColors
// ════════════════════════════════════════════════════════════════════

describe('defaultToastColors', () => {
	test('maps success to green', () => {
		expect(defaultToastColors.success).toBe('green');
	});

	test('maps error to red', () => {
		expect(defaultToastColors.error).toBe('red');
	});

	test('maps warn to yellow', () => {
		expect(defaultToastColors.warn).toBe('yellow');
	});

	test('maps info to blue', () => {
		expect(defaultToastColors.info).toBe('blue');
	});

	test('has exactly 4 keys matching ToastKind', () => {
		const keys = Object.keys(defaultToastColors) as ToastKind[];
		expect(keys.sort()).toEqual(['error', 'info', 'success', 'warn']);
	});
});

// ════════════════════════════════════════════════════════════════════
// (b) Default kind behavior
// ════════════════════════════════════════════════════════════════════

describe('Toast default kind', () => {
	test('defaults to info kind when kind prop omitted', () => {
		const {lastFrame} = render(<Toast>Hello</Toast>);
		const output = lastFrame();
		// Default icon for info is ℹ
		expect(output).toContain('ℹ');
		expect(output).toContain('Hello');
	});
});

// ════════════════════════════════════════════════════════════════════
// (c) Icons per kind
// ════════════════════════════════════════════════════════════════════

describe('Toast icons per kind', () => {
	const kindIconCases: Array<{kind: ToastKind; icon: string}> = [
		{kind: 'success', icon: '✓'},
		{kind: 'error', icon: '✗'},
		{kind: 'warn', icon: '⚠'},
		{kind: 'info', icon: 'ℹ'},
	];

	for (const {kind, icon} of kindIconCases) {
		test(`kind="${kind}" renders default icon "${icon}"`, () => {
			const {lastFrame} = render(<Toast kind={kind}>msg</Toast>);
			expect(lastFrame()).toContain(icon);
		});
	}
});

// ════════════════════════════════════════════════════════════════════
// (d) Colors per kind
//
// We do NOT assert on ANSI escape codes — those are Ink's internal
// rendering detail and would break if Ink changes its escape sequences.
// Instead we verify the component's contract: each kind renders the
// expected icon + message, and the color name is resolved correctly.
// ════════════════════════════════════════════════════════════════════

describe('Toast colors per kind', () => {
	const expectedColors: Record<ToastKind, string> = {
		success: 'green',
		error: 'red',
		warn: 'yellow',
		info: 'blue',
	};

	const expectedIcons: Record<ToastKind, string> = {
		success: '✓',
		error: '✗',
		warn: '⚠',
		info: 'ℹ',
	};

	for (const kind of Object.keys(expectedColors) as ToastKind[]) {
		const color = expectedColors[kind];
		const icon = expectedIcons[kind];

		test(`kind="${kind}" resolves color to "${color}"`, () => {
			expect(defaultToastColors[kind]).toBe(color);
		});

		test(`kind="${kind}" renders with icon "${icon}" and message`, () => {
			const message = `toast-${kind}-message`;
			const {lastFrame} = render(<Toast kind={kind}>{message}</Toast>);
			const output = lastFrame();
			expect(output).toContain(icon);
			expect(output).toContain(message);
		});
	}
});

// ════════════════════════════════════════════════════════════════════
// (e) Content rendering
// ════════════════════════════════════════════════════════════════════

describe('Toast content rendering', () => {
	test('renders children text', () => {
		const {lastFrame} = render(<Toast kind="success">Saved!</Toast>);
		expect(lastFrame()).toContain('Saved!');
	});

	test('renders border with round style', () => {
		const {lastFrame} = render(<Toast kind="info">test</Toast>);
		const output = lastFrame();
		// Round border uses ╭╮╰╯ characters
		expect(output).toMatch(/[╭╮╰╯]/);
	});

	test('renders icon and children together', () => {
		const {lastFrame} = render(<Toast kind="success">File uploaded</Toast>);
		const output = lastFrame();
		expect(output).toContain('✓');
		expect(output).toContain('File uploaded');
	});
});

// ════════════════════════════════════════════════════════════════════
// (f) Custom icon override
// ════════════════════════════════════════════════════════════════════

describe('Toast custom icon', () => {
	test('icon prop overrides default icon', () => {
		const {lastFrame} = render(
			<Toast kind="success" icon="★">
				Premium
			</Toast>,
		);
		const output = lastFrame();
		expect(output).toContain('★');
		expect(output).toContain('Premium');
	});

	test('icon prop overrides default icon for error kind', () => {
		const {lastFrame} = render(
			<Toast kind="error" icon="💥">
				Crash
			</Toast>,
		);
		const output = lastFrame();
		expect(output).toContain('💥');
		expect(output).toContain('Crash');
	});
});
