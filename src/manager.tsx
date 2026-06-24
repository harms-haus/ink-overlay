/**
 * OverlayManager + toast service for @harms-haus/ink-overlay.
 *
 * - `overlay` — thin imperative wrapper around {@link overlayStore}.
 * - `toasts` — stacking auto-dismiss toast service built on top of
 *   the overlay store.
 *
 * No side effects on import.
 *
 * @module manager
 */

import {type ReactNode} from 'react';
import {Box} from 'ink';
import {overlayStore} from './store.js';
import {Toast} from './toast.js';
import {generateId} from './id.js';
import type {
	LayerOpts, ToastKind, ToastOptions, Anchor,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════
// (a) OverlayManager — thin wrapper around overlayStore
// ═══════════════════════════════════════════════════════════════════

export type OverlayManager = {
	open(content: ReactNode, options?: LayerOpts): string;
	close(id: string): void;
	closeAll(): void;
	update(id: string, patch: Partial<LayerOpts>, newContent?: ReactNode): void;
};

export const overlay: OverlayManager = {
	open(content, options = {}) {
		return overlayStore.open(content, options);
	},

	close(id) {
		overlayStore.close(id);
	},

	closeAll() {
		overlayStore.closeAll();
	},

	update(id, patch, newContent) {
		overlayStore.update(id, patch, newContent);
	},
};

// ═══════════════════════════════════════════════════════════════════
// (b) Toast service — stacking auto-dismiss toasts
// ═══════════════════════════════════════════════════════════════════

export type ToastService = {
	show(message: ReactNode, options?: ToastOptions): string;
	success(message: ReactNode, options?: ToastOptions): string;
	error(message: ReactNode, options?: ToastOptions): string;
	info(message: ReactNode, options?: ToastOptions): string;
	warn(message: ReactNode, options?: ToastOptions): string;
	dismiss(id: string): void;
	dismissAll(): void;
};

// ── Internal state ───────────────────────────────────────────────

type InternalToast = {
	kind: ToastKind;
	message: ReactNode;
	duration: number;
	anchor: Anchor;
};

/** Active toasts — separate from the overlay store. */
const toastMap = new Map<string, InternalToast>();

/** Auto-dismiss timers keyed by toast id. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** The overlay store entry id for the combined toast layer. */
let currentOverlayId: string | null = null;

/** Default duration for toasts (ms). */
const DEFAULT_DURATION = 4000;

/** Default anchor for the toast container. */
const DEFAULT_ANCHOR: Anchor = 'bottom-right';

/** Maximum number of visible toasts before oldest are evicted. */
const DEFAULT_MAX_TOASTS = 3;

// ── Overlay store opts for the toast container ──────────────────

const TOAST_BASE_OPTS: LayerOpts = {
	anchor: DEFAULT_ANCHOR,
	capture: false,
	backdrop: 'none',
	z: 90,
};

// ── Helpers ─────────────────────────────────────────────────────

function toastId(): string {
	return generateId('toast-');
}

function clearTimer(id: string): void {
	const timer = timers.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		timers.delete(id);
	}
}

/**
 * Re-publish the combined toast content to the overlay store.
 *
 * If an overlay entry already exists, updates it in place (single notify).
 * Otherwise opens a new entry. If the toast map is empty, closes the
 * existing entry (if any).
 */
function publishToasts(): void {
	// Nothing to show — close existing entry if present.
	if (toastMap.size === 0) {
		if (currentOverlayId !== null) {
			overlayStore.close(currentOverlayId);
			currentOverlayId = null;
		}

		return;
	}

	// Pin anchor from the FIRST (oldest) toast — not the last —
	// so adding a toast with a different anchor doesn't relocate
	// the existing stack.
	const firstKey = toastMap.keys().next().value;
	const anchor: Anchor = firstKey === undefined
		? DEFAULT_ANCHOR
		: (toastMap.get(firstKey)!.anchor);

	// Build the combined content — column-reverse so newest is at the bottom.
	const entries = [...toastMap.entries()];
	const content = (
		<Box flexDirection='column-reverse'>
			{entries.map(([id, t]) => (
				<Toast key={id} kind={t.kind}>{t.message}</Toast>
			))}
		</Box>
	);

	const opts = {...TOAST_BASE_OPTS, anchor};

	if (currentOverlayId === null) {
		currentOverlayId = overlayStore.open(content, opts);
	} else {
		// Update existing entry in place — single notify, no close+open flicker.
		overlayStore.update(currentOverlayId, opts, content);
	}
}

/**
 * Schedule auto-dismiss for a toast. When the timer fires the toast is
 * removed from the map and the overlay is re-published.
 */
function scheduleDismiss(id: string): void {
	const entry = toastMap.get(id);
	if (entry === undefined) {
		return;
	}

	const timer = setTimeout(() => {
		dismissToast(id);
	}, entry.duration);

	timers.set(id, timer);
}

/** Remove a single toast, clear its timer, and re-publish. */
function dismissToast(id: string): void {
	if (!toastMap.has(id)) {
		return;
	}

	clearTimer(id);
	toastMap.delete(id);
	publishToasts();
}

/**
 * Core implementation shared by show / success / error / info / warn.
 *
 * @returns The toast id.
 */
function addToast(
	kind: ToastKind,
	message: ReactNode,
	options?: ToastOptions,
): string {
	const id = options?.id ?? toastId();

	// If caller provided an id that already exists, dismiss the old one first.
	if (toastMap.has(id)) {
		dismissToast(id);
	}

	const anchor = options?.anchor ?? DEFAULT_ANCHOR;
	const duration = options?.duration ?? DEFAULT_DURATION;

	// Evict the oldest toast when at capacity.
	while (toastMap.size >= DEFAULT_MAX_TOASTS) {
		const oldestKey = toastMap.keys().next().value!;
		dismissToast(oldestKey);
	}

	toastMap.set(id, {
		kind, message, duration, anchor,
	});

	publishToasts();
	scheduleDismiss(id);

	return id;
}

// ┐────────────────────────────────────────────────────────────────
// └── Public API ────────────────────────────────────────────────

/**
 * Stacking auto-dismiss toast service.
 *
 * All active toasts are rendered as a single overlay store entry using
 * `<Box flexDirection="column-reverse">` so the newest toast appears
 * at the bottom (near the anchor corner) and older toasts stack
 * naturally above it.
 */
export const toasts: ToastService = {
	show(message, options) {
		return addToast('info', message, options);
	},

	success(message, options) {
		return addToast('success', message, options);
	},

	error(message, options) {
		return addToast('error', message, options);
	},

	info(message, options) {
		return addToast('info', message, options);
	},

	warn(message, options) {
		return addToast('warn', message, options);
	},

	dismiss(id) {
		dismissToast(id);
	},

	dismissAll() {
		// Clear all timers.
		for (const id of timers.keys()) {
			clearTimer(id);
		}

		toastMap.clear();
		publishToasts();
	},
};

// ── Exported for testing ────────────────────────────────────────

/** @internal Visible for testing — reset the toast overlay id. */
export function _resetToastOverlayId(): void {
	currentOverlayId = null;
}

/** @internal Visible for testing — get the current overlay id. */
export function _getToastOverlayId(): string | null {
	return currentOverlayId;
}
