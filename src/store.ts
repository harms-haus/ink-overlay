import {type ReactNode} from 'react';
import {type OverlayEntry, type LayerOpts} from './types.js';
import {generateId} from './id.js';

/**
 * Imperative pub/sub store for overlay entries.
 *
 * Follows the react-hot-toast / sonner pattern: callers open, close, and
 * update overlays via plain functions; React components subscribe and
 * re-render on change.
 *
 * Design constraints:
 * - No side effects on import (no raw mode, no stdin access).
 * - Pure TypeScript — type-only React imports.
 * - Insertion-order preservation via Map.
 */
export class OverlayStore {
	private readonly overlays = new Map<string, OverlayEntry>();
	private readonly listeners = new Set<
	(entries: OverlayEntry[]) => void
	>();

	/**
	 * Open a new overlay.
	 *
	 * @returns The generated unique id.
	 */
	open(content: ReactNode, options: LayerOpts): string {
		const id = generateId();
		this.overlays.set(id, {id, content, opts: options});
		this.notify();
		return id;
	}

	/**
	 * Close (remove) an overlay by id.
	 *
	 * No-op — including no notification — if the id is not present.
	 */
	close(id: string): void {
		if (!this.overlays.has(id)) {
			return;
		}

		this.overlays.delete(id);
		this.notify();
	}

	/** Close (remove) every overlay. */
	closeAll(): void {
		this.overlays.clear();
		this.notify();
	}

	/**
	 * Shallow-merge a partial opts patch into an existing overlay,
	 * optionally replacing its content.
	 *
	 * No-op (including no notification) if the id is not present.
	 */
	update(id: string, patch: Partial<LayerOpts>, newContent?: ReactNode): void {
		const entry = this.overlays.get(id);
		if (!entry) {
			return;
		}

		entry.opts = {...entry.opts, ...patch};
		entry.content = newContent ?? entry.content;
		this.notify();
	}

	/**
	 * Subscribe to overlay changes.
	 *
	 * The listener is called **immediately** with the current entry list
	 * on subscribe, and again after every mutation.
	 *
	 * @returns An unsubscribe function.
	 */
	subscribe(
		listener: (entries: OverlayEntry[]) => void,
	): () => void {
		this.listeners.add(listener);

		// Immediate synchronous call with current state.
		listener(this.getAll());

		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Return all entries in insertion order. */
	getAll(): OverlayEntry[] {
		return [...this.overlays.values()];
	}

	/** Return a single entry by id, or undefined. */
	get(id: string): OverlayEntry | undefined {
		return this.overlays.get(id);
	}

	/** @internal */
	private notify(): void {
		const entries = this.getAll();
		for (const listener of this.listeners) {
			listener(entries);
		}
	}
}

/** Singleton store instance. */
export const overlayStore = new OverlayStore();
