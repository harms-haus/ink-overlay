# `<Popover>`

`<Popover>` renders a floating layer anchored to a specific element in your tree, with automatic flip, shift, and collision detection. Internally it wraps [`<Layer>`](./layers.md) and uses ink's `useBoxMetrics` to measure both the anchor and the popover content before positioning. Use it for tooltips, menus, contextual help, or any UI that should "hang off" a known element rather than snap to a viewport edge.

## How positioning works

`<Popover>` follows a **flash-free offscreen-measure strategy**: until both the anchor's root-relative rect *and* the popover's own size are measured, the underlying layer is rendered offscreen at a large negative offset (`top: -9999`, `left: -9999`). Once both measurements are available, a `useEffect` calls `computePopoverPosition` (from `src/primitives.ts`) and the layer snaps directly to its final position — it never flashes at `(0, 0)`.

The anchor's position is derived by `getRootRelativeRect`, which walks the anchor's `parentNode` chain summing each ancestor's yoga `getComputedLayout()` left/top, producing a root-relative `AnchorRect` that the host can position against. The position effect re-runs whenever the anchor's parent-relative metrics, the popover's metrics, or the viewport (`columns`/`rows`) change.

### Flip, shift, collision padding

- **`flip`** — if the popover would overflow the viewport on its main axis, the placement is mirrored across the anchor (`top` ↔ `bottom`, `left` ↔ `right`). The cross-axis *side* (`start`/`center`/`end`) is preserved.
- **`shift`** — after any flip, the popover is clamped within the viewport so no edge spills off-screen.
- **`collisionPadding`** — extra inset (in character cells) applied during shift clamping, keeping the popover away from the terminal edges. A single number applies to all four edges; a partial `OffsetEdges` object lets you pad individual edges.

See [Positioning Concepts](../concepts/positioning.md) for the underlying coordinate math, and [Limitations](../concepts/limitations.md) for cases the collision logic cannot handle (notably ancestor/sibling layout shifts).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `anchorRef` | `RefObject<DOMElement \| null>` | — | Ref attached to the anchor element the popover is positioned relative to. **Required.** |
| `placement` | `Placement` | `'bottom'` | Preferred placement. One of the 12 values below. |
| `offset` | `number` | `1` | Main-axis offset (character cells) from the anchor edge. |
| `crossOffset` | `number` | `0` | Cross-axis offset from the anchor's cross-axis start. |
| `flip` | `boolean` | `true` | Mirror placement across the anchor when it would overflow the viewport. |
| `shift` | `boolean` | `true` | Clamp the popover within the viewport after any flip. |
| `collisionPadding` | `number \| Partial<OffsetEdges>` | `0` | Extra inset applied during shift clamping. |
| `open` | `boolean` | — | Controlled open state. Omit for uncontrolled mode. |
| `defaultOpen` | `boolean` | `true` | Initial open state for uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when the open state changes. |
| `onDismiss` | `() => void` | — | Called when the popover is dismissed (e.g. Escape). |
| `capture` | `boolean` | `false` | Whether the popover captures input (raw mode + focus trap). |
| `backdrop` | `BackdropKind` | `'none'` | Backdrop style (`'none'`, `'opaque'`, `'dim'`). |
| `z` | `number` | `50` | Z-level for sorting — higher renders on top. |
| `children` | `ReactNode` | — | Popover content. |

### `placement` values

All 12 supported placements (axis-side form; the `-center` suffix is implicit and may be omitted):

```
top  top-start  top-end
bottom  bottom-start  bottom-end
left  left-start  left-end
right  right-start  right-end
```

For `top`/`bottom`, the **main axis is vertical** and the cross axis (side) is horizontal. For `left`/`right`, the main axis is horizontal and the cross axis is vertical.

### The `defaultOpen={true}` convention

> Unlike web popovers (which typically default to closed), this `<Popover>` **defaults to open** — matching `<Layer>`'s convention so content is visible without an explicit `open` prop. Pass `defaultOpen={false}` or use the `open` prop for explicit trigger control.

## The `anchorRef` pattern

Create a ref with `useRef` and attach it to a `<Box>` (or any element exposing a `DOMElement` ref) that serves as the anchor, then pass the same ref to `<Popover anchorRef={...}>`. The popover measures that element's root-relative rect on every relevant change. The simplest case (popover always open, defaulting to `defaultOpen={true}`):

