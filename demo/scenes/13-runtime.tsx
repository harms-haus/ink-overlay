/**
 * Scene 13 — Runtime & Environments.
 *
 * Demonstrates runtime environment detection and graceful-degradation
 * behaviour: what works, what does not, and how `ink-overlay` degrades
 * safely when the host environment cannot support interactive input.
 *
 * ════════════════════════════════════════════════════════════════════
 * Runtime Detection & Graceful Degradation
 * ════════════════════════════════════════════════════════════════════
 *
 * `ink-overlay` ships four small detection helpers in `src/runtime.ts`.
 * None of them mutate global state on import — detection is purely
 * lazy / function-call-based and safe to invoke from any context (a hook,
 * a plain function, module top-level, etc.). This is an intentional
 * design decision: importing the library must NEVER have side effects,
 * so that test harnesses, build tools, and non-interactive runners can
 * load the module without accidentally flipping raw mode or emitting
 * warnings.
 *
 * ── The four functions ──────────────────────────────────────────────
 *
 *   isBun()
 *     Returns `true` when `globalThis.Bun` is defined — i.e. the code
 *     is executing under the Bun JavaScript runtime (as opposed to
 *     Node.js). This is a cheap property check; it does not touch stdin
 *     or stdout.
 *
 *   isNonInteractive()
 *     Returns `true` when `process.stdout` lacks `isTTY` OR when
 *     `process.env.CI` is truthy. This mirrors ink's own interactive
 *     detection. A CI runner (GitHub Actions, GitLab CI, etc.) or a
 *     piped stdout stream counts as non-interactive.
 *
 *   isRawModeSupported()
 *     Returns `true` when `process.stdin` is a TTY. Raw mode — the
 *     key-by-key input capture that ink's `useInput` relies on —
 *     requires a real TTY on stdin. When stdin is piped or absent,
 *     raw mode cannot be engaged and interactive keyboard handlers
 *     are inert.
 *
 *   getRuntimeInfo()
 *     A one-call convenience snapshot that returns `{bun, interactive,
 *     rawModeSupported}`. `interactive` is the inverse of
 *     `isNonInteractive()`; `bun` and `rawModeSupported` are pass-throughs.
 *
 * ── Why these matter: Bun's input limitation ───────────────────────
 *
 * Under Bun, rendering works fine — ink paints to stdout, overlays
 * stack, backdrops dim — but interactive input is non-functional due
 * to oven-sh/bun#6862 (Bun does not call `process.stdin.resume()`).
 * That means ink's `useInput` never receives key events, so focus
 * trapping, keyboard dismissal (`Esc`), and the `InputDispatcher` LIFO
 * are all dead. Overlays render but do not respond to the keyboard.
 * The library detects this via `isBun()` and, when a capturing layer
 * first mounts, emits a one-time console warning via `warnBunInput()`.
 * For interactive features, use Node.
 *
 * ── Why these matter: non-TTY / CI sessions ────────────────────────
 *
 * In non-interactive sessions (piped stdout, CI runners), layers still
 * render their backdrops and content — the visual side works — but
 * input is inert. `InputDispatcher`'s internal `useInput` is created
 * with `isActive: false`, so `setRawMode` is never called and no key
 * events are dispatched. This is the correct graceful-degradation
 * behaviour: a screenshot or CI smoke test can still verify that
 * overlays render, even though keyboard interaction is unavailable.
 *
 * ── Design principle: no side effects on import ────────────────────
 *
 * Every detection function in `src/runtime.ts` is a pure query. There
 * is no module-level `setRawMode`, no global listener registration,
 * no `console.warn` on import. The only side-effectful helper —
 * `warnBunInput()` — is called lazily (when a capturing layer mounts),
 * never during module evaluation. This keeps the library safe to
 * import from any environment without surprising the host application.
 *
 * This scene is purely informational / display-only: it calls
 * `getRuntimeInfo()`, `isBun()`, and `isNonInteractive()` and prints
 * the results. There is NO `useInput` here — the scene has no keys of
 * its own (the menu's `Esc` handler is managed externally).
 *
 * @module demo/scenes/13-runtime
 */

import {Box, Text} from 'ink';
import {isBun, isNonInteractive, getRuntimeInfo} from '../../src/index.js';
import {SceneShell} from '../ui.js';

// ── Component ───────────────────────────────────────────────────────

/**
 * Scene 13 — runtime environment detection & graceful-degradation
 * display.
 *
 * This is a read-only scene: it queries the runtime helpers and renders
 * a table-like summary plus explanatory text. There is no keyboard
 * interaction and no `useInput` — the only key hint (`Esc`) is handled
 * by the external demo menu, not by this component.
 */
