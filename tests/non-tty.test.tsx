/**
 * Integration tests for non-TTY / non-interactive environments.
 *
 * B5 refinement: when stdin.isTTY is false, isRawModeSupported is false.
 * The InputDispatcher's useInput has isActive:false (no setRawMode call)
 * and the host never toggles raw mode. Rendering a capturing layer with
 * an opaque backdrop must NOT throw, and the backdrop/content should
 * still render (capture is a visual no-op for input).
 *
 * Uses createResizableStdout + real ink render() with stdin.isTTY
 * forced to false. REAL timers.
 */
import {test, expect, afterEach} from 'vitest';
import {Text, render} from 'ink';
import {OverlayHost, Layer} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {createResizableStdout} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';

// ── Cleanup ─────────────────────────────────────────────────────────

let active: {unmount: () => void; cleanup: () => void} | undefined;

afterEach(() => {
	active?.unmount();
	active?.cleanup();
	active = undefined;
	overlayStore.closeAll();
});

// ── Non-TTY: capturing layer does not throw, backdrop still renders ──

test('non-tty: capturing layer with opaque backdrop does not throw and still renders under non-TTY stdin', async () => {
	const {stdout, stdin, cleanup, lastFrame} = createResizableStdout({
		columns: 80,
		rows: 24,
	});

	// Force the fake stdin to report isTTY = false, simulating a
	// non-interactive (piped / CI) environment. Ink derives
	// isRawModeSupported from stdin.isTTY, so this makes it false.
	Object.defineProperty(stdin, 'isTTY', {
		value: false,
		configurable: true,
		writable: true,
	});

	// Rendering must NOT throw — isRawModeSupported is false so the
	// InputDispatcher's useInput has isActive:false and the host never
	// calls setRawMode.
	let instance: ReturnType<typeof render> | undefined;
	expect(() => {
		instance = render(
			<OverlayHost>
				<Layer capture backdrop='opaque' anchor='center'>
					<Text>NON-TTY-LAYER</Text>
				</Layer>
			</OverlayHost>,
			{
				stdout,
				stdin,
				debug: false,
				exitOnCtrlC: false,
				patchConsole: false,
			},
		);
	}).not.toThrow();

	active = {
		unmount() {
			instance?.unmount();
		},
		cleanup,
	};

	await delay(200);

	// The backdrop and content should still render even though input
	// capture is a no-op under non-TTY.
	expect(lastFrame()).toContain('NON-TTY-LAYER');
});
