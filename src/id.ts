/**
 * Shared unique-id generator.
 *
 * Uses `crypto.randomUUID()` when available (Node ≥ 19, Bun, all modern
 * browsers), otherwise falls back to a timestamp + random suffix.
 *
 * An optional `prefix` is prepended to the fallback base — useful when
 * entries need a human-readable namespace (e.g. `toast-…`).
 *
 * @module id
 */

/**
 * Generate a unique identifier.
 *
 * @param prefix - Optional prefix for the fallback path (ignored when
 *   `crypto.randomUUID()` is available).
 * @returns A unique string.
 */
export function generateId(prefix?: string): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	return `${prefix ?? ''}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
