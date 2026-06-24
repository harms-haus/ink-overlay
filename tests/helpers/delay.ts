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
