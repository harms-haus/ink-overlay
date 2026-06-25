/**
 * Tests for the shared unique-id generator (`src/id.ts`).
 *
 * `generateId` has two code paths:
 *   1. A "crypto" path used when `globalThis.crypto.randomUUID` is a
 *      function (Node ≥ 19, Bun, modern browsers).
 *   2. A "fallback" path using `Date.now()` + a random suffix.
 *
 * In both paths an optional `prefix` must be prepended to the produced
 * id — this is the core contract asserted here. The crypto path used to
 * drop the prefix; these tests guard against that regression.
 */
import {describe, test, expect, afterEach, beforeEach, vi} from 'vitest';
import {generateId} from '../src/id.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Force the *fallback* (non-crypto) code path by hiding
 * `crypto.randomUUID`, then restore it afterwards.
 *
 * `randomUUID` lives on `globalThis.crypto`, which is a read-only
 * accessor, so we can't simply delete it. Instead we replace the entire
 * `crypto` object on `globalThis` for the duration of the stub.
 */
function stubCryptoRandomUUIDMissing(): void {
	vi.stubGlobal('crypto', {});
}

// ── Setup / teardown ────────────────────────────────────────────────

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════
// General contract (path-agnostic)
// ═══════════════════════════════════════════════════════════════════

describe('generateId — general contract', () => {
	test('returns a non-empty string', () => {
		const id = generateId();
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);
	});

	test('returns a distinct value on successive calls', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateId());
		}

		expect(ids.size).toBe(100);
	});
});

// ═══════════════════════════════════════════════════════════════════
// Crypto path — `crypto.randomUUID()` available (the default in the
// test environment, which is Node ≥ 22).
// ═══════════════════════════════════════════════════════════════════

describe('generateId — crypto path (randomUUID available)', () => {
	test('default environment exposes crypto.randomUUID (guards path selection)', () => {
		// This documents the precondition for the rest of this describe
		// block: if this fails, the test runner changed and the "crypto"
		// assertions below are no longer exercising that path.
		expect(typeof globalThis.crypto?.randomUUID).toBe('function');
	});

	test('without a prefix returns a bare RFC-4122 v4 UUID', () => {
		const id = generateId();
		// xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test('with a prefix prepends the prefix to the UUID', () => {
		const id = generateId('toast-');
		expect(id.startsWith('toast-')).toBe(true);
		// The portion after the prefix is still a valid UUID.
		expect(id.slice('toast-'.length)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test('with an empty-string prefix behaves like no prefix (bare UUID)', () => {
		const id = generateId('');
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test('prefix is used verbatim (not escaped or trimmed)', () => {
		const id = generateId('overlay:');
		expect(id.startsWith('overlay:')).toBe(true);
	});

	test('two prefixed calls produce distinct ids', () => {
		const a = generateId('toast-');
		const b = generateId('toast-');
		expect(a).not.toBe(b);
	});
});

// ═══════════════════════════════════════════════════════════════════
// Fallback path — `crypto.randomUUID` not available.
// ═══════════════════════════════════════════════════════════════════

describe('generateId — fallback path (randomUUID unavailable)', () => {
	beforeEach(() => {
		stubCryptoRandomUUIDMissing();
	});

	test('without a prefix returns a timestamp-random string', () => {
		const id = generateId();
		// <timestamp>-<base36 random>
		expect(id).toMatch(/^\d+-[0-9a-z]+$/);
	});

	test('with a prefix prepends the prefix to the fallback id', () => {
		const id = generateId('toast-');
		expect(id.startsWith('toast-')).toBe(true);
		// The portion after the prefix still matches the fallback shape.
		expect(id.slice('toast-'.length)).toMatch(/^\d+-[0-9a-z]+$/);
	});

	test('with an empty-string prefix behaves like no prefix', () => {
		const id = generateId('');
		expect(id).toMatch(/^\d+-[0-9a-z]+$/);
	});

	test('two fallback calls produce distinct ids', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 50; i++) {
			ids.add(generateId('p-'));
		}

		// All start with the prefix.
		for (const id of ids) {
			expect(id.startsWith('p-')).toBe(true);
		}

		expect(ids.size).toBe(50);
	});
});
