import {EventEmitter} from 'node:events';
import type {ReactElement} from 'react';
import {render} from 'ink';

// ── Fake stdout ─────────────────────────────────────────────────────

class FakeStdout extends EventEmitter {
	columns: number;
	rows: number;
	readonly isTTY = true;

	/** Set externally so write() can capture frames. */
	_onWrite: ((data: string) => void) | undefined;

	constructor(columns: number, rows: number) {
		super();
		this.columns = columns;
		this.rows = rows;
	}

	write(data: string | Uint8Array) {
		const text = typeof data === 'string' ? data : String(data);
		this._onWrite?.(text);
		return true;
	}
}

// ── Fake stdin ──────────────────────────────────────────────────────

class FakeStdin extends EventEmitter {
	readonly isTTY = true;

	setRawMode(_mode: boolean) {}

	setEncoding(_encoding: string) {}

	ref() {}

	unref() {}

	read() {
		return null;
	}

	write(data: string | Uint8Array) {
		const text = typeof data === 'string' ? data : String(data);
		// Mirror ink-testing-library: emit 'readable' then 'data' synchronously
		// so Ink's input processing picks up the keypress immediately.
		this.emit('readable');
		this.emit('data', text);
		return true;
	}
}

// ── Public API ──────────────────────────────────────────────────────

type ResizableStdout = {
	stdout: NodeJS.WriteStream;
	stdin: NodeJS.ReadStream;
	resize: (columns: number, rows: number) => void;
	getFrames: () => string[];
	lastFrame: () => string;
	cleanup: () => void;
};

/**
 * Create a fake stdout/stdin pair whose terminal dimensions can be mutated
 * at runtime via `resize()`, causing Ink to re-render with the new size.
 *
 * Ink uses REAL timers — tests must `await delay(...)` after rendering or
 * resize to let frames flush.
 */
export function createResizableStdout(initial?: {
	columns?: number;
	rows?: number;
}): ResizableStdout {
	const columns = initial?.columns ?? 80;
	const rows = initial?.rows ?? 24;

	const frames: string[] = [];
	let last = '';

	// Ink writes multiple chunks per frame (bsu + content + esu for
	// synchronized output). Buffer synchronous writes and flush them as a
	// single frame once the microtask checkpoint arrives.
	let writeBuffer = '';
	let flushScheduled = false;

	function flushBuffer() {
		if (writeBuffer) {
			frames.push(writeBuffer);
			last = writeBuffer;
			writeBuffer = '';
		}

		flushScheduled = false;
	}

	const stdout = new FakeStdout(columns, rows);
	stdout._onWrite = data => {
		writeBuffer += data;
		if (!flushScheduled) {
			flushScheduled = true;
			queueMicrotask(flushBuffer);
		}
	};

	const stdin = new FakeStdin();

	function resize(newColumns: number, newRows: number) {
		stdout.columns = newColumns;
		stdout.rows = newRows;
		stdout.emit('resize');
	}

	function getFrames(): string[] {
		return frames;
	}

	function lastFrame(): string {
		return last;
	}

	function cleanup() {
		stdout.removeAllListeners();
		stdin.removeAllListeners();
	}

	return {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		resize,
		getFrames,
		lastFrame,
		cleanup,
	};
}

type RenderResizableResult = ReturnType<typeof render> & {
	resize: (columns: number, rows: number) => void;
	getFrames: () => string[];
	lastFrame: () => string;
	stdout: NodeJS.WriteStream;
	stdin: NodeJS.ReadStream;
	unmountAndCleanup: () => void;
};

/**
 * Convenience wrapper: creates a resizable stdout/stdin pair and calls
 * `ink.render()` with it. Returns the Ink instance plus resize/frame helpers
 * and an `unmountAndCleanup()` that tears everything down.
 *
 * Real timers are in effect — `await delay(...)` after render/resize/input.
 */
export function renderResizable(
	tree: ReactElement,
	options?: {columns?: number; rows?: number},
): RenderResizableResult {
	const {stdout, stdin, resize, getFrames, lastFrame, cleanup} =
		createResizableStdout(options);

	const instance = render(tree, {
		stdout,
		stdin,
		debug: false,
		exitOnCtrlC: false,
		patchConsole: false,
	});

	function unmountAndCleanup() {
		instance.unmount();
		cleanup();
	}

	return {
		...instance,
		resize,
		getFrames,
		lastFrame,
		stdout,
		stdin,
		unmountAndCleanup,
	};
}
