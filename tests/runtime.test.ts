import {test, expect, vi} from 'vitest';
import {
	isBun,
	isNonInteractive,
	isRawModeSupported,
	getRuntimeInfo,
	warnBunInput,
} from '../src/runtime.js';

test('isBun() returns a boolean', () => {
	const result = isBun();
	expect(typeof result).toBe('boolean');
});

test('isNonInteractive() returns a boolean', () => {
	const result = isNonInteractive();
	expect(typeof result).toBe('boolean');
});

test('isRawModeSupported() returns a boolean without throwing', () => {
	expect(() => {
		const result = isRawModeSupported();
		expect(typeof result).toBe('boolean');
	}).not.toThrow();
});

test('getRuntimeInfo() returns object with three boolean fields', () => {
	const info = getRuntimeInfo();

	expect(info).toEqual({
		bun: expect.any(Boolean),
		interactive: expect.any(Boolean),
		rawModeSupported: expect.any(Boolean),
	});

	// Ensure all three keys are present and boolean-typed.
	expect(typeof info.bun).toBe('boolean');
	expect(typeof info.interactive).toBe('boolean');
	expect(typeof info.rawModeSupported).toBe('boolean');
});

test('warnBunInput() does not throw', () => {
	const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

	try {
		expect(() => {
			warnBunInput();
		}).not.toThrow();
	} finally {
		warnSpy.mockRestore();
	}
});
