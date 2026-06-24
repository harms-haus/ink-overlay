import {test, expect, afterEach} from 'vitest';
import {Text} from 'ink';
import {delay} from './delay.js';
import {
	createResizableStdout,
	renderResizable,
} from './create-resizable-stdout.js';

// ── createResizableStdout ───────────────────────────────────────────

test('createResizableStdout — default dimensions', () => {
	const {stdout, cleanup} = createResizableStdout();

	expect(stdout.columns).toBe(80);
	expect(stdout.rows).toBe(24);
	expect(stdout.isTTY).toBe(true);

	cleanup();
});

test('createResizableStdout — custom initial dimensions', () => {
	const {stdout, cleanup} = createResizableStdout({columns: 120, rows: 50});

	expect(stdout.columns).toBe(120);
	expect(stdout.rows).toBe(50);

	cleanup();
});

test('createResizableStdout — resize changes dimensions and emits event', async () => {
	const {stdout, resize, cleanup} = createResizableStdout();

	let emitted = false;
	stdout.on('resize', () => {
		emitted = true;
	});

	resize(100, 40);

	expect(stdout.columns).toBe(100);
	expect(stdout.rows).toBe(40);

	// Give the event loop a tick so the synchronous emit propagates.
	await delay(10);
	expect(emitted).toBe(true);

	cleanup();
});

test('createResizableStdout — write captures frames', async () => {
	const {stdout, getFrames, lastFrame, cleanup} = createResizableStdout();

	// Two synchronous writes are microtask-aggregated into a single frame.
	stdout.write('frame-1');
	stdout.write('frame-2');
	await delay(0); // Flush microtask

	expect(getFrames()).toEqual(['frame-1frame-2']);
	expect(lastFrame()).toBe('frame-1frame-2');

	cleanup();
});

// ── renderResizable ─────────────────────────────────────────────────

let active: {unmountAndCleanup: () => void} | undefined;

afterEach(() => {
	active?.unmountAndCleanup();
	active = undefined;
});

test('renderResizable — renders a simple element', async () => {
	const result = renderResizable(<Text>hi</Text>);
	active = result;

	// Ink uses real timers — wait for the frame to flush.
	await delay(100);

	expect(result.lastFrame()).toContain('hi');
});

test('renderResizable — resize triggers re-render with new dimensions', async () => {
	const result = renderResizable(<Text>hello</Text>, {columns: 80, rows: 24});
	active = result;

	await delay(100);
	expect(result.lastFrame()).toContain('hello');

	// Resize and wait for the re-rendered frame.
	result.resize(120, 50);
	await delay(100);

	expect((result.stdout as unknown as {columns: number}).columns).toBe(120);
	expect((result.stdout as unknown as {rows: number}).rows).toBe(50);
	expect(result.lastFrame()).toContain('hello');
});

test('renderResizable — stdin writes are received', async () => {
	const result = renderResizable(<Text>input-test</Text>);
	active = result;

	await delay(100);

	// Simulate keypress input — Ink should receive it via stdin.
	stdinWrite(result.stdin, 'x');

	await delay(100);
	// Just verify it didn't crash; the component doesn't echo input.
	expect(result.lastFrame()).toContain('input-test');
});

// ── helpers ─────────────────────────────────────────────────────────

function stdinWrite(stdin: NodeJS.ReadStream, data: string) {
	stdin.write(data);
}
