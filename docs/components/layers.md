# `<Layer>` — Core Floating Content Primitive

`<Layer>` is the foundational building block for all floating content in ink-overlay. It is a thin, low-level component: it does not paint anything itself and renders `null`. Instead, when it is open it registers an `OverlayDescriptor` with the surrounding [`<OverlayHost>`](./overlay-host.md), which renders the positioned content through an internal `LayerRenderer`. Higher-level components — [`<Modal>`](./modal.md), [`<Popover>`](./popover.md), [`<Tooltip>`](./tooltip.md), [`<Toast>`](./toast.md), [`<CommandPalette>`](./command-palette.md) — are all built on top of `<Layer>`, but you can use `<Layer>` directly when you need a floating region that none of the specialized components express.

For a deeper look at the register/withdraw lifecycle and how the host merges declarative descriptors with imperative ones, see [Concepts › Architecture](../concepts/architecture.md).

## How `<Layer>` renders

This is worth internalizing up front, because it differs from typical React components:

- `<Layer>` itself returns `null`. It performs no visual output.
- When `open` transitions to `true`, it calls `host.registerLayer(descriptor)`.
- When props change while open, it calls `host.updateLayer(id, patch)`.
- When `open` transitions to `false` (and there is no multi-step exit transition), it calls `host.unregisterLayer(id)`.
- On unmount, it unregisters itself to avoid leaking descriptors.
- The host sorts all registered descriptors by `(z, order)` and renders each through `LayerRenderer`, which paints the backdrop, applies positioning, runs transitions, and (when `capture` is set) wraps content in a focus trap.

Because the host renders content, `<Layer>` must be mounted inside an [`<OverlayHost>`](./overlay-host.md) tree. See [Concepts › Architecture](../concepts/architecture.md) for the full lifecycle diagram.

## Controlled vs uncontrolled open state

`<Layer>` supports two open-state modes, identical in shape to a controlled input:

- **Controlled** — pass `open`. You own the value; call `onOpenChange(false)` (or set state) in response to dismiss events. `defaultOpen` is ignored.
- **Uncontrolled** — omit `open` and pass `defaultOpen` (defaults to `true`). Internal state tracks open/closed; `onOpenChange` is still called on every transition so consumers can observe.

The internal `handleDismiss` callback always invokes `onDismiss` (if provided), then either calls `onOpenChange(false)` in controlled mode or flips internal state and calls `onOpenChange(false)` in uncontrolled mode.

```tsx
// Controlled
<Layer open={show} onOpenChange={setShow} anchor="center">
  <Text>I am controlled</Text>
</Layer>

// Uncontrolled (starts open)
<Layer anchor="center" onDismiss={() => console.log('dismissed')}>
  <Text>I start open and manage myself</Text>
</Layer>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state. Omit for uncontrolled mode. |
| `defaultOpen` | `boolean` | `true` | Initial open state in uncontrolled mode. |
| `onOpenChange` | `(open: boolean) => void` | — | Called whenever open state changes (both modes). |
| `onDismiss` | `() => void` | — | Called on Escape, or on backdrop input when `role='dialog'`. See [Backdrop input scoping](#backdrop-input-scoping) below. |
| `onBackdropInput` | `() => void` | — | Called on non-Escape, non-Tab input that reaches the layer's input handler. Defaults to `onDismiss` **only** for `role='dialog'`. See [Backdrop input scoping](#backdrop-input-scoping). |
| `id` | `string` | random id | Stable unique identifier. If omitted, a random id is generated once and cached in a ref. |
| `anchor` | `Anchor` | `'center'` (when no explicit position) | One of `'center'`, `'top'`, `'bottom'`, `'left'`, `'right'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`. Mutually exclusive with `top`/`left`/`right`/`bottom`. |
| `top` | `number \| string` | — | Explicit top offset. Activates explicit positioning mode; ignored if `anchor` is set. |
| `left` | `number \| string` | — | Explicit left offset. |
| `right` | `number \| string` | — | Explicit right offset. |
| `bottom` | `number \| string` | — | Explicit bottom offset. |
| `z` | `number` | `0` | Z-level for sorting. Higher values render on top of lower ones. |
| `capture` | `boolean` | `false` | When `true`, enables raw mode and wraps content in a `<FocusTrap>`, confining Tab/Shift+Tab to the layer's region. |
| `backdrop` | `'none' \| 'opaque' \| 'dim'` | `'none'` | Backdrop style. See [Backdrop](#backdrop). |
| `backdropColor` | `string` | `'black'` (opaque) / `'#1a1a2e'` (dim) | Custom backdrop background color. Only takes effect when `backdrop !== 'none'`. |
| `role` | `Role` | — | One of `'dialog'`, `'alertdialog'`, `'menu'`, `'tooltip'`, `'toast'`. Affects Escape and backdrop-input behavior. |
| `overflow` | `'visible' \| 'hidden'` | `'hidden'` | Whether content is clipped to the layer's bounding box. |
| `margin` | `OffsetEdges` | — | `{top?, left?, right?, bottom?}` margin offsets applied to the inner content box. |
| `transition` | `TransitionName \| TransitionConfig` | — | Named transition (`'none'`, `'fade'`, `'slide-up'`, `'slide-down'`, `'slide-left'`, `'slide-right'`) or a custom step config. See [Concepts › Animation](../concepts/animation.md) and [Services › Animations](../services/animations.md). |
| `children` | `ReactNode` | — | Layer content. Pushed to the host on every change via a dedicated sync effect. |

### Anchor vs explicit positioning

`<Layer>` supports two positioning strategies, mutually exclusive:

- **Anchor mode** — set `anchor` to one of the nine anchor positions. The host wraps content in a full-viewport `flexDirection='row'` box with `alignItems`/`justifyContent` derived from the anchor via `anchorToFlexbox`. See [Concepts › Positioning](../concepts/positioning.md).
- **Explicit mode** — set any of `top`/`left`/`right`/`bottom` and omit `anchor`. The host wraps content in a `position='absolute'` box with those offsets. Values may be numeric (cells) or percentage strings (e.g. `'50%'`).

If `anchor` is provided, explicit offsets are ignored — the `explicitPosition` memo only computes when `!anchor`.

### Backdrop

Terminals have no alpha channel, so backdrops are **overpaint** — a solid-color block rendered beneath the content, not a true dimming layer. See [Concepts › Architecture](../concepts/architecture.md).

| `backdrop` | Resolved color (if `backdropColor` omitted) |
|------------|---------------------------------------------|
| `'none'`   | No backdrop painted.                        |
| `'opaque'` | `'black'`                                   |
| `'dim'`    | `'#1a1a2e'`                                 |

### Backdrop input scoping

The `LayerRenderer`'s input handler always dismisses on Escape (unless `role='alertdialog'`, which blocks Escape to force explicit dismissal). For any other non-Tab input, it consults `effectiveBackdropInput`:

```ts
const effectiveBackdropInput =
  descriptor.onBackdropInput
  ?? (descriptor.role === 'dialog' ? descriptor.onDismiss : undefined);
