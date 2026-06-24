/**
 * CommandPalette — a filterable, keyboard-navigable list overlay.
 *
 * Built on {@link Layer} with `capture anchor="center"`. Renders a
 * rounded-border box containing a title row, a filter input with a
 * fake cursor, and a windowed list of items.
 *
 * @module command-palette
 */

import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import {Box, Text, type Key} from 'ink';
import chalk from 'chalk';
import {matchSorter} from 'match-sorter';
import {Layer} from './layer.js';
import {useRegisterInput} from './input-dispatcher.js';
import type {CommandPaletteItem, FilterFunction} from './types.js';

// ── Props ────────────────────────────────────────────────────────────

export type CommandPaletteProps = {
	items: CommandPaletteItem[];
	renderItem?: (item: CommandPaletteItem, isSelected: boolean) => ReactNode;
	filter?: FilterFunction;
	maxVisible?: number;
	placeholder?: string;
	emptyMessage?: string;
	onItemSelect?: (item: CommandPaletteItem) => void;
	onDismiss?: () => void;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	closeOnSelect?: boolean;
	title?: string;
	width?: number | string;
	z?: number;
};

// ── Component ────────────────────────────────────────────────────────

export function CommandPalette({
	items,
	renderItem,
	filter,
	maxVisible = 10,
	placeholder = 'Type a command\u2026',
	emptyMessage = 'No matching commands',
	onItemSelect,
	onDismiss,
	open,
	defaultOpen,
	onOpenChange,
	closeOnSelect = true,
	title = 'Command Palette',
	width = 60,
	z = 200,
}: CommandPaletteProps) {
	const paletteId = useId();

	// ── Controlled vs uncontrolled open state ─────────────────────

	const isControlled = open !== undefined;
	const [internalOpen, setInternalOpen] = useState(defaultOpen ?? true);
	const isOpen = isControlled ? open : internalOpen;

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isControlled) {
			setInternalOpen(nextOpen);
		}

		onOpenChange?.(nextOpen);
	};

	// ── State ─────────────────────────────────────────────────────

	const [query, setQuery] = useState('');
	const [cursorIndex, setCursorIndex] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [offset, setOffset] = useState(0);

	// ── Reset state on open ─────────────────────────────────────

	const previousOpenRef = useRef(isOpen);
	useEffect(() => {
		if (!previousOpenRef.current && isOpen) {
			setQuery('');
			setCursorIndex(0);
			setSelectedIndex(0);
			setOffset(0);
		}

		previousOpenRef.current = isOpen;
	}, [isOpen]);

	// ── Filter ────────────────────────────────────────────────────

	const filtered = useMemo(() => {
		if (filter) {
			return filter(items, query);
		}

		return matchSorter(items, query, {keys: ['label']});
	}, [items, query, filter]);

	// ── Reset selectedIndex and offset when query changes ─────────

	const previousQueryReference = useRef(query);
	useEffect(() => {
		if (query !== previousQueryReference.current) {
			previousQueryReference.current = query;
			setSelectedIndex(0);
			setOffset(0);
		}
	}, [query]);

	// ── Clamp selectedIndex when filtered shrinks ─────────────────

	useEffect(() => {
		setSelectedIndex(previous =>
			filtered.length === 0 ? 0 : Math.min(previous, filtered.length - 1),
		);
	}, [filtered.length]);

	// ── Scroll-into-view ──────────────────────────────────────────

	const visibleCount = maxVisible;
	const listOffset = useMemo(() => {
		if (selectedIndex < offset) {
			return selectedIndex;
		}

		if (selectedIndex >= offset + visibleCount) {
			return selectedIndex - visibleCount + 1;
		}

		return offset;
	}, [selectedIndex, offset, visibleCount]);

	// Update offset via effect to avoid render-loop
	useEffect(() => {
		setOffset(listOffset);
	}, [listOffset]);

	// ── Visible items ─────────────────────────────────────────────

	const visibleItems = useMemo(
		() => filtered.slice(offset, offset + visibleCount),
		[filtered, offset, visibleCount],
	);

	// ── Fake cursor rendering ─────────────────────────────────────

	const filterInputWithCursor = useMemo(() => {
		if (query.length === 0) {
			return null;
		}

		const before = query.slice(0, cursorIndex);
		const cursorChar = query[cursorIndex];
		const after = query.slice(cursorIndex + 1);

		// Render cursor: inverse the character at cursorIndex, or inverse space at end.
		const cursorDisplay = cursorChar
			? chalk.inverse(cursorChar)
			: chalk.inverse(' ');

		return (
			<>
				<Text>{before}</Text>
				<Text>{cursorDisplay}</Text>
				<Text>{after}</Text>
			</>
		);
	}, [query, cursorIndex]);

	// ── Input handler (plain function — no useCallback needed) ────
	//
	// useRegisterInput stabilises via useEffectEvent so the handler
	// reference can change freely without churning the stack. Reading
	// filtered/selectedIndex/cursorIndex directly avoids stale closures.

	const handleInput = (input: string, key: Key) => {
		if (key.upArrow) {
			setSelectedIndex(previous => Math.max(0, previous - 1));
			return true;
		}

		if (key.downArrow) {
			setSelectedIndex(previous =>
				filtered.length === 0 ? 0 : Math.min(filtered.length - 1, previous + 1),
			);
			return true;
		}

		if (key.return) {
			const item = filtered[selectedIndex];
			if (item) {
				onItemSelect?.(item);
			}

			if (closeOnSelect) {
				handleOpenChange(false);
			}

			return true;
		}

		if (key.escape) {
			handleOpenChange(false);
			onDismiss?.();
			return true;
		}

		if (key.backspace) {
			if (cursorIndex > 0) {
				setQuery(q => q.slice(0, cursorIndex - 1) + q.slice(cursorIndex));
				setCursorIndex(previous => previous - 1);
			}

			return true;
		}

		if (key.leftArrow) {
			setCursorIndex(previous => Math.max(0, previous - 1));
			return true;
		}

		if (key.rightArrow) {
			setCursorIndex(previous => Math.min(query.length, previous + 1));
			return true;
		}

		// Printable character (single char, not ctrl/meta)
		if (input.length === 1 && !key.ctrl && !key.meta) {
			setQuery(q => q.slice(0, cursorIndex) + input + q.slice(cursorIndex));
			setCursorIndex(previous => previous + 1);
			return true;
		}

		// Unhandled key — do not consume (lets Ctrl+C, Tab, etc. fall through)
		return false;
	};

	useRegisterInput(paletteId, handleInput, isOpen);

	// ── Render ────────────────────────────────────────────────────

	return (
		<Layer
			capture
			anchor="center"
			z={z}
			backdrop="dim"
			role="menu"
			open={isOpen}
			onOpenChange={handleOpenChange}
			onDismiss={onDismiss}
		>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				width={width}
				padding={1}
			>
				{/* Title */}
				<Text bold>{title}</Text>

				{/* Filter input */}
				<Text>
					<Text color="gray">{'\u276F'} </Text>
					{query.length > 0 ? (
						filterInputWithCursor
					) : (
						<>
							<Text dimColor>{placeholder}</Text>
							<Text>{chalk.inverse(' ')}</Text>
						</>
					)}
				</Text>

				{/* Separator */}
				<Box borderTop />

				{/* List */}
				<Box flexDirection="column">
					{/* Top indicator */}
					{offset > 0 && (
						<Text dimColor>
							{'  '}
							{'\u25B2'} {offset} more
						</Text>
					)}

					{/* Visible items */}
					{visibleItems.map((item, i) => {
						const isSelected = i === selectedIndex - offset;
						if (renderItem) {
							return <Box key={item.id}>{renderItem(item, isSelected)}</Box>;
						}

						return (
							<Text
								key={item.id}
								color={isSelected ? 'cyan' : undefined}
								backgroundColor={isSelected ? 'gray' : undefined}
							>
								{isSelected ? '\u25B8' : ' '} {item.label}
							</Text>
						);
					})}

					{/* Bottom indicator */}
					{offset + visibleCount < filtered.length && (
						<Text dimColor>
							{'  '}
							{'\u25BC'} {filtered.length - offset - visibleCount} more
						</Text>
					)}

					{/* Empty state */}
					{filtered.length === 0 && <Text dimColor>{emptyMessage}</Text>}
				</Box>
			</Box>
		</Layer>
	);
}
