/**
 * Type a string one character at a time with a delay between each keystroke.
 *
 * Required because `stdin.write('abc')` sends the whole string as a single
 * input event (`input.length === 3`), but components like <CommandPalette>
 * only process single-char input (`input.length === 1`). Writing each
 * character separately with a small delay ensures each keystroke becomes
 * its own event and ink re-renders between them.
 */
import {delay, TYPING_DELAY} from './delay.js';

export async function typeString(
	stdin: {write: (input: string) => void},
	text: string,
): Promise<void> {
	for (const char of text) {
		stdin.write(char);
		await delay(TYPING_DELAY);
	}
}
