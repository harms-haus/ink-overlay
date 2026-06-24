# `<OverlayHost>`

`<OverlayHost>` is the **root provider** for `@harms-haus/ink-overlay`. You mount it exactly once, near the top of your React tree, wrapping the part of the app that displays overlays. It does three jobs at once: it provides the `OverlayHostContext` that every `<Layer>`-based component (`<Modal>`, `<Popover>`, `<Tooltip>`, `<CommandPalette>`, raw `<Layer>`) registers against; it mounts the `<InputDispatcher>` that powers the LIFO consumed-handler input stack; and it owns raw-mode toggling, focus trapping, and the merge + sort of declarative and imperative layers into a single back-to-front paint list. Without a host in the tree, no overlay component can function.

## Why it is required

A `<Layer>` (and every component built on it) does not render its floating content itself. On open it calls `registerLayer(descriptor)` from the host context, passing its `z`, `anchor`, `content`, `backdrop`, `capture`, etc. The host stores that descriptor in a mutable ref, and on every render it merges the declarative descriptors with the imperative ones coming from `overlayStore.subscribe`, sorts the combined list by `(z, order)` via `sortLayers()`, and renders each entry through a `<LayerRenderer>` as a sibling *after* `children` in the JSX tree. Because Ink's paint order equals tree-traversal order, layers painted later end up on top — this is what produces correct z-ordering.

The same host is also the single source of truth for two side effects that must fire exactly once:

- **Raw mode.** When the number of *capturing, non-exiting* layers (`capture && !exiting`) rises above zero, the host calls `setRawMode(true)`; when it returns to zero it calls `setRawMode(false)`. Both calls are guarded by `isRawModeSupported`, so in non-TTY or CI environments raw mode is never touched. Raw mode is enabled/disabled on the 0↔1 transition, not per-layer, mirroring Ink's own ref-counted behavior and avoiding flicker. On unmount, if any capturing layers were active, the host restores raw mode and re-enables focus.
- **Focus gating.** Symmetrically, the host calls `focusManager.disableFocus()` while any capturing layer is active and `focusManager.enableFocus()` once the last one closes. This lets capturing layers trap Tab/Shift+Tab via `useFocusTrap` while background components cooperatively deactivate through `useInputCaptureState()`.

Finally, the host subscribes to `overlayStore` inside a `useEffect`, so the imperative `overlay` and `toasts` services — which never touch React directly — are surfaced as layers the moment a host mounts. The subscription is cleaned up on unmount.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | The app tree. Overlay layers render as siblings *after* `children`, so they always paint on top. |

That is the entire public surface. Every other behavior is driven by the layers you mount inside it or by the imperative services.

## No import side effects

Importing `@harms-haus/ink-overlay` does **not** install global listeners, patch `process.stdin`, or touch the terminal. Nothing happens until you actually render `<OverlayHost>`. This means you can safely import components, types, or the `overlay`/`toasts` services in any module (including tests) without cost; the system is inert until a host is in the tree.

> **Note:** Calling `overlay.open(...)` or `toasts.success(...)` before a host has mounted is safe — the entries are stored in `overlayStore` and surface as layers the moment the host's `subscribe` effect runs. They will simply not be visible until then.

## Examples

### Minimal app: host + declarative `<Modal>`

Mount the host at the `render()` root, wrapping your whole UI.

```tsx
import {render} from 'ink';
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Modal} from '@harms-haus/ink-overlay';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <OverlayHost>
      <Box flexDirection="column" padding={1}>
        <Text>Press m to open the modal.</Text>
      </Box>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Hello"
        onDismiss={() => console.log('dismissed')} // side-effect only; state is handled by onOpenChange
      >
        <Text>Modal content goes here.</Text>
      </Modal>
    </OverlayHost>
  );
}

render(<App />);
```

The `<Modal>` registers with the host on open; the host renders the positioned, bordered box as a sibling after the `<Box>`, so it paints on top.

### Host paired with the imperative services

The same single host also surfaces imperative layers opened from anywhere — no hook or context plumbing required.

```tsx
import {render} from 'ink';
import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, overlay, toasts} from '@harms-haus/ink-overlay';

function App() {
  useEffect(() => {
    const id = overlay.open(
      <Box padding={1}>
        <Text>Floating layer from anywhere</Text>
      </Box>,
      {anchor: 'center', z: 200, backdrop: 'dim'},
    );

    toasts.success('Saved!');

    return () => overlay.close(id);
  }, []);

  return (
    <OverlayHost>
      <Text>Main app content</Text>
    </OverlayHost>
  );
}

render(<App />);
```

The host's `overlayStore.subscribe` effect turns those store entries into rendered `<LayerRenderer>`s on the next frame. See [services/imperative-api.md](../services/imperative-api.md) for the full `overlay` / `toasts` API.

### Placement guidance

Always wrap at the `render()` root so that *all* overlay-capable subtrees — background components that need `useInputCaptureState()`, modals, popovers, command palettes — live inside one host. Nesting a second `<OverlayHost>` is unnecessary and unsupported; there is one input dispatcher, one raw-mode/focus owner, and one sorted layer list per host.

> See the [demo app](../../demo/README.md) for a working example of mounting a single `<OverlayHost>` shared by many scenes.

```tsx
// ✅ One host at the root
render(
  <OverlayHost>
    <App />
  </OverlayHost>,
);

// ❌ Don't nest hosts
<OverlayHost>
  <OverlayHost>{/* ... */}</OverlayHost>
</OverlayHost>
```

If you need overlays to appear above a background component, just place the overlay component (or call the imperative service) from within that subtree; the host takes care of sorting and painting. For details on the internal merge + sort pipeline, raw-mode transitions, and focus gating, see [concepts/architecture.md](../concepts/architecture.md).
