import {delay} from './delay.js';

type WaitForFrameOptions = {
	/** Total time to keep polling before failing. */
	timeout?: number;
	/** Delay between polls. */
	interval?: number;
	/** When `false`, assert the text is absent instead of present. */
	present?: boolean;
};

/**
 * Poll `getFrame()` until it reflects the expected content (or absence),
 * resolving once it does. Use this instead of a fixed `delay()` before
 * asserting on async Ink re-renders — it is robust against real-timer
 * render latency on slow or heavily loaded CI runners.
 */
export async function waitForFrame(
	getFrame: () => string,
	expected: string,
	{timeout = 2000, interval = 25, present = true}: WaitForFrameOptions = {},
): Promise<void> {
	const deadline = Date.now() + timeout;

	for (;;) {
		const has = getFrame().includes(expected);
		if (has === present) {
			return;
		}

		if (Date.now() >= deadline) {
			throw new Error(
				`waitForFrame: expected frame to ${
					present ? 'contain' : 'not contain'
				} ${JSON.stringify(expected)} within ${timeout}ms.\n\nLast frame:\n${
					getFrame() ?? '<empty>'
				}`,
			);
		}

		await delay(interval);
	}
}
