# @harms-haus/ink-overlay

Overlay / modal / popover / toast / command-palette framework for [Ink](https://github.com/vadimdemedes/ink).

<!-- badges -->

## Install

```bash
npm install @harms-haus/ink-overlay
```

**Peer dependencies:** `ink >=7.0.0`, `react >=19.0.0`, `@types/react >=19.0.0 (optional)`.

## Quick Start

```tsx
import {render} from 'ink';
import React, {useState} from 'react';
import {
  OverlayHost,
  Modal,
  overlay,
  toasts,
} from '@harms-haus/ink-overlay';

function App() {
  const [showModal, setShowModal] = useState(false);

  return (
    <OverlayHost>
      <Box flexDirection="column" padding={1}>
        <Text>Press m to open a modal, t for a toast.</Text>
      </Box>

      {/* Declarative modal */}
      <Modal
        open={showModal}
        onOpenChange={setShowModal}
        title="Hello"
        onDismiss={() => setShowModal(false)}
      >
        <Text>Modal content goes here.</Text>
      </Modal>
    </OverlayHost>
  );
}

render(<App />);
```

Open an imperative toast from anywhere (no hook required):

```tsx
toasts.success('Saved!');

// Imperative overlay — any ReactNode in a floating layer
const id = overlay.open(
  <Box padding={1}>
    <Text>Custom overlay</Text>
  </Box>,
  {anchor: 'center', z: 200, backdrop: 'dim'},
);

// Later:
overlay.close(id);
```

## Mental Model

Understanding how Ink's rendering pipeline works is critical for using this framework correctly. All citations reference **ink@7.1.0** source.

### Paint Order = Tree Traversal = Z-Order

There is **no `z-index` prop** in Ink. Z-order is determined entirely by tree traversal order: later nodes paint over earlier nodes. The `Output.get()` method in `src/output.ts:160` walks `this.operations` in insertion order — each `write` operation overwrites the characters already in the output buffer at that position:

```ts
// ink/src/output.ts:160
for (const operation of this.operations) {
  // ...
  if (operation.type === 'write') {
    // characters are written into output[y][x], overwriting prior content
  }
}
```

The framework's `<OverlayHost>` sorts layers by `(z, order)` and renders them back-to-front in the JSX tree, so higher-z layers appear later in the operation list and paint on top.

### OverlayHost is a Relative Full-Screen Box; Layers are Absolute

`<OverlayHost>` renders a `<Box position="relative" width="100%" height={terminalRows}>`. Each `<LayerRenderer>` inside it renders its content wrapped in `<Box position="absolute" top={...} left={...}>`, anchored relative to the host. Position assignment happens in `src/styles.ts:415` via `applyPositionStyles`, which maps `position: 'absolute'` to `Yoga.POSITION_TYPE_ABSOLUTE` and applies top/left/right/bottom offsets.

### Backdrop is Overpaint Only — No Real Transparency

Terminals have no alpha channel. The backdrop in `src/render-background.ts` fills the content area with colorized space characters:

```ts
// ink/src/render-background.ts
const backgroundLine = colorize(' '.repeat(contentWidth), node.style.backgroundColor, 'background');
for (let row = 0; row < contentHeight; row++) {
  output.write(x + leftBorderWidth, y + topBorderHeight + row, backgroundLine, {transformers: []});
}
```

The `dim` backdrop kind uses `#1a1a2e` (a dark background color); `opaque` uses `black`. Neither applies true alpha — it is a solid block painted over the content beneath. `dimColor` in Ink is a foreground chalk modifier (`chalk.dim`), not a background dimming layer.

### Clipping via overflow="hidden"

Ink clips children that overflow a `<Box>` via the clip stack in `src/render-node-to-output.ts:167-190`. When `overflow === 'hidden'`, the renderer pushes a clip rectangle onto a stack; write operations outside the rectangle are skipped. The stack is maintained in `src/output.ts:158-166`:

```ts
// ink/src/output.ts:158-166
const clips: Clip[] = [];
for (const operation of this.operations) {
  if (operation.type === 'clip') clips.push(operation.clip);
  if (operation.type === 'unclip') clips.pop();
  // write operations consult clips.at(-1) to skip out-of-bounds text
}
```

This is why `<Layer>` defaults to `overflow="hidden"` — it prevents content from painting outside the layer's bounding box.

### useInput Handlers Fire Simultaneously

Every active `useInput` hook registers a listener on a **single shared `EventEmitter`** inside Ink's `<App>`:

```ts
// ink/src/hooks/use-input.ts:263
internal_eventEmitter.on('input', handleData);
```

When a keypress arrives, `App.tsx:268` emits once:

```ts
// ink/src/components/App.tsx:268
internal_eventEmitter.current.emit('input', input);
```

**All** registered listeners fire — there is no `consumed` boolean, no propagation stop, no priority mechanism. This is why the framework implements its own LIFO dispatcher (`InputDispatcher`) with a consumed-boolean stack, and why `useInputCaptureState()` exists: background components must cooperatively gate their `useInput`/`useFocus` with `isActive: !isCaptured`.

### Raw Mode is Ref-Counted

Ink tracks raw mode enable/disable via `rawModeEnabledCount` in `src/components/App.tsx:323-380`. Each `useInput` hook increments the count on mount and decrements on unmount; terminal raw mode is only toggled when the count transitions between 0 and 1+. This prevents flicker when multiple hooks mount/unmount in the same render cycle.

## Components

### `<OverlayHost>`

Root provider. Mount **once** near the app root. Wraps children in `InputDispatcher` and provides context for declarative layers. Manages raw mode, focus trapping, and layer merging/sorting.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | App tree (overlays render as siblings after children) |

### `<Layer>`

Declarative floating layer. Registers with the host when open; renders `null` itself — the host renders the positioned content via `LayerRenderer`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state. If omitted, uncontrolled mode. |
| `defaultOpen` | `boolean` | `true` | Initial open state for uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when open state changes. |
| `onDismiss` | `() => void` | — | Called on Escape press. |
| `onBackdropInput` | `() => void` | — | Called on non-Escape input when backdrop is active. For `role='dialog'`, this defaults to `onDismiss` (click-away dismiss). For `role='menu'`/`'tooltip'`/`'toast'`/`'alertdialog'` (or unspecified), non-Escape backdrop input is **not** forwarded to `onDismiss` unless you explicitly provide `onBackdropInput`. |
| `id` | `string` | random UUID | Stable unique identifier. |
| `anchor` | `Anchor` | — | Anchor position (`'center'`, `'top'`, `'bottom'`, `'left'`, `'right'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`). Mutually exclusive with explicit position. |
| `top` | `number \| string` | — | Explicit top offset (used when `anchor` is omitted). |
| `left` | `number \| string` | — | Explicit left offset. |
| `right` | `number \| string` | — | Explicit right offset. |
| `bottom` | `number \| string` | — | Explicit bottom offset. |
| `z` | `number` | `0` | Z-level for sorting (higher renders on top). |
| `capture` | `boolean` | `false` | Whether this layer captures input (enables raw mode + focus trap). |
| `backdrop` | `'none' \| 'opaque' \| 'dim'` | `'none'` | Backdrop style. |
| `backdropColor` | `string` | `'black'` (opaque) / `'#1a1a2e'` (dim) | Custom backdrop background color. |
| `role` | `Role` | — | ARIA role (`'dialog'`, `'alertdialog'`, `'menu'`, `'tooltip'`, `'toast'`). |
| `overflow` | `'visible' \| 'hidden'` | `'hidden'` | Content overflow behavior. |
| `margin` | `OffsetEdges` | — | Margin offsets `{top?, left?, right?, bottom?}`. |
| `transition` | `TransitionName \| TransitionConfig` | — | Built-in name (`'fade'`, `'slide-up'`, `'slide-down'`, `'slide-left'`, `'slide-right'`, `'none'`) or custom config. |
| `children` | `ReactNode` | — | Layer content. |

### `<Modal>`

Centered, bordered, titled dialog built on `<Layer>`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `true` | Initial open state for uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when open state changes. |
| `onDismiss` | `() => void` | — | Called on Escape. |
| `title` | `ReactNode` | — | Title rendered in the header. |
| `footer` | `ReactNode` | — | Footer rendered at the bottom. |
| `children` | `ReactNode` | — | Modal body content. |
| `width` | `number \| string` | `50` | Width of the modal box. |
| `borderStyle` | `BoxProps['borderStyle']` | `'round'` | Border style. |
| `borderColor` | `string` | `'cyan'` | Border color. |
| `backdrop` | `BackdropKind` | `'dim'` | Backdrop style. |
| `z` | `number` | `100` | Z-level. |
| `role` | `Role` | `'dialog'` | ARIA role. |

### `<Popover>`

Element-anchored floating layer with flip/shift/collision detection. Uses ink's `useBoxMetrics` for measurement and renders offscreen until both anchor and popover are measured (flash-free strategy).

> **Note:** `<Popover>` defaults to `defaultOpen={true}` (matching `<Layer>`'s convention) — unlike web popovers, which typically default closed. Pass `defaultOpen={false}` or use the `open` prop for explicit trigger control.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `anchorRef` | `RefObject<DOMElement \| null>` | — | Ref to the anchor element. |
| `placement` | `Placement` | `'bottom'` | Preferred placement (`'top'`, `'top-start'`, `'top-end'`, `'bottom'`, `'bottom-start'`, `'bottom-end'`, `'left'`, `'left-start'`, `'left-end'`, `'right'`, `'right-start'`, `'right-end'`). |
| `offset` | `number` | `1` | Main-axis offset (character cells) from anchor edge. |
| `crossOffset` | `number` | `0` | Cross-axis offset. |
| `flip` | `boolean` | `true` | Flip placement when it would overflow. |
| `shift` | `boolean` | `true` | Clamp position within viewport after flip. |
| `collisionPadding` | `number \| Partial<OffsetEdges>` | `0` | Extra padding during shift clamping. |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `true` | Initial open state for uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when open state changes. |
| `onDismiss` | `() => void` | — | Called on dismiss. |
| `capture` | `boolean` | `false` | Whether the popover captures input. |
| `backdrop` | `BackdropKind` | `'none'` | Backdrop style. |
| `z` | `number` | `50` | Z-level. |
| `children` | `ReactNode` | — | Popover content. |

### `<Tooltip>`

Popover variant shown on key or focus trigger with auto-dismiss timer.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `anchorRef` | `RefObject<DOMElement \| null>` | — | Ref to the anchor element. |
| `content` | `ReactNode` | — | Tooltip content. |
| `placement` | `Placement` | `'top'` | Preferred placement relative to anchor. |
| `trigger` | `'focus' \| 'key'` | `'key'` | Trigger mode. |
| `triggerKey` | `string` | `'?'` | Key that toggles the tooltip in `'key'` mode. |
| `anchorFocused` | `boolean` | — | Consumer-driven focus state for `'focus'` trigger mode. |
| `dismissDelay` | `number` | `3000` | Auto-dismiss delay in ms. |
| `offset` | `number` | — | Main-axis offset (passed to Popover). |
| `crossOffset` | `number` | — | Cross-axis offset (passed to Popover). |
| `flip` | `boolean` | — | Allow placement flip (passed to Popover). |
| `shift` | `boolean` | — | Clamp within viewport (passed to Popover). |
| `z` | `number` | `10` | Z-level. |

### `<Toast>`

Presentational toast component (renders a bordered row with icon + text). Used internally by the toast service; also available as a standalone presentational component.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `kind` | `ToastKind` | `'info'` | Toast kind (`'success'`, `'error'`, `'info'`, `'warn'`). |
| `children` | `ReactNode` | — | Toast message content. |
| `icon` | `ReactNode` | per-kind default | Custom icon override. |

### `<CommandPalette>`

Filterable, keyboard-navigable list overlay built on `<Layer>` with `capture anchor="center"`. Renders a rounded-border box with title, filter input (with fake cursor), and windowed item list.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `CommandPaletteItem[]` | — | Array of `{id, label, ...}` items. |
| `renderItem` | `(item, isSelected) => ReactNode` | — | Custom item renderer. |
| `filter` | `(items, query) => CommandPaletteItem[]` | match-sorter | Custom filter function. |
| `maxVisible` | `number` | `10` | Maximum visible items in the window. |
| `placeholder` | `string` | `'Type a command…'` | Filter input placeholder. |
| `emptyMessage` | `string` | `'No matching commands'` | Empty state message. |
| `onItemSelect` | `(item) => void` | — | Called when Enter is pressed on an item. |
| `closeOnSelect` | `boolean` | `true` | Close the palette after an item is selected via Enter. Set to `false` to keep the palette open and manage closing yourself. |
| `onDismiss` | `() => void` | — | Called on Escape. |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `true` | Initial open state for uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when open state changes. |
| `title` | `string` | `'Command Palette'` | Title text. |
| `width` | `number \| string` | `60` | Width of the palette box. |
| `z` | `number` | `200` | Z-level. |

**Notes:**

- Filter state (`query`, `cursor` index, `selectedIndex`, scroll `offset`) **resets to defaults** each time the palette opens, so users always start from a clean slate.
- The filter input renders a visible inverse-space cursor block even in the empty state (no query typed).

### `<FocusTrap>`

Convenience wrapper around `useFocusTrap`. Confines Tab/Shift+Tab cycling to children while active.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `active` | `boolean` | `true` | Whether the trap is active. |
| `onEscape` | `() => void` | — | Called on Escape inside the trap. |
| `restoreFocus` | `boolean` | `true` | Restore focus to the previously-focused element on deactivation. |
| `children` | `ReactNode` | — | Content to trap. |

## Hooks

### `useInputCaptureState`

```ts
function useInputCaptureState(): boolean;
```

Returns `true` while at least one capturing overlay is active (i.e. `captureDepth > 0`). Background components gate their `useInput` / `useFocus` on the negation of this value:

```tsx
const isCaptured = useInputCaptureState();
useInput(handler, {isActive: !isCaptured});
```

See [Cooperative Input Gating](#-cooperative-input-gating-important-limitation) for the full pattern.

### `useRegisterInput`

```ts
function useRegisterInput(
  id: string,
  handler: (input: string, key: Key) => boolean | void,
  isActive?: boolean,
): void;
```

Registers `handler` on the LIFO input-dispatcher stack maintained by `<InputDispatcher>` (mounted inside `<OverlayHost>`). On each keypress the stack is walked top-down; returning `true` from `handler` consumes the event and stops the walk. When `isActive` is `false` (default `true`) the handler is not registered.

### `useFocusTrap`

```ts
function useFocusTrap(
  active: boolean,
  options?: {onEscape?: () => void; restoreFocus?: boolean},
): {trapId: string; isTrapped: boolean};
```

The hook behind `<FocusTrap>`. While `active`, it disables Ink's global Tab navigation, intercepts Tab/Shift+Tab to cycle focus within the region, and increments `captureDepth` so cooperative background components deactivate. `restoreFocus` (default `true`) returns focus to the previously-focused element on deactivation. Returns a stable `trapId` and an `isTrapped` boolean that mirrors `active`.

## Shared Types & Exports

The following types and helpers are exported from the package barrel:

### Shared Types

| Type | Shape | Description |
|------|-------|-------------|
| `AnchorRect` | `{left, top, width, height}` | Anchor rect in root-relative coordinates. |
| `Rect` | `{width, height}` | Generic width/height pair. |
| `Viewport` | `{columns, rows}` | Terminal viewport dimensions. |
| `OffsetEdges` | `{top?, left?, right?, bottom?}` | Optional per-edge offsets (used by `margin`). |

### Helpers

- **`defaultToastColors`** — A `Record<ToastKind, string>` mapping each kind to its color: `success → 'green'`, `error → 'red'`, `warn → 'yellow'`, `info → 'blue'`. Use it to reference or override the per-kind palette in custom toast rendering.
- **`resolveTransition`** — `(transition: TransitionName | TransitionConfig | undefined) → TransitionConfig | undefined`. Resolves a named transition (e.g. `'fade'`) into its step-based config. Pass `undefined` to get `undefined`. Useful for programmatic transition resolution before passing to a `<Layer>`.
- **`getTransitionSteps`** — `(name: TransitionName) → TransitionConfig`. Returns the predefined enter/exit frame sequence for a named transition (`'fade'`, `'slide-up'`, `'slide-down'`, `'slide-left'`, `'slide-right'`, `'none'`). Results are cached per name. Lower-level than `resolveTransition`, which delegates to this function.

### Utility Exports

The remaining exported helpers from the package barrel:

| Function | Signature | Description |
|----------|-----------|-------------|
| `anchorToFlexbox` | `(anchor: Anchor) → {alignItems, justifyContent}` | Maps an `Anchor` to flexbox `alignItems`/`justifyContent` for a `flexDirection='row'` wrapper. |
| `computeAnchorCoords` | `(anchor: Anchor, viewport: Viewport, layerSize: Rect, margin?: OffsetEdges) → {top, left}` | Pure coordinate math for positioning a layer of known size within a viewport. |
| `computePopoverPosition` | `(anchorRect: AnchorRect, popoverSize: Rect, viewport: Viewport, placement: Placement, opts?) → {top, left, placement}` | Computes popover position with flip/shift/collision detection. |
| `sortLayers` | `(layers: T[]) → T[]` | Returns a new array sorted ascending by `(z, order)`. Does not mutate input. |
| `isBun` | `() → boolean` | Returns `true` when running under Bun (`globalThis.Bun` is defined). |
| `isNonInteractive` | `() → boolean` | Returns `true` when stdout is not a TTY or `CI` env var is set. |
| `getRuntimeInfo` | `() → {bun, interactive, rawModeSupported}` | Snapshot of the current runtime environment. |

## Imperative API

### `overlay` service

Import `overlay` from `@harms-haus/ink-overlay` to open/close/update floating layers from anywhere — no hook required.

```ts
import {overlay} from '@harms-haus/ink-overlay';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `open` | `(content: ReactNode, opts?: LayerOpts) => string` | Open a new overlay. Returns a unique id. |
| `close` | `(id: string) => void` | Close (remove) an overlay by id. No-op if not found. |
| `closeAll` | `() => void` | Close every overlay. |
| `update` | `(id: string, patch: Partial<LayerOpts>, newContent?: ReactNode) => void` | Shallow-merge a patch into an existing overlay's opts. The optional `newContent` arg atomically replaces the overlay's content in the same update. |

### `toasts` service

Stacking auto-dismiss toast service. All active toasts render as a single overlay store entry using `column-reverse` so the newest toast appears at the bottom (near the anchor corner).

**Max stack:** Only the **3 most-recent** toasts are visible (`DEFAULT_MAX_TOASTS = 3`). When at capacity, the **oldest** toast is evicted before a new one is added. This is currently a constant — it is not configurable.

**Anchor inheritance:** The container anchor is inherited from the **oldest** (first-added) toast's `anchor` option. Toasts added later with a different `anchor` do **not** relocate the existing stack.

```ts
import {toasts} from '@harms-haus/ink-overlay';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(message: ReactNode, opts?: ToastOptions) => string` | Show an info toast. Returns a toast id. |
| `success` | `(message: ReactNode, opts?: ToastOptions) => string` | Show a success toast. |
| `error` | `(message: ReactNode, opts?: ToastOptions) => string` | Show an error toast. |
| `info` | `(message: ReactNode, opts?: ToastOptions) => string` | Show an info toast. |
| `warn` | `(message: ReactNode, opts?: ToastOptions) => string` | Show a warning toast. |
| `dismiss` | `(id: string) => void` | Dismiss a single toast by id. |
| `dismissAll` | `() => void` | Dismiss all active toasts. |

**`ToastOptions`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `duration` | `number` | `4000` | Auto-dismiss delay in ms. |
| `anchor` | `Anchor` | `'bottom-right'` | Anchor position for the toast container. |
| `id` | `string` | generated | Stable id (calling `show` with an existing id replaces the previous toast). |

## Examples

### Centered Modal

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Modal} from '@harms-haus/ink-overlay';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <OverlayHost>
      <Box flexDirection="column" padding={1}>
        <Text>Press m to open</Text>
      </Box>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Confirm"
        footer="Esc to close"
        onDismiss={() => setOpen(false)}
      >
        <Text>Are you sure?</Text>
      </Modal>
    </OverlayHost>
  );
}
```

### Popover Anchored to an Element

```tsx
import React, {useRef, useState} from 'react';
import {Box, Text, useFocus} from 'ink';
import {OverlayHost, Popover} from '@harms-haus/ink-overlay';

function App() {
  const anchorRef = useRef(null);
  const {isFocused} = useFocus();

  return (
    <OverlayHost>
      <Box ref={anchorRef} paddingX={1}>
        <Text>Hover me</Text>
      </Box>

      <Popover
        anchorRef={anchorRef}
        placement="bottom"
        open={isFocused}
      >
        <Box borderStyle="round" paddingX={1}>
          <Text>Popover content</Text>
        </Box>
      </Popover>
    </OverlayHost>
  );
}
```

### Toasts

```tsx
import {toasts} from '@harms-haus/ink-overlay';

// Fire and forget
toasts.success('File saved');
toasts.error('Connection failed');
toasts.warn('Slow network');
toasts.info('Syncing…');

// Custom duration and anchor
const id = toasts.show('Processing…', {duration: 10_000, anchor: 'top-right'});
// Later:
toasts.dismiss(id);
```

### Command Palette

```tsx
import React from 'react';
import {OverlayHost, CommandPalette} from '@harms-haus/ink-overlay';

const items = [
  {id: 'save', label: 'Save file'},
  {id: 'open', label: 'Open file'},
  {id: 'quit', label: 'Quit'},
];

function App() {
  const [open, setOpen] = React.useState(false);

  return (
    <OverlayHost>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items}
        onItemSelect={item => {
          console.log('Selected:', item.id);
          // closeOnSelect defaults to true, so Enter already
          // closes the palette — no manual setOpen(false) needed.
        }}
        onDismiss={() => setOpen(false)}
      />
    </OverlayHost>
  );
}
```

### Nested Overlays (Modal Opens a Popover)

```tsx
import React, {useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Modal, Popover} from '@harms-haus/ink-overlay';

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const triggerRef = useRef(null);

  return (
    <OverlayHost>
      <Text>Press m to open modal</Text>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Nested Example"
      >
        <Box ref={triggerRef}>
          <Text>Press p for popover</Text>
        </Box>

        <Popover
          anchorRef={triggerRef}
          open={popoverOpen}
          placement="bottom"
          z={150}
          backdrop="none"
        >
          <Box borderStyle="round" paddingX={1}>
            <Text>I float above the modal!</Text>
          </Box>
        </Popover>
      </Modal>
    </OverlayHost>
  );
}
```

### Custom Transitions

> **Note on `'fade'`:** Terminals have no alpha channel, so `'fade'` is a **stepped height-grow** (0→1) — a collapse/expand effect, not a true opacity fade. For a more visible entrance, consider `'slide-up'` or `'slide-down'`.

```tsx
import {Layer} from '@harms-haus/ink-overlay';

// Built-in named transitions
<Layer transition="fade" open={show}>
  <Box padding={1}><Text>Fades in and out</Text></Box>
</Layer>

// Custom transition config
<Layer
  transition={{
    enter: [
      {style: {marginTop: 4}},
      {style: {marginTop: 2}},
      {style: {marginTop: 0}},
    ],
    exit: [
      {style: {marginTop: 0}},
      {style: {marginTop: 4}},
    ],
    duration: 60,
  }}
  open={show}
>
  <Box padding={1}><Text>Custom slide</Text></Box>
</Layer>
```

## How It Works

### Registration Pattern

`<Layer>` does **not** render floating content directly. When a `<Layer>` opens, it calls `host.registerLayer(descriptor)` via the `OverlayHostContext`, passing a descriptor with its `z`, `anchor`, `content`, `backdrop`, etc. The descriptor is stored in a mutable ref inside the host.

When a `<Layer>` closes, it calls `host.unregisterLayer(id)`. When props change while open, it calls `host.updateLayer(id, patch)`.

The host merges declarative descriptors (from context registration) and imperative descriptors (from `overlayStore.subscribe`), sorts them by `(z, order)` via `sortLayers()`, and renders each through `<LayerRenderer>` — back-to-front in JSX order, ensuring correct z-order painting.

### Input Dispatcher

`<OverlayHost>` wraps its children in `<InputDispatcher>`, which provides a **LIFO handler stack** via context. Each `<LayerRenderer>` that captures input registers a handler via `useRegisterInput(id, handler, isActive)`. The handler stack is a plain array; on each keypress, the dispatcher walks the stack from top (most recently registered) to bottom. If a handler returns `true`, the walk stops (consumed).

The dispatcher also maintains a `captureDepth` counter. When `captureDepth > 0`, the `isCaptured` signal is `true`. Background components gate their own `useInput`/`useFocus` with:

```tsx
import {useInput} from 'ink';

const isCaptured = useInputCaptureState();
useInput(myHandler, {isActive: !isCaptured});
```

### Focus Trapping

When `capture={true}` on a layer, the `<LayerRenderer>` wraps content in `<FocusTrap active={true}>`. The trap:

1. Disables Ink's global focus navigation via `focusManager.disableFocus()`.
2. Registers its own `useRegisterInput` handler that intercepts Tab/Shift+Tab and forwards to `focusManager.focusNext()`/`focusManager.focusPrevious()`.
3. Increments `captureDepth` so background components see `isCaptured = true` and deactivate their `useFocus`.
4. On Escape (unless `role="alertdialog"`), calls `onDismiss`.
5. On deactivation, restores global focus and optionally returns focus to the previously-focused element.

## Runtime Caveats

### Bun

Rendering works, but **interactive input** (`useInput`, focus trap, keyboard dismiss) is **non-functional** due to [bun#6862](https://github.com/oven-sh/bun/issues/6862) — Bun does not call `process.stdin.resume()`, so no keypress events arrive. Raw mode may also not restore on exit due to [bun#12918](https://github.com/oven-sh/bun/issues/12918) — the framework restores raw mode on **clean unmount** of `<OverlayHost>`, but if your process exits abruptly (e.g. via SIGINT under Bun), you may need to register your own `process.on('SIGINT', …)` handler that disables raw mode and re-enables focus as a safety net. **Use Node for interactive features.**

### Non-TTY / CI

Degrades gracefully: overlays render their final frames, raw mode is not enabled (guarded by `isRawModeSupported`), and keyboard input is non-functional. This is consistent with Ink's `interactive: false` behavior.

### Flicker

Ink does a **full-screen clear** when a frame's height ≥ `stdout.rows` (`src/ink.tsx:141-163`) — keep overlay content within `rows - 1` to avoid flicker. Width decrease also triggers a full clear (`src/ink.tsx:479-483`):

```ts
// ink/src/ink.tsx:479
resized = () => {
  if (currentWidth < this.lastTerminalWidth) {
    this.log.clear();
  }
};
```

**Recommendation:** pass `incrementalRendering: true` in the host app's `render()` call to reduce flicker on resize.

### Dependencies

`chalk` (~10KB) and `match-sorter` (~1.5KB) are the **only runtime dependencies** beyond ink and react. `match-sorter` powers the default `CommandPalette` filter (override via the `filter` prop). `chalk` is used internally by `CommandPalette` to render the inverse-video fake cursor.

### ⚠️ Cooperative Input Gating (Important Limitation)

The framework's `InputDispatcher` **cannot block an uncooperative standalone `useInput`**. Ink fires all `useInput` handlers simultaneously on a shared `EventEmitter` — there is no priority or stop-propagation mechanism.

**All background components MUST gate their input handling:**

```tsx
import {useInput} from 'ink';
import {useInputCaptureState} from '@harms-haus/ink-overlay';

function BackgroundComponent() {
  const isCaptured = useInputCaptureState();

  useInput((input, key) => {
    // This only fires when no overlay is capturing
  }, {isActive: !isCaptured});

  return null;
}
```

Similarly, gate `useFocus`:

```tsx
import {useFocus} from 'ink';
import {useInputCaptureState} from '@harms-haus/ink-overlay';

function BackgroundComponent() {
  const isCaptured = useInputCaptureState();
  const {isFocused} = useFocus({isActive: !isCaptured});
  // ...
}
```

This is a **documented limitation**, not a bug. The cooperative model is the only safe pattern given Ink's architecture.

The framework's own `<Tooltip>` honors this pattern: its key-trigger `useInput` handler is gated behind `useInputCaptureState()` so the trigger key does not fire while a capturing modal or layer is open.

## Testing Helpers

### `renderWithHost`

Wraps `ink-testing-library`'s `render()` inside an `<OverlayHost>` so `<Layer>` and context-dependent components work out of the box.

> **Note:** These helpers are `.ts/.tsx` source files that are **not** built to `dist/` and the package only exports the `.` subpath. Importing via `@harms-haus/ink-overlay/tests/helpers/…` will **fail** because the package exports field only maps the root "." subpath. **Copy** the helper into your own test setup and import it locally instead.

Usage (after copying into e.g. `test/helpers/render-with-host.tsx`):

```tsx
import {renderWithHost} from './helpers/render-with-host';
import {Modal} from '@harms-haus/ink-overlay';

const {lastFrame, unmount} = renderWithHost(
  <Modal open title="Test">
    <Text>Content</Text>
  </Modal>,
);

expect(lastFrame()).toContain('Content');
unmount();
```

**Reference source:** `tests/helpers/render-with-host.tsx`

### `createResizableStdout` / `renderResizable`

Creates a fake `stdout`/`stdin` pair whose terminal dimensions can be mutated at runtime via `resize()`, causing Ink to re-render with the new size. Uses **real timers** — `await delay(...)` after render or resize to let frames flush.

Usage (after copying into your own test setup):

```tsx
import {renderResizable} from './helpers/create-resizable-stdout';
import {delay} from './helpers/delay';

const {lastFrame, resize, unmountAndCleanup} = renderResizable(
  <MyApp />,
  {columns: 80, rows: 24},
);

await delay(100);
expect(lastFrame()).toContain('expected');

resize(120, 40);
await delay(100);
expect(lastFrame()).toContain('resized content');

unmountAndCleanup();
```

**Reference source:** `tests/helpers/create-resizable-stdout.ts`

## License

MIT