export default function Scene13Runtime() {
	// ── Snapshot the runtime environment ─────────────────────────────
	//
	// getRuntimeInfo() is a one-call convenience that returns a single
	// object: {bun, interactive, rawModeSupported}. `interactive` is the
	// inverse of isNonInteractive(); `bun` and `rawModeSupported` are
	// direct pass-throughs of isBun() and isRawModeSupported()
	// respectively. All three fields are booleans.
	const info = getRuntimeInfo();

	// ── Cross-check the scalar helpers ───────────────────────────────
	//
	// We also call isBun() and isNonInteractive() directly. These should
	// always agree with the snapshot: info.bun === isBun() and
	// !info.interactive === isNonInteractive(). Displaying both proves
	// that the aggregate and scalar forms are consistent.
	const bunScalar = isBun();
	const nonInteractiveScalar = isNonInteractive();

	return (
		<SceneShell
			title="13 · Runtime & Environments"
			description="Detection & graceful degradation"
			hints={[{key: 'Esc', label: 'back to menu'}]}
		>
			{/* ════════════════════════════════════════════════════════ */}
			{/* Runtime Detection & Graceful Degradation               */}
			{/* ════════════════════════════════════════════════════════ */}
			<Box flexDirection="column">
				{/* ── Detection results table ──────────────────────── */}
				{/*
				 * Each row is a two-column Box: a dim label on the left
				 * and the boolean result on the right (green ✓ or red ✗).
				 * We use fixed-width label padding so the results align
				 * vertically into a readable column.
				 */}
				<Box flexDirection="column">
					{/* Runtime: Bun? — isBun() returns true when          */}
					{/* globalThis.Bun is defined (the Bun JS runtime).     */}
					<Box flexDirection="row">
						<Text dimColor>{'Runtime:    Bun?'}</Text>
						<Text>{info.bun ? ' ✓ Yes' : ' ✗ No (Node)'}</Text>
					</Box>

					{/* Interactive: — info.interactive is the inverse of  */}
					{/* isNonInteractive(), which returns true when         */}
					{/* process.stdout lacks isTTY OR process.env.CI is    */}
					{/* truthy.                                            */}
					<Box flexDirection="row">
						<Text dimColor>{'Interactive:'}</Text>
						<Text>
							{info.interactive ? ' ✓ Yes (TTY)' : ' ✗ No (CI / non-TTY)'}
						</Text>
					</Box>

					{/* Raw mode: — isRawModeSupported() returns true      */}
					{/* when process.stdin is a TTY. Without a TTY on       */}
					{/* stdin, raw-mode key capture cannot be engaged.      */}
					<Box flexDirection="row">
						<Text dimColor>{'Raw mode:   '}</Text>
						<Text>
							{info.rawModeSupported ? ' ✓ Supported' : ' ✗ Not supported'}
						</Text>
					</Box>
				</Box>

				{/* ── Scalar cross-check ───────────────────────────── */}
				{/*
				 * The scalar helpers should always agree with the
				 * getRuntimeInfo() snapshot. Showing both proves the
				 * aggregate and scalar APIs are consistent.
				 */}
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						{`isBun()             → ${bunScalar ? 'true' : 'false'} (matches info.bun)`}
					</Text>
					<Text dimColor>
						{`isNonInteractive()  → ${nonInteractiveScalar ? 'true' : 'false'} (matches !info.interactive)`}
					</Text>
				</Box>

				{/* ── Explanatory notes ────────────────────────────── */}
				{/*
				 * WHY (Bun limitation): under Bun, rendering works but
				 * interactive input is non-functional due to
				 * oven-sh/bun#6862 (Bun does not call
				 * process.stdin.resume()). ink's useInput never fires,
				 * so focus trapping, keyboard dismissal, and the
				 * InputDispatcher LIFO are all dead. Overlays render
				 * but do not respond to the keyboard — use Node for
				 * interactive features.
				 */}
				<Box marginTop={1} flexDirection="column">
					<Text bold>Limitations & graceful degradation</Text>

					<Box marginTop={1} flexDirection="column">
						<Text>
							<Text bold color="yellow">
								Bun:
							</Text>{' '}
							rendering works, but interactive input is non-functional
							(oven-sh/bun#6862 — Bun does not call process.stdin.resume()).
							Overlays render but do not respond to keyboard. Use Node for
							interactive features.
						</Text>

						{/*
						 * WHY (non-TTY / CI): in non-interactive sessions,
						 * layers render their backdrops and content, but
						 * input is inert. InputDispatcher's internal
						 * useInput has isActive:false; setRawMode is never
						 * called, so no key events are dispatched.
						 */}
						<Box marginTop={1}>
							<Text>
								<Text bold color="yellow">
									Non-TTY / CI:
								</Text>{' '}
								layers render their backdrops and content, but input is inert
								(InputDispatcher's useInput has isActive:false; setRawMode is
								never called). Overlays are visible but keyboard interaction is
								unavailable.
							</Text>
						</Box>

						{/*
						 * WHY (design): all detection functions have NO
						 * side effects on import. Detection is lazy /
						 * function-call-based and safe to call from any
						 * context. The only side-effectful helper,
						 * warnBunInput(), is called lazily when a
						 * capturing layer mounts — never during module
						 * evaluation.
						 */}
						<Box marginTop={1}>
							<Text>
								<Text bold color="yellow">
									Design:
								</Text>{' '}
								all detection functions have no side effects on import —
								detection is lazy / function-call-based and safe to call from
								any context.
							</Text>
						</Box>
					</Box>
				</Box>
			</Box>
		</SceneShell>
	);
}
