/**
 * Integration tests for nested overlays.
 *
 * D3 refinement: a modal (capture) opens a popover (non-capture) and a
 * child modal (capture). All stack correctly in the single host. Only
 * the topmost capturing layer holds input (LIFO dispatcher). Esc closes
 * the topmost capturing layer; after close the parent modal's capture
 * is restored (its handler fires again).
 *
 * Uses REAL timers.
 */
import {test, expect, afterEach} from 'vitest';
import {useState} from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost, Layer} from '../src/index.js';
import {useRegisterInput} from '../src/input-dispatcher.js';
import {overlayStore} from '../src/store.js';
import {delay} from './helpers/delay.js';

// ── Isolation ───────────────────────────────────────────────────────

afterEach(async () => {
	overlayStore.closeAll();
	await delay(50);
});

// ── Helper: consuming input handler inside layer content ────────────

/**
 * Registers a consuming input handler for non-escape keys.
 *
 * Escape is passed through (returns false) so the layer's internal
 * FocusTrap / LayerRenderer handler can process dismissal.
 */
function InputCapture({
	id,
	onKey,
	label,
}: {
	id: string;
	onKey: () => void;
	label: string;
}) {
	useRegisterInput(id, (input, key) => {
		if (key.escape) {
			return false; // Let escape fall through to dismissal handlers.
		}

		onKey();
		return true; // Consume all other keys.
	});
	return <Text>{label}</Text>;
}

// ── Test: nested modals + popover — stacking and LIFO input ─────────

test('nesting: parent modal + popover + child modal stack correctly; input follows LIFO; Esc restores parent capture', async () => {
	const calls: string[] = [];

	function App() {
		const [parentOpen, setParentOpen] = useState(true);
		const [popoverOpen, setPopoverOpen] = useState(true);
		const [childOpen, setChildOpen] = useState(true);

		return (
			<OverlayHost>
				<Text>base</Text>
				{/* Parent modal — capture, z=10, centered */}
				<Layer
					open={parentOpen}
					onOpenChange={setParentOpen}
					z={10}
					capture
					anchor="center"
				>
					<InputCapture
						id="parent"
						label="PARENT-MODAL"
						onKey={() => {
							calls.push('parent');
						}}
					/>
				</Layer>
				{/* Popover — non-capturing, z=20, top-left */}
				<Layer
					open={popoverOpen}
					onOpenChange={setPopoverOpen}
					z={20}
					anchor="top-left"
				>
					<Text>POPOVER</Text>
				</Layer>
				{/* Child modal — capture, z=30, bottom-right (topmost) */}
				<Layer
					open={childOpen}
					onOpenChange={setChildOpen}
					z={30}
					capture
					anchor="bottom-right"
				>
					<InputCapture
						id="child"
						label="CHILD-MODAL"
						onKey={() => {
							calls.push('child');
						}}
					/>
				</Layer>
			</OverlayHost>
		);
	}

	const {lastFrame, stdin} = render(<App />);
	await delay(300);

	// ── All three layers render in the single host ──────────────────
	const initialFrame = lastFrame();
	expect(initialFrame).toContain('PARENT-MODAL');
	expect(initialFrame).toContain('POPOVER');
	expect(initialFrame).toContain('CHILD-MODAL');

	// ── Only the topmost capturing layer (child) owns input ─────────
	// While child is open, pressing 'x' fires only the child's handler.
	stdin.write('x');
	await delay(100);
	expect(calls).toEqual(['child']);
	calls.length = 0;

	// ── Esc closes the topmost capturing layer (child modal) ────────
	stdin.write('\u001B');
	await delay(300);

	// Child modal is gone; parent and popover remain.
	const afterEscFrame = lastFrame();
	expect(afterEscFrame).not.toContain('CHILD-MODAL');
	expect(afterEscFrame).toContain('PARENT-MODAL');

	// ── Parent capture is restored — its handler now fires ──────────
	stdin.write('x');
	await delay(100);
	expect(calls).toEqual(['parent']);
});
