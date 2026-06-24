import {test, expect, vi} from 'vitest';
import {OverlayStore, overlayStore} from '../src/store.js';
import type {OverlayEntry} from '../src/types.js';

// Helper: create a fresh store per test to avoid cross-test contamination.
function createStore(): OverlayStore {
	return new OverlayStore();
}

// ── open / close lifecycle ──────────────────────────────────────────

test('open returns a unique string id', () => {
	const store = createStore();
	const id = store.open('hello', {});
	expect(typeof id).toBe('string');
	expect(id.length).toBeGreaterThan(0);
});

test('open adds exactly one entry visible via getAll', () => {
	const store = createStore();
	store.open('hello', {});
	const all = store.getAll();
	expect(all).toHaveLength(1);
	expect(all[0]!.content).toBe('hello');
});

test('close(id) removes the entry; getAll is empty afterwards', () => {
	const store = createStore();
	const id = store.open('hello', {});
	expect(store.getAll()).toHaveLength(1);

	store.close(id);
	expect(store.getAll()).toHaveLength(0);
});

test('close on missing id is a no-op and does not throw', () => {
	const store = createStore();
	expect(() => {
		store.close('nonexistent');
	}).not.toThrow();
	expect(store.getAll()).toHaveLength(0);
});

// ── subscribe receives updates ──────────────────────────────────────

test('subscribe listener is called immediately with current entries', () => {
	const store = createStore();
	store.open('first', {});
	const listener = vi.fn();
	store.subscribe(listener);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(listener).toHaveBeenCalledWith(store.getAll());
});

test('subscribe then open → listener called with updated entry list', () => {
	const store = createStore();
	const listener = vi.fn();
	store.subscribe(listener);

	// Reset mock so we only count calls after open
	listener.mockClear();

	const id = store.open('toast', {});
	expect(listener).toHaveBeenCalledTimes(1);
	const received: OverlayEntry[] = listener.mock.calls[0]![0];
	expect(received).toHaveLength(1);
	expect(received[0]!.id).toBe(id);
	expect(received[0]!.content).toBe('toast');
});

test('subscribe then close → listener called with empty list', () => {
	const store = createStore();
	const id = store.open('toast', {});
	const listener = vi.fn();
	store.subscribe(listener);

	// Clear the initial immediate call
	listener.mockClear();

	store.close(id);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(listener.mock.calls[0]![0]).toEqual([]);
});

// ── closeAll ────────────────────────────────────────────────────────

test('closeAll clears every entry and notifies listeners', () => {
	const store = createStore();
	store.open('a', {});
	store.open('b', {});
	expect(store.getAll()).toHaveLength(2);

	const listener = vi.fn();
	store.subscribe(listener);
	listener.mockClear();

	store.closeAll();
	expect(store.getAll()).toHaveLength(0);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(listener.mock.calls[0]![0]).toEqual([]);
});

// ── update merges partial opts ──────────────────────────────────────

test('update merges partial opts into existing entry (shallow)', () => {
	const store = createStore();
	const id = store.open('hello', {z: 1, anchor: 'top'});

	store.update(id, {z: 5});

	const entry = store.get(id);
	expect(entry).toBeDefined();
	expect(entry!.opts.z).toBe(5);
	// Existing field preserved
	expect(entry!.opts.anchor).toBe('top');
});

test('update on missing id is a no-op and does not notify', () => {
	const store = createStore();
	const listener = vi.fn();
	store.subscribe(listener);
	listener.mockClear();

	store.update('nonexistent', {z: 99});
	expect(listener).not.toHaveBeenCalled();
	expect(store.getAll()).toHaveLength(0);
});

test('update notifies listeners with updated entry list', () => {
	const store = createStore();
	const id = store.open('hello', {z: 1});
	const listener = vi.fn();
	store.subscribe(listener);
	listener.mockClear();

	store.update(id, {z: 10});
	expect(listener).toHaveBeenCalledTimes(1);
	const entries: OverlayEntry[] = listener.mock.calls[0]![0];
	expect(entries).toHaveLength(1);
	expect(entries[0]!.opts.z).toBe(10);
});

// ── unsubscribe stops notifications ─────────────────────────────────

test('unsubscribe stops future notifications', () => {
	const store = createStore();
	const listener = vi.fn();
	const unsub = store.subscribe(listener);

	// Immediate call + one from open
	store.open('a', {});
	listener.mockClear();
	unsub();

	store.open('b', {});
	expect(listener).not.toHaveBeenCalled();
});

// ── getAll returns insertion order ──────────────────────────────────

test('getAll returns entries in insertion order', () => {
	const store = createStore();
	const idA = store.open('A', {});
	const idB = store.open('B', {});

	const all = store.getAll();
	expect(all).toHaveLength(2);
	expect(all[0]!.id).toBe(idA);
	expect(all[0]!.content).toBe('A');
	expect(all[1]!.id).toBe(idB);
	expect(all[1]!.content).toBe('B');
});

// ── get by id ───────────────────────────────────────────────────────

test('get(id) returns the entry or undefined', () => {
	const store = createStore();
	const id = store.open('hello', {z: 3});

	expect(store.get(id)).toBeDefined();
	expect(store.get(id)!.content).toBe('hello');
	expect(store.get(id)!.opts.z).toBe(3);
	expect(store.get('nope')).toBeUndefined();
});

// ── unique ids across multiple opens ────────────────────────────────

test('each open call returns a distinct id', () => {
	const store = createStore();
	const ids = new Set<string>();
	for (let i = 0; i < 50; i++) {
		ids.add(store.open(`item-${i}`, {}));
	}

	expect(ids.size).toBe(50);
});

// ── singleton export ────────────────────────────────────────────────

test('exported overlayStore is an OverlayStore instance', () => {
	expect(overlayStore).toBeInstanceOf(OverlayStore);
});
