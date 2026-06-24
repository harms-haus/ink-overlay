/**
 * Tests for <Tooltip> — popover variant shown on key/focus trigger
 * with auto-dismiss.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import {describe, test, expect} from 'vitest';
import React, {useRef, useState} from 'react';
import {Box, Text, type DOMElement} from 'ink';
import {Tooltip} from '../src/tooltip.js';
import {Layer} from '../src/layer.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Wrapper component for key-trigger tests.
 * Renders an anchor Box + Tooltip with the given props.
 */
function KeyTriggerApp({
	content = 'help text',
	triggerKey = '?',
	dismissDelay = 10_000,
	placement = 'top',
}: {
	content?: string;
	triggerKey?: string;
	dismissDelay?: number;
	placement?: string;
}) {
	const anchorReference = useRef<DOMElement | undefined>(null);
	return (
		<>
			<Box ref={anchorReference}>
				<Text>anchor</Text>
			</Box>
			<Tooltip
				anchorRef={anchorReference}
				content={<Text>{content}</Text>}
				trigger='key'
				triggerKey={triggerKey}
				dismissDelay={dismissDelay}
				placement={placement as any}
			/>
		</>
	);
}

/**
 * Wrapper component for focus-trigger tests.
 * Renders an anchor Box + Tooltip driven by anchorFocused prop.
 */
function FocusTriggerApp({
	focused,
	content = 'help text',
	placement = 'top',
}: {
	focused: boolean;
	content?: string;
	placement?: string;
}) {
	const anchorReference = useRef<DOMElement | undefined>(null);
	return (
		<>
			<Box ref={anchorReference}>
				<Text>anchor</Text>
			</Box>
			<Tooltip
				anchorRef={anchorReference}
				content={<Text>{content}</Text>}
				trigger='focus'
				anchorFocused={focused}
				placement={placement as any}
			/>
		</>
	);
}

// ════════════════════════════════════════════════════════════════════
// (a) Key trigger — toggle, auto-dismiss, re-trigger
// ════════════════════════════════════════════════════════════════════

describe('Tooltip key trigger', () => {
	test('content is NOT visible initially', async () => {
		const {lastFrame} = renderWithHost(<KeyTriggerApp />);
		await delay(500);
		expect(lastFrame()).not.toContain('help text');
	});

	test('pressing trigger key shows content', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={10_000} />,
		);
		await delay(500);

		// Initially hidden.
		expect(lastFrame()).not.toContain('help text');

		// Press trigger key.
		stdin.write('?');
		await delay(500);

		// Content should now be visible.
		expect(lastFrame()).toContain('help text');
	});

	test('content auto-dismisses after dismissDelay', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={1000} />,
		);
		await delay(500);

		// Show tooltip.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');

		// Wait for dismissDelay (1000ms) + buffer (500ms).
		await delay(1500);
		expect(lastFrame()).not.toContain('help text');
	});

	test('re-triggering shows content again after auto-dismiss', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={1000} />,
		);
		await delay(500);

		// Show → auto-dismiss.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');

		await delay(1500);
		expect(lastFrame()).not.toContain('help text');

		// Re-trigger.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');
	});

	test('pressing trigger key again hides content (toggle)', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={10_000} />,
		);
		await delay(500);

		// Show.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');

		// Toggle off.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).not.toContain('help text');
	});

	test('each re-show resets the dismiss timer', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={500} />,
		);
		await delay(500);

		// Show tooltip.
		stdin.write('?');
		await delay(200);
		expect(lastFrame()).toContain('help text');

		// Re-trigger at 200ms (before the 500ms timer fires).
		stdin.write('?');
		await delay(200);

		// Another re-trigger to ensure it stays visible.
		stdin.write('?');
		await delay(200);

		// Now we're ~600ms since first show, but only ~200ms since last trigger.
		// The timer should have been reset, so it should still be visible.
		expect(lastFrame()).toContain('help text');

		// Wait for dismissDelay (500ms) from last trigger + buffer.
		await delay(500);
		expect(lastFrame()).not.toContain('help text');
	});
});

// ════════════════════════════════════════════════════════════════════
// (b) Focus trigger — driven by anchorFocused prop
// ════════════════════════════════════════════════════════════════════

