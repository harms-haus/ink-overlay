/**
 * Keyboard-navigable scene menu for the demo app.
 *
 * Renders the registry of {@link SceneDefinition} entries as a vertical
 * list. The user moves a highlight with ↑/↓ and presses Enter to select.
 *
 * ── WHY is the `useInput` gated with `!isCaptured`? ─────────────────
 *
 * Ink fires **every** active `useInput` listener on **every** keypress
 * via one shared `EventEmitter` inside `<App>`. There is no
 * `consumed`-boolean, no propagation-stop, no priority mechanism. So
 * when a scene opens a capturing overlay (a modal or the
 * command-palette), that overlay increments the capture depth exposed
 * by {@link useInputCaptureState}.
 *
 * This menu gates its own input via `useGatedInput`, which wraps
 * `useInput` with `{isActive: !isCaptured}`. Without this voluntary gate the arrow keys would
 * leak through to the menu *while a modal is open*, moving the
 * highlight behind the overlay. This is the **cooperative input
 * model** in action — and it is strictly VOLUNTARY: the framework
 * cannot (and does not) enforce it. It is every background
 * component's responsibility to gate itself.
 *
 * `q` (quit via `useApp().exit()`) and Esc (return to menu) are
 * handled in the **app root**, not here. This menu only owns
 * navigation + selection.
 *
 * @module demo/menu
 */

import {useState} from 'react';
import {Box, Text} from 'ink';
import {type SceneDefinition} from './types.js';
import {useGatedInput} from './hooks.js';

// ── Props ───────────────────────────────────────────────────────────

type MenuProps = {
	/** The full scene registry, in display order. */
	scenes: SceneDefinition[];
	/** Called when the user presses Enter on the highlighted scene. */
	onSelect: (scene: SceneDefinition) => void;
};

// ── Component ───────────────────────────────────────────────────────

/**
 * Presentational, keyboard-navigable list of demo scenes.
 */
export function SceneMenu({scenes, onSelect}: MenuProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Cooperative gate: yield to any capturing overlay (modal,
	// command-palette) so arrow/Enter keys don't leak through here.
	useGatedInput((_input, key) => {
		if (key.upArrow) {
			setSelectedIndex(previous =>
				previous === 0 ? scenes.length - 1 : previous - 1,
			);
			return;
		}

		if (key.downArrow) {
			setSelectedIndex(previous =>
				previous === scenes.length - 1 ? 0 : previous + 1,
			);
			return;
		}

		if (key.return) {
			// Guard for noUncheckedIndexedAccess — scenes[selectedIndex]
			// is typed as `SceneDefinition | undefined`.
			const scene = scenes[selectedIndex];
			if (scene === undefined) {
				return;
			}

			onSelect(scene);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				ink-overlay — Demo
			</Text>
			<Text dimColor>
				↑↓ navigate · Enter select · q quit · Esc back (in scenes)
			</Text>

			<Box flexDirection="column" marginTop={1}>
				{scenes.map((scene, index) => {
					const isSelected = index === selectedIndex;
					return (
						<Box key={scene.id} flexDirection="row">
							<Text>{isSelected ? '❯ ' : '  '}</Text>
							<Text bold color={isSelected ? 'cyan' : undefined}>
								{scene.title}
							</Text>
							{scene.tags.length > 0 && (
								<Text dimColor> ({scene.tags.join(', ')})</Text>
							)}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
