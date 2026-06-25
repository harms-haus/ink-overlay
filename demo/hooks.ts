/**
 * DEMO-ONLY HOOKS — NOT PART OF THE LIBRARY API.
 *
 * Small reusable hooks shared by demo scenes to keep them DRY.
 *
 * @module demo/hooks
 */

import {useInput, type Key} from 'ink';
import {useInputCaptureState} from '../src/index.js';

/**
 * `useInput` wrapper that is automatically deactivated whenever a
 * capturing overlay (modal, command palette, etc.) is active.
 *
 * This is the cooperative input gating pattern used by all demo scenes:
 * `useInputCaptureState()` returns `true` while a capturing overlay is
 * open, and background components voluntarily step aside by passing
 * `{isActive: !isCaptured}` to their own `useInput`. Centralizing the
 * two-call sequence here removes the repetition.
 *
 * If you need `isCaptured` for anything beyond gating `useInput` (e.g.
 * displaying the capture state in the UI, or gating a separate
 * `useRegisterInput` handler), call `useInputCaptureState()` directly
 * instead of (or alongside) this hook.
 *
 * @param handler - Called for each keypress while no capturing overlay
 * is active. Has the same signature as the `useInput` handler.
 */
export function useGatedInput(
	handler: (input: string, key: Key) => void,
): void {
	const isCaptured = useInputCaptureState();
	useInput(handler, {isActive: !isCaptured});
}
