/**
 * Integration tests for toast STACKING and NON-CAPTURING behaviour.
 *
 * Covers the kb-22 scenario: multiple toasts rendered simultaneously,
 * stacked vertically (non-overlapping), auto-dismissed individually,
 * cleared en masse via dismissAll(), and guaranteed non-capturing so
 * cooperative background input keeps flowing while toasts are visible.
 *
 * Uses REAL timers — ink breaks with fake timers.
 * Uses renderWithHost so <OverlayHost> is present.
 */
import {describe, test, expect, afterEach, vi} from 'vitest';
import {useState} from 'react';
import {Text, useInput} from 'ink';
import {OverlayHost} from '../src/index.js';
import {toasts} from '../src/manager.js';
import {useInputCaptureState} from '../src/input-dispatcher.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Isolation: clear all toasts between tests ──────────────────────

afterEach(async () => {
	toasts.dismissAll();
	await delay(50);
});

// ── Helper: split a rendered frame into trimmed lines ──────────────

function frameLines(frame: string): string[] {
	return frame.split('\n').map(line => line.trim());
}

/**
 * Return the 0-based line index of the first line containing `needle`,
 * or -1 when absent. Used to prove toasts occupy distinct rows.
 */
function lineIndexOf(lines: string[], needle: string): number {
	return lines.findIndex(line => line.includes(needle));
}

// ═══════════════════════════════════════════════════════════════════
// (1) Stacking — three toasts appear simultaneously, non-overlapping
// ═══════════════════════════════════════════════════════════════════

describe('toast stacking', () => {
	test('rapid toasts.success/error/info all appear stacked on distinct rows', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>app</Text>
			</OverlayHost>,
		);
		await delay(150);

		// Fire three toasts back-to-back (synchronous).
		toasts.success('Stack-A');
		toasts.error('Stack-B');
		toasts.info('Stack-C');

		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('Stack-A');
		expect(frame).toContain('Stack-B');
		expect(frame).toContain('Stack-C');

		// Non-overlapping: each message lives on its own distinct line.
		const lines = frameLines(frame);
		const lineA = lineIndexOf(lines, 'Stack-A');
		const lineB = lineIndexOf(lines, 'Stack-B');
		const lineC = lineIndexOf(lines, 'Stack-C');

		expect(lineA).toBeGreaterThanOrEqual(0);
		expect(lineB).toBeGreaterThanOrEqual(0);
		expect(lineC).toBeGreaterThanOrEqual(0);

		// The three line indices must all differ — no overlap.
		expect(new Set([lineA, lineB, lineC]).size).toBe(3);
	});

	test('icons for each kind render alongside their messages', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>app</Text>
			</OverlayHost>,
		);
		await delay(150);

		toasts.success('ok-msg');
		toasts.error('err-msg');
		toasts.info('info-msg');

		await delay(250);

		const frame = lastFrame();
		expect(frame).toContain('✓');
		expect(frame).toContain('✗');
		expect(frame).toContain('ℹ');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (2) Auto-dismiss — short duration removes a toast individually
// ═══════════════════════════════════════════════════════════════════

describe('toast auto-dismiss', () => {
	test('toast with short duration disappears after duration+buffer', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>app</Text>
			</OverlayHost>,
		);
		await delay(150);

		toasts.success('Fleeting', {duration: 150});
		await delay(100);

		// Still visible before the timer fires.
		expect(lastFrame()).toContain('Fleeting');

		// Wait past the 150ms auto-dismiss + re-render buffer.
		await delay(400);
		expect(lastFrame()).not.toContain('Fleeting');
	});

	test('toasts auto-dismiss individually — short one gone, long one remains', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>app</Text>
			</OverlayHost>,
		);
		await delay(150);

		// Short-lived toast and a long-lived toast, shown together.
		toasts.success('Short-lived', {duration: 150});
		toasts.error('Long-lived', {duration: 10_000});

		await delay(100);
		expect(lastFrame()).toContain('Short-lived');
		expect(lastFrame()).toContain('Long-lived');

		// After the short timer fires, only the long-lived toast remains.
		await delay(400);
		const frame = lastFrame();
		expect(frame).not.toContain('Short-lived');
		expect(frame).toContain('Long-lived');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (3) dismissAll — clears every toast at once
// ═══════════════════════════════════════════════════════════════════

describe('toast dismissAll', () => {
	test('dismissAll clears all stacked toasts', async () => {
		const {lastFrame} = renderWithHost(
			<OverlayHost>
				<Text>app</Text>
			</OverlayHost>,
		);
		await delay(150);

		toasts.success('Clear-1');
		toasts.error('Clear-2');
		toasts.info('Clear-3');
		await delay(250);

		const before = lastFrame();
		expect(before).toContain('Clear-1');
		expect(before).toContain('Clear-2');
		expect(before).toContain('Clear-3');

		toasts.dismissAll();
		await delay(250);

		const after = lastFrame();
		expect(after).not.toContain('Clear-1');
		expect(after).not.toContain('Clear-2');
		expect(after).not.toContain('Clear-3');
	});
});

// ═══════════════════════════════════════════════════════════════════
// (4) Non-capturing — background input keeps working while toasts show
// ═══════════════════════════════════════════════════════════════════

describe('toast non-capturing', () => {
	test('background input fires while toasts are visible', async () => {
		// A cooperative background component that gates its own useInput
		// with useInputCaptureState(). Because toasts are non-capturing
		// (capture:false), isCaptured stays false and the background
		// handler keeps receiving keys.
		function Background() {
			const isCaptured = useInputCaptureState();
			const [count, setCount] = useState(0);

			useInput(
				input => {
					// Increment on any printable single-char key.
					if (input.length === 1) {
						setCount(c => c + 1);
					}
				},
				{isActive: !isCaptured},
			);

			return <Text>{`count:${count}`}</Text>;
		}

		const {lastFrame, stdin} = renderWithHost(
			<OverlayHost>
				<Background />
			</OverlayHost>,
		);
		await delay(150);

		// Show a toast — the layer is non-capturing.
		toasts.success('bg-toast');
		await delay(200);
		expect(lastFrame()).toContain('bg-toast');

		// Background should still respond to input.
		stdin.write('x');
		await delay(150);
		expect(lastFrame()).toContain('count:1');

		// A second key increments again — proving the handler keeps firing.
		stdin.write('y');
		await delay(150);
		expect(lastFrame()).toContain('count:2');
	});
});
