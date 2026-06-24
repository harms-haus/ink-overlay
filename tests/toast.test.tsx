/**
 * Tests for the Toast visual component.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect} from 'vitest';
import React from 'react';
import {render} from 'ink-testing-library';
import {Toast, defaultToastColors} from '../src/toast.js';
import type {ToastKind} from '../src/types.js';

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
// (d) Colors per kind (ANSI escape codes in rendered output)
// ════════════════════════════════════════════════════════════════════

describe('Toast colors per kind', () => {
	const kindColorCases: Array<{kind: ToastKind; ansiCode: string}> = [
		{kind: 'success', ansiCode: '\u001B[32m'}, // Green
		{kind: 'error', ansiCode: '\u001B[31m'}, // Red
		{kind: 'warn', ansiCode: '\u001B[33m'}, // Yellow
		{kind: 'info', ansiCode: '\u001B[34m'}, // Blue
	];

	for (const {kind, ansiCode} of kindColorCases) {
		test(`kind="${kind}" uses ${defaultToastColors[kind]} (contains ${JSON.stringify(ansiCode)})`, () => {
			const {lastFrame} = render(<Toast kind={kind}>msg</Toast>);
			expect(lastFrame()).toContain(ansiCode);
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
