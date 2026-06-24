# `<Tooltip>`

`<Tooltip>` is a convenience wrapper around [`<Popover>`](./popover.md) that adds a **trigger mechanism** (keyboard or focus) and an **auto-dismiss timer**. It handles the open/close bookkeeping for you: in `'key'` mode it toggles visibility when you press `triggerKey`, and in `'focus'` mode it shows while its anchor is focused (driven by the consumer-supplied `anchorFocused` value). When visible it mounts a `<Popover>` with a rounded, gray-bordered, italic-text shell; when hidden it returns `null` entirely, so the underlying layer registers and unregisters cleanly with the host. Use it for hint text, inline help, or any transient annotation that should disappear on its own.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `anchorRef` | `RefObject<DOMElement \| null>` | — | Ref attached to the anchor element the tooltip is positioned relative to. **Required.** |
| `content` | `ReactNode` | — | Text/content rendered inside the tooltip. **Required.** |
| `placement` | `Placement` | `'top'` | Preferred placement relative to the anchor. See [Popover](./popover.md) for the full list of 12 values. |
| `trigger` | `'focus' \| 'key'` | `'key'` | Trigger mode: keyboard toggle or anchor focus. |
| `triggerKey` | `string` | `'?'` | Key that toggles the tooltip in `'key'` mode. |
| `anchorFocused` | `boolean` | — | Consumer-driven focus state for `'focus'` mode. Typically wired to `useFocus().isFocused`. `true` → show, `false` → hide. |
| `dismissDelay` | `number` | `3000` | Auto-dismiss delay in milliseconds. |
| `offset` | `number` | — | Main-axis offset (character cells) from the anchor edge. Passed through to `<Popover>`. |
| `crossOffset` | `number` | — | Cross-axis offset. Passed through to `<Popover>`. |
| `flip` | `boolean` | — | Allow placement to flip on overflow. Passed through to `<Popover>`. |
| `shift` | `boolean` | — | Clamp position within the viewport. Passed through to `<Popover>`. |
| `z` | `number` | `10` | Z-level for sorting — higher renders on top. |

## Trigger modes

### `'key'` mode (default)

A `useInput` handler watches for `triggerKey` and toggles an internal `visible` state. Showing the tooltip also (re)starts the dismiss timer; hiding it clears the timer. The tooltip auto-hides after `dismissDelay` ms regardless of which mode showed it.

> **Important:** This `useInput` handler is gated behind [`useInputCaptureState()`](../concepts/input-and-focus.md) so the trigger key **does not fire while a capturing modal or layer is open**. This is the cooperative gating pattern described in [Limitations](../concepts/limitations.md) — `<Tooltip>` honors it internally, so you do not need to gate it yourself.

### `'focus'` mode

Visibility is driven entirely by the `anchorFocused` prop. A `useEffect` calls `show()` when `anchorFocused` is truthy and `hide()` when it is falsy. The consumer is responsible for passing a meaningful value — typically `useFocus().isFocused`. Remember to gate your own `useFocus` with `useInputCaptureState()` so focus does not jump into the anchor while a capturing overlay is open.

In `'focus'` mode the tooltip still respects `dismissDelay` — it auto-hides after the timer elapses even if the anchor remains focused. If you want it to stay visible for the entire focus duration, set `dismissDelay` to a very large value.

## Examples

### `?`-key tooltip on a labeled element

Press `?` while the app is running to toggle the tooltip; it auto-dismisses after 3 seconds.

```tsx
import {useRef} from 'react';
import {Box, Text, type DOMElement} from 'ink';
import {OverlayHost, Tooltip} from '@harms-haus/ink-overlay';

function App() {
  const ref = useRef<DOMElement>(null);

  return (
    <OverlayHost>
      <Box ref={ref} paddingX={1}>
        <Text>Save (press ? for help)</Text>
      </Box>

      <Tooltip
        anchorRef={ref}
        placement="top"
        triggerKey="?"
        content="Ctrl+S saves the current file"
      />
    </OverlayHost>
  );
}
```

### Focus-triggered tooltip

Wire `anchorFocused` to ink's `useFocus().isFocused`. The tooltip appears when the anchor gains focus and disappears when it loses focus (or after the dismiss timer fires).

```tsx
import {useRef} from 'react';
import {Box, Text, useFocus, type DOMElement} from 'ink';
import {
  OverlayHost,
  Tooltip,
  useInputCaptureState,
} from '@harms-haus/ink-overlay';

function Field() {
  const ref = useRef<DOMElement>(null);
  const isCaptured = useInputCaptureState();
  const {isFocused} = useFocus({isActive: !isCaptured});

  return (
    <>
      <Box ref={ref}>
        <Text>{isFocused ? '[ Name ]' : 'Name'}</Text>
      </Box>

      <Tooltip
        anchorRef={ref}
        trigger="focus"
        anchorFocused={isFocused}
        placement="bottom-start"
        offset={0}
        dismissDelay={5000}
        content="Enter your full display name"
      />
    </>
  );
}

function App() {
  return (
    <OverlayHost>
      <Field />
    </OverlayHost>
  );
}
```

### Custom trigger key and longer dismiss delay

```tsx
<Tooltip
  anchorRef={ref}
  triggerKey="h"
  placement="right"
  offset={2}
  dismissDelay={10_000}
  content="Press h again to hide this hint"
/>
```

## See also

- [`<Popover>`](./popover.md) — the foundation `<Tooltip>` builds on; documents `placement`, `offset`, `crossOffset`, `flip`, and `shift` in detail.
- [Input & Focus Concepts](../concepts/input-and-focus.md) — the cooperative gating pattern `<Tooltip>` honors internally.
- [Limitations](../concepts/limitations.md) — why background input cannot be hard-blocked, and the layout-shift caveat inherited from `<Popover>`.
