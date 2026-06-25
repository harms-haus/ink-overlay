/**
 * Tests for <Popover> — element-anchored floating layer with collision
 * detection and flip behaviour.
 *
 * Uses `renderResizable` for viewport-resize tests (real timers).
 */
import {useRef} from 'react';
import {test, expect, afterEach} from 'vitest';
import {Box, Text, type DOMElement} from 'ink';
import {Popover} from '../src/popover.js';
import {OverlayHost} from '../src/host.js';
import {renderResizable} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';

// ── Cleanup: unmount any render instance left over by a test ────────

let resizableInstance: ReturnType<typeof renderResizable> | undefined;

afterEach(() => {
	resizableInstance?.unmountAndCleanup();
	resizableInstance = undefined;
});

// ── Test 1: basic rendering ─────────────────────────────────────────

test('Popover renders content near the anchor', async () => {
	function App() {
		const anchorReference = useRef<DOMElement | undefined>(null);
		return (
			<OverlayHost>
				<Box flexDirection="column" width={80}>
					<Box ref={anchorReference}>
						<Text>anchor</Text>
					</Box>
				</Box>
				<Popover anchorRef={anchorReference} placement="bottom">
					<Text>pop</Text>
				</Popover>
			</OverlayHost>
		);
	}

	resizableInstance = renderResizable(<App />, {
		columns: 80,
		rows: 24,
	});
	const lastFrame = resizableInstance.lastFrame;

	await delay(500);

	const frame = lastFrame();
	// Both the anchor and the popover content should be visible.
	expect(frame).toContain('anchor');
	expect(frame).toContain('pop');
});

// ── Test 2: pop appears below anchor for bottom placement ────────────

test('Popover with placement="bottom" renders below the anchor', async () => {
	function App() {
		const anchorReference = useRef<DOMElement | undefined>(null);
		return (
			<OverlayHost>
				<Box flexDirection="column" width={80}>
					<Box ref={anchorReference}>
						<Text>anchor</Text>
					</Box>
				</Box>
				<Popover anchorRef={anchorReference} placement="bottom">
					<Text>pop</Text>
				</Popover>
			</OverlayHost>
		);
	}

	resizableInstance = renderResizable(<App />, {
		columns: 80,
		rows: 24,
	});
	const lastFrame = resizableInstance.lastFrame;

	await delay(500);

	const frame = lastFrame();
	expect(frame).toContain('anchor');
	expect(frame).toContain('pop');

	// In ink's output, rows are written top-to-bottom. If the popover
	// is below the anchor, the anchor text appears on an earlier row
	// than the popover text.
	const lines = frame.split('\n');
	const anchorRow = lines.findIndex(line => line.includes('anchor'));
	const popRow = lines.findIndex(line => line.includes('pop'));
	expect(anchorRow).toBeGreaterThanOrEqual(0);
	expect(popRow).toBeGreaterThanOrEqual(0);
	expect(popRow).toBeGreaterThan(anchorRow);
});

// ── Test 3: flip to top when bottom overflows ───────────────────────

test('Popover flips to top when bottom placement overflows the viewport', async () => {
	// Layout: 26-row spacer pushes the anchor near the bottom.
	// Large viewport (30 rows): pop below anchor fits → pop below.
	// After resize to 28 rows: pop below overflows → flip → pop above.
	function App() {
		const anchorReference = useRef<DOMElement | undefined>(null);
		return (
			<OverlayHost>
				<Box flexDirection="column" width={80}>
					<Box height={26}>
						<Text>space</Text>
					</Box>
					<Box ref={anchorReference}>
						<Text>anchor</Text>
					</Box>
				</Box>
				<Popover anchorRef={anchorReference} placement="bottom">
					<Text>pop</Text>
				</Popover>
			</OverlayHost>
		);
	}

	resizableInstance = renderResizable(<App />, {
		columns: 80,
		rows: 30,
	});
	const {resize, lastFrame} = resizableInstance;

	// ── Phase 1: large viewport — pop fits below anchor ──────────────────

	await delay(600);

	const frame1 = lastFrame();
	expect(frame1).toContain('anchor');
	expect(frame1).toContain('pop');

	const lines1 = frame1.split('\n');
	const anchorRow1 = lines1.findIndex(line => line.includes('anchor'));
	const popRow1 = lines1.findIndex(line => line.includes('pop'));

	// Pop should be below anchor → appears on a later row.
	expect(popRow1).toBeGreaterThan(anchorRow1);

	// ── Phase 2: shrink viewport — pop overflows → flip ──────────────

	resize(80, 28);
	await delay(600);

	const frame2 = lastFrame();
	const lines2 = frame2.split('\n');
	const anchorRow2 = lines2.findIndex(line => line.includes('anchor'));
	const popRow2 = lines2.findIndex(line => line.includes('pop'));

	// After flip, pop should be above anchor → appears on an earlier row.
	expect(popRow2).toBeLessThan(anchorRow2);
});

// ── Test 4: controlled open/close ───────────────────────────────────

test('Popover respects controlled open prop', async () => {
	function App({open}: {open: boolean}) {
		const anchorReference = useRef<DOMElement | undefined>(null);
		return (
			<OverlayHost>
				<Box ref={anchorReference}>
					<Text>anchor</Text>
				</Box>
				<Popover anchorRef={anchorReference} open={open}>
					<Text>pop</Text>
				</Popover>
			</OverlayHost>
		);
	}

	resizableInstance = renderResizable(<App open={true} />);
	const {lastFrame} = resizableInstance;

	await delay(400);

	// Initially open.
	expect(lastFrame()).toContain('pop');

	// Close: re-render the entire tree with open={false}.
	const closeResult = renderResizable(<App open={false} />);
	await delay(400);
	expect(closeResult.lastFrame()).not.toContain('pop');
	closeResult.unmountAndCleanup();

	// Re-open: re-render the entire tree with open={true}.
	const reopenResult = renderResizable(<App open={true} />);
	await delay(400);
	expect(reopenResult.lastFrame()).toContain('pop');
	reopenResult.unmountAndCleanup();
});
