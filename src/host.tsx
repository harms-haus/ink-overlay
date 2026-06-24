/**
 * OverlayHost — root provider component for the overlay system.
 *
 * Mounts once at the top of the app tree. Provides context for declarative
 * `<Layer>` children and subscribes to the imperative {@link overlayStore}.
 * Manages raw-mode, focus trapping, and layer merging/sorting.
 *
 * ## Architecture
 *
 * - **Declarative layers** are registered via context (`registerLayer` / etc.)
 *   and stored in a mutable ref. Each gets a monotonically-increasing `order`.
 * - **Imperative layers** come from {@link overlayStore.subscribe} and live
 *   in a separate ref. They receive orders from a high base to keep them
 *   deterministically after declarative layers at the same z.
 * - A single `version` state counter is bumped to trigger re-renders when
 *   either map changes. React nodes are never stored in state.
 *
 * @module host
 */

import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {Box, useStdin, useFocusManager, useWindowSize} from 'ink';
import {InputDispatcher} from './input-dispatcher.js';
import {LayerRenderer} from './layer.js';
import {
	OverlayHostContext,
	type OverlayHostContextValue,
} from './host-context.js';
import {overlayStore} from './store.js';
import {sortLayers} from './primitives.js';
import {warnBunInput} from './runtime.js';
import {resolveTransition} from './animation.js';
import type {OverlayDescriptor, OverlayEntry} from './types.js';

// ── Props ───────────────────────────────────────────────────────────

export type OverlayHostProps = {
	children: ReactNode;
};

// ── Constants ───────────────────────────────────────────────────────

/**
 * Orders for imperative overlays start here so they always sort after
 * declarative overlays at the same z-level.
 */
const IMPERATIVE_ORDER_BASE = 10_000_000;

// ── Helper: OverlayEntry → OverlayDescriptor ────────────────────────

