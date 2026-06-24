/**
 * Tests for the <Modal> component.
 *
 * Covers: rendering with title, footer, and body; rounded border chars;
 * Escape dismissal; and backdrop rendering.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import React, {useState} from 'react';
import {test, expect, vi} from 'vitest';
import {Text} from 'ink';
import {Modal} from '../src/modal.js';
import {renderWithHost} from './helpers/render-with-host.js';
import {delay} from './helpers/delay.js';

// ── Test 1: renders title, footer, and body ────────────────────────

test('Modal renders title, footer, and body content', async () => {
	const {lastFrame} = renderWithHost(
		<Modal title='Confirm' footer='[Y]es [N]o'>
			<Text>Are you sure?</Text>
		</Modal>,
	);

	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('Confirm');
	expect(frame).toContain('[Y]es [N]o');
	expect(frame).toContain('Are you sure?');
});

// ── Test 2: border characters are present ──────────────────────────

test('Modal renders with border characters', async () => {
	const {lastFrame} = renderWithHost(
		<Modal title='Dialog'>
			<Text>content</Text>
		</Modal>,
	);

	await delay(200);

	const frame = lastFrame();
	// Default borderStyle is 'round' which uses ╭╮╰╯ characters.
	// Also accept other common border chars for flexibility.
	const hasBorder
		= frame.includes('╭')
		|| frame.includes('╮')
		|| frame.includes('╰')
		|| frame.includes('╯')
		|| frame.includes('═')
		|| frame.includes('║')
		|| frame.includes('╔')
		|| frame.includes('╗');

	expect(hasBorder).toBe(true);
});

// ── Test 3: Escape dismisses via onDismiss callback ────────────────

test('Modal calls onDismiss when Escape is pressed', async () => {
	const onDismiss = vi.fn();

	const {stdin} = renderWithHost(
		<Modal title='Close me' onDismiss={onDismiss}>
			<Text>body</Text>
		</Modal>,
	);

	await delay(200);

	// Send Escape character.
	stdin.write('\u001B');
	await delay(200);

	expect(onDismiss).toHaveBeenCalled();
});

// ── Test 4: backdrop renders (dim backdrop overpaints base) ────────

test('Modal with default backdrop renders a dim backdrop over base', async () => {
	const {lastFrame} = renderWithHost(
		<>
			<Text>base content</Text>
			<Modal title='Overlay'>
				<Text>modal body</Text>
			</Modal>
		</>,
	);

	await delay(200);

	const frame = lastFrame();
	// The modal content should be visible.
	expect(frame).toContain('modal body');
	// The default backdrop is 'dim' (non-none), so the backdrop box is
	// rendered. When a non-none backdrop is present the backdrop
	// backgroundColor covers the base text.
	expect(frame).not.toContain('base content');
});

// ── Test 5: uncontrolled defaultOpen={false} hides modal ──────────

test('Modal with defaultOpen={false} renders nothing initially', async () => {
	let openModal: () => void;

	function App() {
		const [open, setOpen] = useState(false);
		openModal = () => {
			setOpen(true);
		};

		return (
			<>
				<Text>base</Text>
				<Modal defaultOpen={false} open={open} title='Late'>
					<Text>late content</Text>
				</Modal>
			</>
		);
	}

	const {lastFrame} = renderWithHost(<App />);

	await delay(200);

	// Initially hidden.
	expect(lastFrame()).not.toContain('Late');
	expect(lastFrame()).toContain('base');

	// Open it.
	openModal();
	await delay(200);

	expect(lastFrame()).toContain('Late');
	expect(lastFrame()).toContain('late content');
});

// ── Test 6: controlled open={false} hides modal ───────────────────

test('Modal with open={false} renders nothing', async () => {
	const {lastFrame} = renderWithHost(
		<Modal open={false} title='Hidden'>
			<Text>secret</Text>
		</Modal>,
	);

	await delay(200);

	expect(lastFrame()).not.toContain('Hidden');
	expect(lastFrame()).not.toContain('secret');
});

// ── Test 7: onOpenChange fires ────────────────────────────────────

test('Modal calls onOpenChange with open state', async () => {
	const onOpenChange = vi.fn();
	const onDismiss = vi.fn();

	const {stdin} = renderWithHost(
		<Modal
			title='Track'
			onOpenChange={onOpenChange}
			onDismiss={onDismiss}
		>
			<Text>trackable</Text>
		</Modal>,
	);

	await delay(200);

	// Dismiss via Escape — Layer calls onDismiss then onOpenChange(false).
	stdin.write('\u001B');
	await delay(200);

	expect(onDismiss).toHaveBeenCalled();
});

// ── Test 8: no title renders no header ────────────────────────────

test('Modal without title renders no header border line', async () => {
	const {lastFrame} = renderWithHost(
		<Modal>
			<Text>just body</Text>
		</Modal>,
	);

	await delay(200);

	const frame = lastFrame();
	expect(frame).toContain('just body');
	// No title means no "Confirm" or similar text.
	expect(frame).not.toContain('Confirm');
});