```

In other words:

- **`role='dialog'`** — non-Escape input auto-dismisses via `onDismiss`. This gives you "click-away"-style dismiss without wiring `onBackdropInput`.
- **`role='alertdialog'`** — Escape is blocked, and backdrop input does nothing. The dialog closes only via your explicit user action.
- **`role='menu'`, `'tooltip'`, `'toast'`, or unspecified** — non-Escape backdrop input is **not** forwarded to `onDismiss`. This is deliberate: forwarding would consume keystrokes before the component's own input handler can process them. To get backdrop dismissal for these roles, pass `onBackdropInput` explicitly.

## Examples

### Centered anchored layer

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Layer} from '@harms-haus/ink-overlay';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <OverlayHost>
      <Box padding={1}>
        <Text>Press o to toggle</Text>
      </Box>

      <Layer open={open} onOpenChange={setOpen} anchor="center">
        <Box borderStyle="round" paddingX={2} paddingY={1}>
          <Text>Floating in the middle</Text>
        </Box>
      </Layer>
    </OverlayHost>
  );
}
```

### Explicitly positioned layer

```tsx
<Layer top={2} left={4} open={open} onOpenChange={setOpen}>
  <Box padding={1}>
    <Text>Pinned 2 rows down, 4 columns in</Text>
  </Box>
</Layer>

// Percentage strings are supported
<Layer top="20%" left="50%" open={open} onOpenChange={setOpen}>
  <Box padding={1}>
    <Text>Offset by viewport percentages</Text>
  </Box>
</Layer>
```

### Captured layer with a dim backdrop

Setting `capture={true}` enables raw mode and wraps the content in a [`<FocusTrap>`](../services/hooks.md) — Tab/Shift+Tab cycle inside the layer only, and background components that gate on [`useInputCaptureState`](../services/hooks.md) will deactivate.

```tsx
<Layer
  open={open}
  onOpenChange={setOpen}
  anchor="center"
  capture
  backdrop="dim"
  role="dialog"
  onDismiss={() => setOpen(false)}
>
  <Box borderStyle="round" padding={2}>
    <Text>Press any non-Tab key to dismiss (role="dialog" backdrop rule)</Text>
  </Box>
</Layer>
```

### Layer with a named transition

Named transitions resolve to canned enter/exit step sequences. Terminals have no alpha, so `'fade'` is actually a stepped height collapse/expand; for a more visible entrance use `'slide-up'` or `'slide-down'`. See [Concepts › Animation](../concepts/animation.md) and [Services › Animations](../services/animations.md) for the full list and custom-config shape.

```tsx
<Layer open={open} onOpenChange={setOpen} anchor="bottom" transition="slide-up">
  <Box padding={1}>
    <Text>Slides up from the bottom edge</Text>
  </Box>
</Layer>

// Custom step config — see TransitionConfig in src/types.ts
<Layer
  open={open}
  onOpenChange={setOpen}
  anchor="center"
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
>
  <Box padding={1}>
    <Text>Custom multi-step slide</Text>
  </Box>
</Layer>
```

## See also

- [`<OverlayHost>`](./overlay-host.md) — the host that owns and renders layer descriptors.
- [Concepts › Architecture](../concepts/architecture.md) — registration lifecycle, z-sorting, paint order.
- [Concepts › Positioning](../concepts/positioning.md) — anchor math and explicit-position strategy.
- [Concepts › Animation](../concepts/animation.md) — transition lifecycle and frame stepping.
- [Services › Animations](../services/animations.md) — `resolveTransition`, `getTransitionSteps`.
- [`<FocusTrap>`](../services/hooks.md) — what `capture` wires up.
