import {type ReactNode} from 'react';

export type Anchor =
	| 'center'
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

export type Placement =
	| 'top'
	| 'top-start'
	| 'top-end'
	| 'bottom'
	| 'bottom-start'
	| 'bottom-end'
	| 'left'
	| 'left-start'
	| 'left-end'
	| 'right'
	| 'right-start'
	| 'right-end';

export type BackdropKind = 'none' | 'opaque' | 'dim';

export type Role = 'dialog' | 'alertdialog' | 'menu' | 'tooltip' | 'toast';

export type Viewport = {columns: number; rows: number};

export type Rect = {width: number; height: number};

/** Anchor rect in root-relative coordinates. */
export type AnchorRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type OffsetEdges = {
	top?: number;
	left?: number;
	right?: number;
	bottom?: number;
};

/**
 * Position offsets that may be numeric or percentage strings (e.g. '50%').
 * Used for explicit top/left/right/bottom positioning on layers.
 */
export type ExplicitPosition = {
	top?: number | string;
	left?: number | string;
	right?: number | string;
	bottom?: number | string;
};

export type TransitionName =
	| 'none'
	| 'fade'
	| 'slide-up'
	| 'slide-down'
	| 'slide-left'
	| 'slide-right';

/** Partial Box-style overrides applied per animation frame. */
export type TransitionStep = {style: Record<string, number | string>};

export type TransitionConfig = {
	enter?: TransitionStep[];
	exit?: TransitionStep[];
	duration?: number;
};

export type LayerOpts = {
	anchor?: Anchor;
	top?: number | string;
	left?: number | string;
	right?: number | string;
	bottom?: number | string;
	z?: number;
	capture?: boolean;
	backdrop?: BackdropKind;
	backdropColor?: string;
	role?: Role;
	overflow?: 'visible' | 'hidden';
	margin?: OffsetEdges;
	transition?: TransitionName | TransitionConfig;
	onDismiss?: () => void;
	onBackdropInput?: (input: string) => void;
};

export type OverlayDescriptor = {
	id: string;
	z: number;
	order: number;
	capture: boolean;
	backdrop: BackdropKind;
	backdropColor?: string;
	role?: Role;
	anchor?: Anchor;
	explicitPosition?: ExplicitPosition;
	content: ReactNode;
	overflow: 'visible' | 'hidden';
	margin?: OffsetEdges;
	transition?: TransitionConfig;
	onDismiss?: () => void;
	onBackdropInput?: (input: string) => void;
	exiting?: boolean;
};

export type OverlayEntry = {
	id: string;
	content: ReactNode;
	opts: LayerOpts;
};

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export type ToastOptions = {
	duration?: number;
	anchor?: Anchor;
	id?: string;
};

export type CommandPaletteItem = {
	id: string;
	label: string;
	[key: string]: unknown;
};

export type FilterFunction = (
	items: CommandPaletteItem[],
	query: string,
) => CommandPaletteItem[];
