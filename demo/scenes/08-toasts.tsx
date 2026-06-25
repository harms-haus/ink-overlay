/**
 * Scene 08 — Toasts.
 *
 * Demonstrates BOTH faces of the toast system:
 *
 *   (1) The imperative **toast service** (`toasts`) — a stacking,
 *       auto-dismiss, overlay-registered notification manager that you
 *       drive entirely from event handlers (no JSX). This is the face
 *       you use 99% of the time.
 *
 *   (2) The presentational **`<Toast>` component** — a styled `<Box>`
 *       with a coloured border and icon. It contains ZERO overlay logic;
 *       it is just a pretty frame. The service uses it internally, but
 *       you can also render it yourself anywhere in the tree.
 *
 * ════════════════════════════════════════════════════════════════════
 * Imperative Toast Service
 * ════════════════════════════════════════════════════════════════════
 *
 * The `toasts` object exposes five factory methods plus two dismissal
 * methods. Every factory method shares the same signature:
 *
 *   toasts.success(message: ReactNode, options?: ToastOptions): string
 *   toasts.error  (message: ReactNode, options?: ToastOptions): string
 *   toasts.info   (message: ReactNode, options?: ToastOptions): string
 *   toasts.warn   (message: ReactNode, options?: ToastOptions): string
 *   toasts.show   (message: ReactNode, options?: ToastOptions): string
 *
 * All five return the toast **id** (a string). `show` is an alias for
 * `info`. Each method registers a single toast with the overlay host as
 * part of ONE shared, column-stacked overlay entry.
 *
 * ── ToastOptions ────────────────────────────────────────────────────
 *
 *   duration  number   Auto-dismiss delay in milliseconds.
 *                       Default: 4000.
 *
 *   anchor    Anchor   Which screen corner/edge the stack is pinned to.
 *                       Default: 'bottom-right'. One of the nine Anchor
 *                       values: 'center', 'top', 'bottom', 'left',
 *                       'right', 'top-left', 'top-right',
 *                       'bottom-left', 'bottom-right'.
 *
 *   id        string   Optional stable id. Passing an id that ALREADY
 *                       EXISTS replaces that toast in place instead of
 *                       stacking a new one — demonstrated by the 'r'
 *                       key below, which reuses 'counter' so the toast
 *                       updates rather than multiplies.
 *
 * ── Stacking & eviction rules ───────────────────────────────────────
 *
 *   - At most THREE toasts are visible at once (DEFAULT_MAX_TOASTS = 3).
 *     When a fourth arrives the OLDEST is evicted. Press 'f' to fire
 *     five at once and watch the first two disappear.
 *
 *   - The NEWEST toast appears at the BOTTOM (nearest the anchor corner);
 *     older toasts stack above it.
 *
 *   - The container anchor is pinned from the FIRST-added toast. Adding a
 *     toast with a DIFFERENT anchor does NOT relocate the existing stack
 *     — the new toast joins the current stack at its current corner. See
 *     the 'a' key (anchor='top-left') used after other toasts are
 *     already showing.
 *
 * ── Dismissal ───────────────────────────────────────────────────────
 *
 *   toasts.dismiss(id: string): void     Remove a single toast by id.
 *   toasts.dismissAll(): void            Clear every active toast.
 *
 * (Both return void, so when wiring them into arrow handlers we wrap the
 * call in a block body — see the `no-confusing-void-expression` rule.)
 *
 * ════════════════════════════════════════════════════════════════════
 * Presentational Toast Component
 * ════════════════════════════════════════════════════════════════════
 *
 * `<Toast>` is JUST a styled Box — a rounded border coloured by `kind`,
 * an icon, and the children. It does NOT register an overlay, does NOT
 * auto-dismiss, and does NOT stack. The `toasts` SERVICE handles all of
 * that; the `<Toast>` component is the visual atom the service renders
 * internally, and you may also use it directly for static, inline
 * notifications.
 *
 * ── `<Toast>` props ─────────────────────────────────────────────────
 *
 *   kind     ToastKind   Border + icon colour theme. Default 'info'.
 *                        One of 'success', 'error', 'info', 'warn'.
 *
 *   children ReactNode   The message body.
 *
 *   icon     ReactNode   Override the default icon. Defaults per kind:
 *                        success → ✓, error → ✗, warn → ⚠, info → ℹ.
 *                        Override shown below via ★.
 *
 * ── defaultToastColors ──────────────────────────────────────────────
 *
 *   The `kind`-to-colour mapping used by `<Toast>` (and therefore by the
 *   service):
 *
 *     success → 'green'
 *     error   → 'red'
 *     warn    → 'yellow'
 *     info    → 'blue'
 *
 * @module demo/scenes/08-toasts
 */

