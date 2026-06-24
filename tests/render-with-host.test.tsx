/**
 * Characterization tests for the `renderWithHost` test helper.
 *
 * These tests pin down the *current observable shape and behavior* of the
 * helper so that the planned refactor (adjusting the `RenderWithHostResult`
 * type and switching `.cleanup()` calls to `.unmount()`) can be verified as
 * safe.
 *
 * Key facts established here (verified against the installed
 * `ink-testing-library`):
 *
 *  - `renderWithHost()` returns the ink-testing-library `render()` result,
 *    which at runtime exposes: `lastFrame`, `frames`, `rerender`, `unmount`,
 *    `cleanup`, `stdin`, and `stdout`.
 *  - Both `unmount()` and `cleanup()` are callable functions.
 *  - `unmount()` removes the rendered content from the frame (it is the safe
 *    replacement for `.cleanup()` when tearing down between tests).
 *  - `rerender()` re-renders the tree wrapped inside `<OverlayHost>`.
 *
 * To avoid coupling to the (mutable) `RenderWithHostResult` type, the tests
 * inspect the runtime object directly via casts — they assert what the
 * object *actually is*, not what the type declaration claims.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import React from 'react';
import {Text} from 'ink';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

/**
 * A loose view of the ink-testing-library result that does not depend on the
 * (refactor-target) `RenderWithHostResult` type. Inspecting the runtime
 * object via this shape keeps these characterization tests robust to the
 * planned type changes.
 */
type RenderResultLike = {
	lastFrame: () => string;
	frames: string[];
	rerender: (tree: React.ReactElement) => void;
	unmount: () => void;
	stdin: unknown;
	stdout: unknown;
	[key: string]: unknown;
};

/**
 * Read the helper result as a plain record so that property-existence checks
 * reflect the runtime object rather than the (refactor-target) TypeScript
 * type.
 */
function resultAsRecord(result: RenderResultLike): Record<string, unknown> {
	return result as Record<string, unknown>;
}

// Track the most recent render instance so afterEach can tear it down.
let instance: RenderResultLike | undefined;

afterEach(async () => {
	if (instance && typeof instance.unmount === 'function') {
		instance.unmount();
	}

	instance = undefined;
	await delay(50);
});

describe('renderWithHost return shape', () => {
	test('exposes lastFrame, frames, rerender, unmount, stdin, stdout', () => {
		instance = renderWithHost(<Text>shape-check</Text>);

		const result = resultAsRecord(instance);

		// Core ink-testing-library result properties.
		expect(typeof result.lastFrame).toBe('function');
		expect(Array.isArray(result.frames)).toBe(true);
		expect(typeof result.rerender).toBe('function');
		expect(typeof result.unmount).toBe('function');
		expect(result.stdin).toBeDefined();
		expect(result.stdout).toBeDefined();
	});

	test('exposes a callable cleanup() method at runtime', () => {
		// Ink-testing-library's render() returns `cleanup` (confirmed in the
		// installed build/index.d.ts Instance type). This pins down the
		// runtime contract so that the type-level refactor cannot silently
		// drop a method that callers invoke.
		instance = renderWithHost(<Text>cleanup-check</Text>);

		const result = resultAsRecord(instance);

		expect(result.cleanup).toBeDefined();
		expect(typeof result.cleanup).toBe('function');
	});
});

describe('renderWithHost content rendering', () => {
	test('renders the tree inside an OverlayHost so content appears', async () => {
		instance = renderWithHost(<Text>visible-content</Text>);

		await delay(200);

		expect(instance.lastFrame()).toContain('visible-content');
	});
});

describe('renderWithHost teardown', () => {
	test('unmount() removes content from the rendered frame', async () => {
		instance = renderWithHost(<Text>teardown-target</Text>);

		await delay(200);
		expect(instance.lastFrame()).toContain('teardown-target');

		expect(() => {
			instance.unmount();
		}).not.toThrow();

		await delay(100);

		// After unmount the ink render loop flushes an empty frame, so the
		// content must no longer be present.
		expect(instance.lastFrame()).not.toContain('teardown-target');
	});

	test('cleanup() is callable without throwing', async () => {
		instance = renderWithHost(<Text>cleanup-target</Text>);

		await delay(200);
		expect(instance.lastFrame()).toContain('cleanup-target');

		// The animation-snapshot suite currently calls .cleanup() directly;
		// it must be a safe, non-throwing teardown.
		expect(() => {
			resultAsRecord(instance).cleanup();
		}).not.toThrow();
	});

	test('unmount() and cleanup() are safe to call in sequence', async () => {
		instance = renderWithHost(<Text>sequence-target</Text>);

		await delay(200);

		// Mirror the global cleanup() helper which calls unmount() then
		// cleanup() on each instance — neither call should throw.
		expect(() => {
			instance.unmount();
			resultAsRecord(instance).cleanup();
		}).not.toThrow();
	});
});

describe('renderWithHost rerender', () => {
	test('rerender() re-renders the wrapped tree with new content', async () => {
		instance = renderWithHost(<Text>first</Text>);

		await delay(200);
		expect(instance.lastFrame()).toContain('first');

		instance.rerender(<Text>second</Text>);

		await delay(200);
		expect(instance.lastFrame()).toContain('second');
		expect(instance.lastFrame()).not.toContain('first');
	});
});
