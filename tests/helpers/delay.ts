/**
 * Promise-based delay using real timers.
 *
 * Ink relies on real timers internally — fake timers break its rendering loop.
 * Every test that uses Ink's real render() must `await delay(...)` after
 * rendering or input to give the event loop time to flush frames.
 */
export async function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

// ── Shared timing constants ─────────────────────────────────────────

/**
 * Delay between individual keystrokes when using `typeString`.
 *
 * `stdin.write` delivers the whole string as one input event, but the
 * command-palette handler only processes single-char input. Characters
 * must be sent one at a time with a small gap so each becomes its own
 * event and ink has time to re-render between them.
 */
export const TYPING_DELAY = 80;

/**
 * Delay after pressing a single key (arrow / enter / esc) to let ink
 * re-render the resulting frame before the next interaction.
 */
export const KEY_PRESS_DELAY = 150;

/**
 * Common post-render settle delay — gives ink's rendering loop enough
 * time to flush the initial frame(s) after `renderWithHost`.
 */
export const RENDER_DELAY = 200;

/**
 * Long settle delay used by animation tests. Transitions step on a
 * ~80ms `setInterval`, so we wait 500ms to let a full enter/exit
 * animation play out.
 */
export const LONG_RENDER_DELAY = 500;

/**
 * Initial render settle delay after `renderWithHost`. Gives ink's
 * rendering loop extra time to flush the first frame(s) of a freshly
 * mounted component tree (slightly longer than `RENDER_DELAY` which
 * is used for post-interaction settles).
 */
export const INITIAL_RENDER_DELAY = 300;

/**
 * Post-resize settle delay — gives ink time to reposition layers after
 * a terminal dimensions change.
 */
export const RESIZE_SETTLE_DELAY = 100;

/**
 * Short cleanup delay used in `afterEach` hooks to let ink's render
 * loop settle between tests.
 */
export const CLEANUP_DELAY = 50;