import {useState} from 'react';
import {Box, Text} from 'ink';
import {toasts, Toast, defaultToastColors} from '../../src/index.js';
import {SceneShell} from '../ui.js';
import {useGatedInput} from '../hooks.js';

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 08 — the imperative `toasts` service and the presentational
 * `<Toast>` component.
 *
 * Keys (cooperatively gated while a capturing overlay is open):
 *
 *   - `s` → toasts.success('Saved successfully')
 *   - `e` → toasts.error('Something went wrong')
 *   - `i` → toasts.info('For your information')
 *   - `w` → toasts.warn('Heads up!')
 *   - `d` → toasts.dismissAll()
 *   - `r` → toasts.success('Updated counter: N', {id:'counter'})
 *           (reuses id 'counter' so it REPLACES instead of stacking)
 *   - `c` → toasts.info('I last 8 seconds', {duration: 8000})
 *   - `a` → toasts.info('Anchored top-left', {anchor: 'top-left'})
 *   - `f` → fire five quick toasts to demonstrate max-3 eviction
 */
export default function Scene08Toasts() {
	// ── Counter for the id-replace demo ───────────────────────────
	//
	// Each press of 'r' publishes a toast with the SAME id ('counter')
	// but an incremented message. Because the id already exists, the
	// service REPLACES the existing toast instead of stacking a new one.
	const [counter, setCounter] = useState(0);

	// ── Scene input handler ──────────────────────────────────────
	//
	// A single switch (per the `unicorn/prefer-switch` rule) dispatches
	// the toast keys. Each arm calls a `toasts` factory method or a
	// dismissal method.
	//
	// Note: the void-returning methods (`dismiss`, `dismissAll`) are
	// wrapped in block bodies to satisfy `no-confusing-void-expression`.
	useGatedInput(input => {
		switch (input) {
			// ── success ───────────────────────────────────────
			// toasts.success(message, options?) → string
			// Default kind 'success' → green border + ✓ icon.
			case 's': {
				toasts.success('Saved successfully');
				break;
			}

			// ── error ─────────────────────────────────────────
			// toasts.error(message, options?) → string
			// Default kind 'error' → red border + ✗ icon.
			case 'e': {
				toasts.error('Something went wrong');
				break;
			}

			// ── info ──────────────────────────────────────────
			// toasts.info(message, options?) → string
			// Default kind 'info' → blue border + ℹ icon.
			case 'i': {
				toasts.info('For your information');
				break;
			}

			// ── warn ──────────────────────────────────────────
			// toasts.warn(message, options?) → string
			// Default kind 'warn' → yellow border + ⚠ icon.
			case 'w': {
				toasts.warn('Heads up!');
				break;
			}

			// ── dismissAll ────────────────────────────────────
			// toasts.dismissAll(): void — clears every active
			// toast. Wrapped in a block body because it returns
			// void (no-confusing-void-expression).
			case 'd': {
				toasts.dismissAll();
				break;
			}

			// ── id-replace ────────────────────────────────────
			// Reuses the stable id 'counter'. Because that id
			// already exists after the first press, subsequent
			// presses REPLACE the toast in place instead of
			// stacking. The counter is incremented AFTER publishing
			// so the next press shows the next number.
			case 'r': {
				toasts.success(`Updated counter: ${counter}`, {
					id: 'counter',
				});
				setCounter(c => c + 1);
				break;
			}

			// ── custom duration ───────────────────────────────
			// duration: 8000 — this toast lingers twice as long as
			// the default 4000ms before auto-dismissing.
			case 'c': {
				toasts.info('I last 8 seconds', {duration: 8000});
				break;
			}

			// ── custom anchor ─────────────────────────────────
			// anchor: 'top-left' — pins THIS toast to the top-left
			// corner. NOTE: if other toasts are already visible the
			// container anchor is already pinned from the FIRST
			// toast, so this new toast joins the existing stack
			// rather than relocating it. To see top-left anchoring
			// cleanly, press 'd' first to clear, then 'a'.
			case 'a': {
				toasts.info('Anchored top-left', {anchor: 'top-left'});
				break;
			}

			// ── eviction demo ─────────────────────────────────
			// Fires five toasts in rapid succession. Because
			// DEFAULT_MAX_TOASTS is 3, the oldest two are evicted
			// as the newer ones arrive — you end up seeing only the
			// last three. We use a for...of loop (per the
			// unicorn/no-array-for-each rule) over a literal array.
			case 'f': {
				for (const n of [1, 2, 3, 4, 5]) {
					toasts.info(`Flood toast ${n}`);
				}

				break;
			}

			default: {
				break;
			}
		}
	});

	// ── Render ───────────────────────────────────────────────────

	return (
		<SceneShell
			title="Scene 08 — Toasts"
			description="Imperative toast service + presentational <Toast> component"
			hints={[
				{key: 's', label: 'success'},
				{key: 'e', label: 'error'},
				{key: 'i', label: 'info'},
				{key: 'w', label: 'warn'},
				{key: 'd', label: 'dismissAll'},
				{key: 'r', label: 'id-replace'},
				{key: 'c', label: '8s duration'},
				{key: 'a', label: 'anchor'},
				{key: 'f', label: 'flood (eviction)'},
				{key: 'Esc', label: 'menu'},
			]}
		>
			{/* ── Instructional copy ──────────────────────────────── */}
			<Box flexDirection="column">
				<Text>
					Press the keys below to fire toasts via the imperative service.
				</Text>
				<Text dimColor>
					At most three are visible; the newest sits nearest the anchor corner.
				</Text>
			</Box>

			{/*
			 * ════════════════════════════════════════════════════════
			 * Presentational <Toast> component — static, inline examples.
			 *
			 * These toasts are NOT registered with the overlay host. They
			 * are plain styled Boxes rendered directly in the scene flow,
			 * shown here to contrast the component (pure presentation)
			 * with the service (overlay-registered, stacking,
			 * auto-dismissing).
			 *
			 * ── defaultToastColors ───────────────────────────────
			 *   success → 'green', error → 'red',
			 *   warn → 'yellow', info → 'blue'.
			 *
			 * ── Default icons (overridable via the `icon` prop) ──
			 *   success → ✓, error → ✗, warn → ⚠, info → ℹ.
			 * ════════════════════════════════════════════════════════
			 */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Presentational &lt;Toast&gt; (no overlay logic):</Text>
				<Box flexDirection="row" gap={1} marginTop={1}>
					{/*
					 * kind defaults per ToastKind. The border colour comes
					 * from defaultToastColors[kind]; the icon from the
					 * default icon map (✓ ✗ ⚠ ℹ).
					 */}
					<Toast kind="success">Static success</Toast>
					<Toast kind="error">Static error</Toast>
					<Toast kind="warn">Static warn</Toast>
					<Toast kind="info">Static info</Toast>
				</Box>

				{/*
				 * Custom icon override. The `icon` prop accepts any
				 * ReactNode; here we pass the string '★', which replaces
				 * the default 'ℹ' for kind='info'. The border colour
				 * still follows defaultToastColors (info → blue).
				 */}
				<Box marginTop={1}>
					<Toast kind="info" icon="★">
						Custom icon
					</Toast>
				</Box>
			</Box>

			{/*
			 * ── defaultToastColors reference ─────────────────────
			 *
			 * Rendered as a dim legend so the kind→colour mapping is
			 * visible at a glance. defaultToastColors is the same map the
			 * <Toast> component (and the service) use internally.
			 */}
			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>defaultToastColors:</Text>
				<Text dimColor>
					success→{defaultToastColors.success}, error→
					{defaultToastColors.error}, warn→{defaultToastColors.warn}, info→
					{defaultToastColors.info}
				</Text>
			</Box>
		</SceneShell>
	);
}
