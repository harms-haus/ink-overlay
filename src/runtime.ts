/**
 * Runtime environment detection & safe-degradation helpers.
 *
 * Design constraint: NO global side effects on import.
 * All detection is lazy / function-call-based.
 */

/**
 * Detect if running under Bun.
 *
 * @returns `true` when `globalThis.Bun` is defined.
 */
export function isBun(): boolean {
	return globalThis.Bun !== undefined;
}

/**
 * Detect if the session is non-interactive.
 *
 * Mirrors ink's interactive detection: non-interactive when stdout is not a TTY
 * **or** when running inside a CI environment.
 *
 * @returns `true` when `process.stdout` lacks `isTTY` or `process.env.CI` is truthy.
 */
export function isNonInteractive(): boolean {
	if (!process.stdout?.isTTY) {
		return true;
	}

	if (process.env['CI']) {
		return true;
	}

	return false;
}

/**
 * Detect whether raw-mode (key-by-key input capture) is supported on stdin.
 *
 * Safe to call from non-hook contexts — performs a simple TTY check without
 * toggling any mode.
 *
 * @returns `true` when `process.stdin` is a TTY.
 */
export function isRawModeSupported(): boolean {
	return Boolean(process.stdin?.isTTY);
}

/**
 * Aggregate runtime environment info.
 */
export type RuntimeInfo = {
	/** Whether the runtime is Bun. */
	bun: boolean;

	/** Whether the session is interactive (`!isNonInteractive()`). */
	interactive: boolean;

	/** Whether raw-mode input is supported. */
	rawModeSupported: boolean;
};

/**
 * Return a snapshot of the current runtime environment.
 *
 * @returns Object with `bun`, `interactive`, and `rawModeSupported` booleans.
 */
export function getRuntimeInfo(): RuntimeInfo {
	return {
		bun: isBun(),
		interactive: !isNonInteractive(),
		rawModeSupported: isRawModeSupported(),
	};
}

let bunWarnEmitted = false;

/**
 * Emit a one-time console warning when interactive input is attempted under Bun.
 *
 * **Call lazily** — when a capturing layer first mounts — never on module import.
 */
export function warnBunInput(): void {
	if (!isBun()) {
		return;
	}

	if (bunWarnEmitted) {
		return;
	}

	bunWarnEmitted = true;

	console.warn(
		'[@harms-haus/ink-overlay] Interactive input (useInput, focus trapping, keyboard dismissal) is not functional under Bun due to bun#6862 (Bun does not call process.stdin.resume()). Overlays will render but not respond to keyboard. Use Node for interactive features.',
	);
}
