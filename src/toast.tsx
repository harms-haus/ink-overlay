import {type ReactNode} from 'react';
import {Box, Text} from 'ink';
import type {ToastKind} from './types.js';

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

export const defaultToastColors: Record<ToastKind, string> = {
	success: 'green',
	error: 'red',
	warn: 'yellow',
	info: 'blue',
};

// ---------------------------------------------------------------------------
// Default icons
// ---------------------------------------------------------------------------

const defaultIcons: Record<ToastKind, string> = {
	success: '✓',
	error: '✗',
	warn: '⚠',
	info: 'ℹ',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type ToastProps = {
	kind?: ToastKind;
	children?: ReactNode;
	icon?: ReactNode;
};

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

export function Toast({kind = 'info', children, icon}: ToastProps) {
	const color = defaultToastColors[kind];
	const displayIcon = icon ?? defaultIcons[kind];

	return (
		<Box
			borderStyle="round"
			borderColor={color}
			paddingX={1}
			flexDirection="row"
			flexShrink={0}
		>
			<Text color={color}>{displayIcon}</Text>
			<Text> {children}</Text>
		</Box>
	);
}