function entryToDescriptor(
	entry: OverlayEntry,
	order: number,
): OverlayDescriptor {
	const {opts} = entry;
	return {
		id: entry.id,
		z: opts.z ?? 0,
		order,
		capture: opts.capture ?? false,
		backdrop: opts.backdrop ?? 'none',
		backdropColor: opts.backdropColor,
		role: opts.role,
		anchor: opts.anchor,
		content: entry.content,
		overflow: opts.overflow ?? 'hidden',
		margin: opts.margin,
		transition: resolveTransition(opts.transition),
		onDismiss: opts.onDismiss,
		onBackdropInput: opts.onBackdropInput,
	};
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Root overlay provider.
 *
 * Wraps children in an {@link InputDispatcher} and the
 * {@link OverlayHostContext}. Declarative layers rendered inside this
 * provider (via `<Layer>`) and imperative layers opened through
 * {@link overlayStore} are merged, sorted, and rendered via
 * {@link LayerRenderer}.
 */
export function OverlayHost({children}: OverlayHostProps) {
	// ── Version counter — bumped to trigger re-renders ──────────────
	const [, setVersion] = useState(0);
	const bumpVersion = useCallback(() => {
		setVersion(v => v + 1);
	}, []);

	// ── Declarative layers (registered via context) ─────────────────
	const declarativeLayersReference = useRef(
		new Map<string, OverlayDescriptor>(),
	);
	const orderCounterReference = useRef(0);

	// ── Imperative layers (from overlayStore) ───────────────────────
	const imperativeLayersReference = useRef<OverlayEntry[]>([]);
	const imperativeOrderCacheReference = useRef(new Map<string, number>());
	const imperativeOrderCounterReference = useRef(IMPERATIVE_ORDER_BASE);

	// ── Ink hooks (read once at the top) ────────────────────────────
	const {isRawModeSupported, setRawMode} = useStdin();
	const {disableFocus, enableFocus} = useFocusManager();
	const {rows: terminalRows} = useWindowSize();

	// ── Context methods ─────────────────────────────────────────────

	const registerLayer = useCallback(
		(descriptor: Omit<OverlayDescriptor, 'order'>) => {
			const order = orderCounterReference.current++;
			declarativeLayersReference.current.set(descriptor.id, {
				...descriptor,
				order,
			});
			bumpVersion();
		},
		[bumpVersion],
	);

	const unregisterLayer = useCallback(
		(id: string) => {
			declarativeLayersReference.current.delete(id);
			bumpVersion();
		},
		[bumpVersion],
	);

	const updateLayer = useCallback(
		(id: string, patch: Partial<OverlayDescriptor>) => {
			const existing = declarativeLayersReference.current.get(id);
			if (existing) {
				declarativeLayersReference.current.set(id, {...existing, ...patch});
				bumpVersion();
			}
		},
		[bumpVersion],
	);

	const onLayerExited = useCallback(
		(id: string) => {
			unregisterLayer(id);
		},
		[unregisterLayer],
	);

	// ── Memoised context value (stable across renders) ──────────────
	const context: OverlayHostContextValue = useMemo(
		() => ({
			registerLayer,
			unregisterLayer,
			updateLayer,
			onLayerExited,
		}),
		[registerLayer, unregisterLayer, updateLayer, onLayerExited],
	);

	// ── Subscribe to imperative store ────────────────────────────────
	useEffect(
		() =>
			overlayStore.subscribe(entries => {
				// Prune order-cache entries for layers no longer present.
				const activeIds = new Set(entries.map(e => e.id));
				for (const id of imperativeOrderCacheReference.current.keys()) {
					if (!activeIds.has(id)) {
						imperativeOrderCacheReference.current.delete(id);
					}
				}

				imperativeLayersReference.current = entries;
				bumpVersion();
			}),
		[bumpVersion],
	);

	// ── Merge + sort layers (computed during render) ────────────────

	const declarativeDescriptors = [
		...declarativeLayersReference.current.values(),
	];

	const imperativeDescriptors: OverlayDescriptor[] =
		imperativeLayersReference.current.map(entry => {
			// Stable order assignment via cache.
			let order = imperativeOrderCacheReference.current.get(entry.id);
			if (order === undefined) {
				order = imperativeOrderCounterReference.current++;
				imperativeOrderCacheReference.current.set(entry.id, order);
			}

			return entryToDescriptor(entry, order);
		});

	const sortedLayers = sortLayers([
		...declarativeDescriptors,
		...imperativeDescriptors,
	]);

	// ── Capturing count (raw-mode & focus gating) ───────────────────

	const capturingCount = sortedLayers.filter(
		l => l.capture && !l.exiting,
	).length;

	// ── Raw-mode management ─────────────────────────────────────────

	const previousCapturingCountReference = useRef(0);

	useEffect(() => {
		const previous = previousCapturingCountReference.current;
		previousCapturingCountReference.current = capturingCount;

		if (previous === 0 && capturingCount > 0) {
			// 0 → positive: enable raw mode.
			if (isRawModeSupported) {
				try {
					setRawMode(true);
				} catch (error) {
					console.warn('[@harms-haus/ink-overlay] setRawMode failed:', error);
				}
			}

			warnBunInput();
		} else if (
			previous > 0 &&
			capturingCount === 0 && // Positive → 0: disable raw mode.
			isRawModeSupported
		) {
			try {
				setRawMode(false);
			} catch (error) {
				console.warn('[@harms-haus/ink-overlay] setRawMode failed:', error);
			}
		}
	}, [capturingCount, isRawModeSupported, setRawMode]);

	// ── Focus management ────────────────────────────────────────────

	const previousFocusCountReference = useRef(0);

	useEffect(() => {
		const previous = previousFocusCountReference.current;
		previousFocusCountReference.current = capturingCount;

		if (previous === 0 && capturingCount > 0) {
			disableFocus();
		} else if (previous > 0 && capturingCount === 0) {
			enableFocus();
		}
	}, [capturingCount, disableFocus, enableFocus]);

	// ── Unmount cleanup (raw-mode + focus) ─────────────────────────
	// Read prevCapturingCountRef INSIDE the cleanup so we always see the
	// last-committed value — not the value at setup time (which would be
	// 0 because the deps are stable and setup runs only once at mount).
	useEffect(
		() => () => {
			if (previousCapturingCountReference.current > 0) {
				if (isRawModeSupported) {
					try {
						setRawMode(false);
					} catch (error) {
						console.warn('[@harms-haus/ink-overlay] setRawMode failed:', error);
					}
				}

				enableFocus();
			}
		},
		[isRawModeSupported, setRawMode, enableFocus],
	);

	// ── Render ──────────────────────────────────────────────────────

	return (
		<InputDispatcher>
			<OverlayHostContext.Provider value={context}>
				<Box
					position="relative"
					width="100%"
					height={terminalRows}
					flexDirection="column"
				>
					{children}
					{sortedLayers.map(desc => (
						<LayerRenderer key={desc.id} descriptor={desc} />
					))}
				</Box>
			</OverlayHostContext.Provider>
		</InputDispatcher>
	);
}