```tsx
import {useRef} from 'react';
import {Box, Text, type DOMElement} from 'ink';
import {OverlayHost, Popover} from '@harms-haus/ink-overlay';

function App() {
  const anchorRef = useRef<DOMElement>(null);
  return (
    <OverlayHost>
      <Box ref={anchorRef} paddingX={1}><Text>Anchor element</Text></Box>
      <Popover anchorRef={anchorRef} placement="bottom">
        <Box borderStyle="round" paddingX={1}><Text>Floats below the anchor</Text></Box>
      </Popover>
    </OverlayHost>
  );
}
```

## Examples

### Popover anchored to a focused element

Use ink's `useFocus` to drive open state — the popover appears when the anchor is focused and disappears when it loses focus. Gate `useFocus` with [`useInputCaptureState`](../concepts/input-and-focus.md) so it doesn't steal focus while a capturing overlay is open.

```tsx
import {useRef} from 'react';
import {Box, Text, useFocus, type DOMElement} from 'ink';
import {
  OverlayHost,
  Popover,
  useInputCaptureState,
} from '@harms-haus/ink-overlay';

function HelpTarget() {
  const ref = useRef<DOMElement>(null);
  const isCaptured = useInputCaptureState();
  const {isFocused} = useFocus({isActive: !isCaptured});

  return (
    <>
      <Box ref={ref}>
        <Text>{isFocused ? '[ Help ]' : 'Help'}</Text>
      </Box>

      <Popover
        anchorRef={ref}
        placement="bottom-start"
        open={isFocused}
        offset={0}
      >
        <Box borderStyle="single" paddingX={1}>
          <Text>Focus me to see this tip.</Text>
        </Box>
      </Popover>
    </>
  );
}

function App() {
  return (
    <OverlayHost>
      <HelpTarget />
    </OverlayHost>
  );
}
```

### Controlled popover

Drive open state explicitly (e.g. from a keypress). This example toggles the popover on `p` and dismisses on Escape via `onDismiss`.

```tsx
import {useRef, useState} from 'react';
import {Box, Text, useInput, type DOMElement} from 'ink';
import {OverlayHost, Popover} from '@harms-haus/ink-overlay';

function App() {
  const ref = useRef<DOMElement>(null);
  const [open, setOpen] = useState(false);

  useInput((input) => {
    if (input === 'p') setOpen(v => !v);
  });

  return (
    <OverlayHost>
      <Box ref={ref} paddingX={1}>
        <Text>Press p to toggle</Text>
      </Box>

      <Popover
        anchorRef={ref}
        placement="right"
        offset={2}
        open={open}
        onOpenChange={setOpen}
        onDismiss={() => setOpen(false)}
      >
        <Box borderStyle="round" paddingX={1}>
          <Text>Controlled popover</Text>
        </Box>
      </Popover>
    </OverlayHost>
  );
}
```

### Nested popover floating above a modal

A `<Popover>` inside a `<Modal>` renders as a sibling layer with a higher `z`, so it paints on top of the modal. Use a `z` above the modal's default (`100`) — e.g. `z={150}`.

```tsx
import {useRef, useState} from 'react';
import {Box, Text, useInput, type DOMElement} from 'ink';
import {OverlayHost, Modal, Popover} from '@harms-haus/ink-overlay';

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const triggerRef = useRef<DOMElement>(null);

  useInput((input) => {
    if (input === 'm') setModalOpen(true);
    if (input === 'p') setTipOpen((v) => !v);
  });

  return (
    <OverlayHost>
      <Box>
        <Text>Press m to open the modal, then p for a popover</Text>
      </Box>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Nested"
      >
        <Box ref={triggerRef}>
          <Text>Press p for a popover</Text>
        </Box>

        <Popover
          anchorRef={triggerRef}
          placement="bottom"
          z={150}
          backdrop="none"
          open={tipOpen}
          onOpenChange={setTipOpen}
          onDismiss={() => setTipOpen(false)}
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

## Limitations

`<Popover>` repositions on anchor resize, popover-content resize, and terminal resize, but it **does not track ancestor/sibling layout shifts**. The position effect keys off parent-relative metrics and the viewport; when a sibling or ancestor moves the anchor's root-relative position *without* changing its parent-relative metrics, the popover will not follow. Ink exposes no public per-node layout observer. If the anchor moves due to surrounding content changes, close and reopen the popover, or `key` it on the layout-affecting state. See [Limitations](../concepts/limitations.md) and [Positioning](../concepts/positioning.md) for the full discussion.