describe('Tooltip focus trigger', () => {
	test('content appears when anchorFocused is true', async () => {
		const {lastFrame} = renderWithHost(
			<FocusTriggerApp focused={true} />,
		);
		await delay(500);
		expect(lastFrame()).toContain('help text');
	});

	test('content is hidden when anchorFocused is false', async () => {
		const {lastFrame} = renderWithHost(
			<FocusTriggerApp focused={false} />,
		);
		await delay(500);
		expect(lastFrame()).not.toContain('help text');
	});

	test('tooltip hides when anchorFocused changes from true to false', async () => {
		// Phase 1: focused → visible
		const {lastFrame, unmount} = renderWithHost(
			<FocusTriggerApp focused={true} />,
		);
		await delay(500);
		expect(lastFrame()).toContain('help text');

		unmount();
		await delay(100);

		// Phase 2: not focused → hidden
		const result = renderWithHost(
			<FocusTriggerApp focused={false} />,
		);
		await delay(500);
		expect(result.lastFrame()).not.toContain('help text');
		result.unmount();
	});
});

// ════════════════════════════════════════════════════════════════════
// (c) Anchor text is always visible
// ════════════════════════════════════════════════════════════════════

describe('Tooltip anchor', () => {
	test('anchor text is always rendered', async () => {
		const {lastFrame} = renderWithHost(<KeyTriggerApp />);
		await delay(500);
		expect(lastFrame()).toContain('anchor');
	});

	test('anchor text visible when tooltip is shown', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp dismissDelay={10_000} />,
		);
		await delay(500);
		stdin.write('?');
		await delay(500);
		const frame = lastFrame();
		expect(frame).toContain('anchor');
		expect(frame).toContain('help text');
	});
});

// ════════════════════════════════════════════════════════════════════
// (d) Custom trigger key
// ════════════════════════════════════════════════════════════════════

describe('Tooltip custom trigger key', () => {
	test('responds to custom triggerKey', async () => {
		const {lastFrame, stdin} = renderWithHost(
			<KeyTriggerApp triggerKey='h' dismissDelay={10_000} />,
		);
		await delay(500);

		// Wrong key should not trigger.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).not.toContain('help text');

		// Correct key should trigger.
		stdin.write('h');
		await delay(500);
		expect(lastFrame()).toContain('help text');
	});
});

// ════════════════════════════════════════════════════════════════════
// (e) Cooperative capture gating
// ════════════════════════════════════════════════════════════════════

describe('Tooltip cooperative capture gating', () => {
	test('trigger key does NOT toggle tooltip while a capturing modal is open', async () => {
		let openModal: () => void;
		let closeModal: () => void;

		function App() {
			const [modalOpen, setModalOpen] = useState(false);
			openModal = () => {
				setModalOpen(true);
			};

			closeModal = () => {
				setModalOpen(false);
			};

			const anchorReference = useRef<DOMElement | undefined>(null);
			return (
				<>
					<Box ref={anchorReference}>
						<Text>anchor</Text>
					</Box>
					<Tooltip
						anchorRef={anchorReference}
						content={<Text>help text</Text>}
						trigger='key'
						triggerKey='?'
						dismissDelay={10_000}
					/>
					{/* Capturing layer — sets isCaptured=true while open */}
					<Layer open={modalOpen} capture backdrop='none'>
						<Text>modal content</Text>
					</Layer>
				</>
			);
		}

		const {lastFrame, stdin} = renderWithHost(<App />);
		await delay(300);

		// ── (1) Without modal: '?' toggles tooltip ON ─────────────────
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');

		// Toggle tooltip OFF.
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).not.toContain('help text');

		// ── (2) Open capturing modal ─────────────────────────────────
		openModal!();
		await delay(300);
		expect(lastFrame()).toContain('modal content');

		// ── (3) While captured: '?' must NOT toggle the tooltip ───────
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).not.toContain('help text');

		// ── (4) Close modal ──────────────────────────────────────────
		closeModal!();
		await delay(300);
		expect(lastFrame()).not.toContain('modal content');

		// ── (5) After modal closes: '?' toggles tooltip ON again ─────
		stdin.write('?');
		await delay(500);
		expect(lastFrame()).toContain('help text');
	});
});
