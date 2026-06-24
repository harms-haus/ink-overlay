/**
 * Strip ANSI escape sequences from a raw ink frame.
 *
 * Uses the broader CSI-aware pattern (`ESC[...letter`) so that cursor
 * moves, color codes, and other terminal escape sequences are all removed —
 * leaving plain text + layout for content/position assertions.
 */

const ESC = '\u001B';

// Built via RegExp constructor to satisfy no-control-regex / escape-case.
const ansiPattern = new RegExp(`${ESC}\\[[\\d;?]*[a-zA-Z]`, 'g');

export function stripAnsi(input: string): string {
	return input.replaceAll(ansiPattern, '');
}
