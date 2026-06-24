/**
 * Modal — opinionated, centered, bordered, titled, footer-bearing dialog
 * built on {@link Layer}.
 *
 * @module modal
 */

import type {ReactNode} from 'react';
import {Box, Text, type BoxProps} from 'ink';
import {Layer} from './layer.js';
import type {BackdropKind, Role} from './types.js';

// ── Props ───────────────────────────────────────────────────────────

export type ModalProps = {
	/** Controlled open state. */
	open?: boolean;
	/** Initial open state for uncontrolled mode. */
	defaultOpen?: boolean;
	/** Called when the open state changes. */
	onOpenChange?: (open: boolean) => void;
	/** Called when the modal is dismissed (Escape). */
	onDismiss?: () => void;
	/** Title rendered in the header. */
	title?: ReactNode;
	/** Footer rendered at the bottom. */
	footer?: ReactNode;
	/** Modal body content. */
	children?: ReactNode;
	/** Width of the modal box. Default `50`. */
	width?: number | string;
	/** Border style (BoxProps type). Default `'round'`. */
	borderStyle?: BoxProps['borderStyle'];
	/** Border color. Default `'cyan'`. */
	borderColor?: string;
	/** Backdrop kind. Default `'dim'`. */
	backdrop?: BackdropKind;
	/** Z-index. Default `100`. */
	z?: number;
	/** ARIA role. Default `'dialog'`. */
	role?: Role;
};

// ── Component ───────────────────────────────────────────────────────

/**
 * Centered, bordered modal dialog with optional title and footer.
 *
 * Renders a {@link Layer} anchored to center with input capture, a
 * border, and optional header / footer sections.
 */
export function Modal({
	open,
	defaultOpen = true,
	onOpenChange,
	onDismiss,
	title,
	footer,
	children,
	width = 50,
	borderStyle = 'round',
	borderColor = 'cyan',
	backdrop = 'dim',
	z = 100,
	role = 'dialog',
}: ModalProps) {
	return (
		<Layer
			anchor='center'
			capture
			backdrop={backdrop}
			z={z}
			role={role}
			overflow='hidden'
			open={open}
			defaultOpen={defaultOpen}
			onOpenChange={onOpenChange}
			onDismiss={onDismiss}
		>
			<Box
				flexDirection='column'
				borderStyle={borderStyle}
				borderColor={borderColor}
				width={width}
				padding={1}
			>
				{title && (
					<Box borderBottom paddingX={1}>
						<Text bold>{title}</Text>
					</Box>
				)}
				<Box flexDirection='column' flexGrow={1} paddingX={1}>
					{children}
				</Box>
				{footer && (
					<Box borderTop paddingX={1}>
						<Text dimColor>{footer}</Text>
					</Box>
				)}
			</Box>
		</Layer>
	);
}
