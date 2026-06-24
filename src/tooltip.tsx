/**
 * Tooltip — popover variant shown on key or focus trigger with auto-dismiss.
 *
 * For 'key' trigger: toggles visibility when `triggerKey` is pressed.
 * For 'focus' trigger: drives visibility from the `anchorFocused` prop
 * (consumer passes their `useFocus().isFocused` value).
 *
 * @module tooltip
 */

import {
	type RefObject,
	type ReactNode,
	useState,
	useEffect,
	useCallback,
	useRef,
} from 'react';
import {
	Box, Text, useInput, type DOMElement,
} from 'ink';
import {Popover} from './popover.js';
import {useInputCaptureState} from './input-dispatcher.js';
import type {Placement} from './types.js';

// ── Props ───────────────────────────────────────────────────────────

export type TooltipProps = {
	/** Ref to the anchor DOMElement that the tooltip is positioned relative to. */
	anchorRef: RefObject<DOMElement | null>;
	/** Tooltip content. */
	content: ReactNode;
	/** Preferred placement relative to the anchor. Default `'top'`. */
	placement?: Placement;
	/** Trigger mode: `'key'` (keyboard) or `'focus'` (anchor focus). Default `'key'`. */
	trigger?: 'focus' | 'key';
	/** Key that toggles the tooltip in `'key'` mode. Default `'?'`. */
	triggerKey?: string;
	/**
	 * Consumer-driven focus state for `'focus'` trigger mode.
	 * Typically wired to `useFocus().isFocused`.
	 * When `true` → show; when `false` → hide.
	 */
	anchorFocused?: boolean;
	/** Auto-dismiss delay in ms. Default `3000`. */
	dismissDelay?: number;
	/** Main-axis offset from the anchor edge. Passed to Popover. */
	offset?: number;
	/** Cross-axis offset. Passed to Popover. */
	crossOffset?: number;
	/** Allow placement to flip on overflow. Passed to Popover. */
	flip?: boolean;
	/** Clamp position within viewport. Passed to Popover. */
	shift?: boolean;
	/** Z-index. Default `10`. */
	z?: number;
};

// ── Component ───────────────────────────────────────────────────────

export function Tooltip({
	anchorRef,
	content,
	placement = 'top',
	trigger = 'key',
	triggerKey = '?',
	anchorFocused,
	dismissDelay = 3000,
	offset,
	crossOffset,
	flip,
	shift,
	z = 10,
}: TooltipProps) {
	const [visible, setVisible] = useState(false);
	const timerReference = useRef<ReturnType<typeof setTimeout> | undefined>(null);

	// ── Timer management ──────────────────────────────────────────

	const clearTimer = useCallback(() => {
		if (timerReference.current !== null) {
			clearTimeout(timerReference.current);
			timerReference.current = null;
		}
	}, []);

	const startDismissTimer = useCallback(() => {
		clearTimer();
		timerReference.current = setTimeout(() => {
			setVisible(false);
			timerReference.current = null;
		}, dismissDelay);
	}, [dismissDelay, clearTimer]);

	// ── Show / hide helpers ───────────────────────────────────────

	const show = useCallback(() => {
		setVisible(true);
		startDismissTimer();
	}, [startDismissTimer]);

	const hide = useCallback(() => {
		clearTimer();
		setVisible(false);
	}, [clearTimer]);

	// ── Key trigger ───────────────────────────────────────────────
	// Gate the key-trigger useInput on the cooperative capture state so
	// that pressing the trigger key does NOT toggle background tooltips
	// while a capturing modal/layer is open.
	const isCaptured = useInputCaptureState();

	useInput(
		input => {
			if (input === triggerKey) {
				setVisible(previous => {
					const next = !previous;
					if (next) {
						startDismissTimer();
					} else {
						clearTimer();
					}

					return next;
				});
			}
		},
		{isActive: trigger === 'key' && !isCaptured},
	);

	// ── Focus trigger ─────────────────────────────────────────────

	useEffect(() => {
		if (trigger !== 'focus') {
			return;
		}

		if (anchorFocused) {
			show();
		} else {
			hide();
		}
	}, [trigger, anchorFocused, show, hide]);

	// ── Cleanup on unmount ────────────────────────────────────────

	useEffect(() => () => {
		clearTimer();
	}, [clearTimer]);

	// ── Render ────────────────────────────────────────────────────
	// Mount/unmount the Popover rather than toggling its `open` prop.
	// The Layer registration effect fires on mount, ensuring the host
	// renders the positioned content immediately.

	if (!visible) {
		return null;
	}

	return (
		<Popover
			anchorRef={anchorRef}
			placement={placement}
			z={z}
			backdrop='none'
			open={true}
			offset={offset}
			crossOffset={crossOffset}
			flip={flip}
			shift={shift}
		>
			<Box borderStyle='round' borderColor='gray' paddingX={1}>
				<Text color='gray' italic>
					{content}
				</Text>
			</Box>
		</Popover>
	);
}
