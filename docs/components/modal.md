# `<Modal>` — Centered Bordered Dialog

`<Modal>` is a high-level overlay built on [`<Layer>`](./layers.md): a centered, bordered dialog with optional title and footer over a dimmed backdrop. It always passes `capture` and `role='dialog'` to its underlying `<Layer>`, so a modal owns keyboard input and traps focus while open, and dismisses on Escape or any non-Escape, non-Tab input (the "click-away" behavior for `role='dialog'`). Mount it anywhere inside an [`<OverlayHost>`](./overlay-host.md) tree.

## Props

| Prop           | Type                          | Default    | Description                                                                           |
| -------------- | ----------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `open`         | `boolean`                     | —          | Controlled open state. Omit for uncontrolled mode.                                    |
| `defaultOpen`  | `boolean`                     | `true`     | Initial open state in uncontrolled mode.                                              |
| `onOpenChange` | `(open: boolean) => void`     | —          | Called whenever open state changes (both modes).                                      |
| `onDismiss`    | `() => void`                  | —          | Called on Escape or click-away dismiss. Use for side effects, not state (see below).  |
| `title`        | `ReactNode`                   | —          | Rendered bold in the header row.                                                      |
| `footer`       | `ReactNode`                   | —          | Rendered dimmed in the footer row.                                                    |
| `children`     | `ReactNode`                   | —          | Modal body content.                                                                   |
| `width`        | `number \| string`            | `50`       | Width of the bordered modal box.                                                      |
| `borderStyle`  | `BoxProps['borderStyle']`     | `'round'`  | Ink border style for the modal box.                                                   |
| `borderColor`  | `string`                      | `'cyan'`   | Border color.                                                                         |
| `backdrop`     | `'none' \| 'opaque' \| 'dim'` | `'dim'`    | Backdrop style passed to `<Layer>`. See [`<Layer>` › Backdrop](./layers.md#backdrop). |
| `z`            | `number`                      | `100`      | Z-level for sorting against other layers.                                             |
| `role`         | `Role`                        | `'dialog'` | ARIA role passed to `<Layer>`. Affects Escape and backdrop-input behavior.            |

### Fixed `<Layer>` settings

These `<Layer>` props are hardcoded and cannot be overridden through `<Modal>`:

| `<Layer>` prop | Value      | Effect                                           |
| -------------- | ---------- | ------------------------------------------------ |
| `anchor`       | `'center'` | Always centered.                                 |
| `capture`      | `true`     | Always enables raw mode + focus trap while open. |
| `overflow`     | `'hidden'` | Content is clipped to the modal box.             |

For control over these (non-centered placement, non-capturing modal, custom transitions), use a bare [`<Layer>`](./layers.md).

## Behavior notes

- **Capture is always on.** A modal owns keyboard input and traps Tab/Shift+Tab focus cycling while open. Background components should gate their `useInput`/`useFocus` via [`useInputCaptureState()`](../services/hooks.md).
- **Click-away dismiss.** Because `role` defaults to `'dialog'`, any non-Escape, non-Tab input calls `onDismiss` (the `role='dialog'` scoping rule from [`<Layer>`](./layers.md#backdrop-input-scoping)). To block both click-away and Escape, pass `role="alertdialog"`.
- **`onDismiss` vs `onOpenChange`.** `handleDismiss` always calls `onDismiss` (if provided), then calls `onOpenChange(false)`. **Do not pass an `onDismiss` that sets `open=false`** — `onOpenChange` already handles state closure. Reserve `onDismiss` for side effects (logging, analytics, cleanup).

## Examples

### Confirm dialog with footer and Escape dismiss

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Modal} from '@harms-haus/ink-overlay';

function App() {
	const [open, setOpen] = useState(true);

	return (
		<OverlayHost>
			<Box padding={1}>
				<Text>A confirm dialog is open — Esc to cancel</Text>
			</Box>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Delete file"
				footer="Esc to cancel"
			>
				<Text>Are you sure you want to delete this file?</Text>
			</Modal>
		</OverlayHost>
	);
}
```

`onOpenChange` handles both Escape and click-away dismiss, so no `onDismiss` is needed for state.

### Controlled open/close with gated background input

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
	OverlayHost,
	Modal,
	useInputCaptureState,
} from '@harms-haus/ink-overlay';

function App() {
	const [open, setOpen] = useState(false);
	const isCaptured = useInputCaptureState();

	useInput(
		input => {
			if (input === 'm') setOpen(true);
		},
		{isActive: !isCaptured},
	);

	return (
		<OverlayHost>
			<Box padding={1}>
				<Text>Press m to open the modal</Text>
			</Box>

			<Modal open={open} onOpenChange={setOpen} title="My Modal">
				<Text>Press any key to dismiss (click-away), or Escape.</Text>
			</Modal>
		</OverlayHost>
	);
}
```

### Wider, custom-bordered modal

```tsx
<Modal
	open={open}
	onOpenChange={setOpen}
	title="Results"
	width={70}
	borderStyle="double"
	borderColor="magenta"
	footer="Press Esc to close"
>
	<Box flexDirection="column">
		<Text>Line one</Text>
		<Text>Line two</Text>
		<Text>Line three</Text>
	</Box>
</Modal>
```

### Non-dismissible alert dialog

Override `role` to `'alertdialog'` to block both Escape and click-away — the modal then closes only when you explicitly set `open` to `false`:

```tsx
<Modal
	open={open}
	onOpenChange={setOpen}
	role="alertdialog"
	title="Critical error"
	footer="Press r to acknowledge"
>
	<Text>You must acknowledge before continuing.</Text>
</Modal>
// Close by setting open=false from a gated input handler (see useInputCaptureState).
```
