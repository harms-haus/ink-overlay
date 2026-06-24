# Imperative API — `overlay` and `toasts`

The imperative services follow the **react-hot-toast / sonner store-and-subscribe** pattern. You `import {overlay, toasts}` and call them from **anywhere** — a component body, an event handler, a plain utility function, or even outside the React tree entirely. No hook, no context consumer, no prop drilling required.

This works because both services read a **module-level store** (`overlayStore`, a singleton `OverlayStore` instance). An [`<OverlayHost>`](../components/overlay-host.md) subscribes to that store via `overlayStore.subscribe()`, merges the imperative entries with declarative [`<Layer>`](../components/layers.md) descriptors, sorts everything by `(z, order)`, and renders the combined set through `LayerRenderer`. Calls made **before** the host mounts are perfectly safe — they simply buffer in the store and take effect the moment a host is present. Importing the module produces no side effects (no raw mode, no stdin access).

---

## Part 1 — The `overlay` service

A thin imperative wrapper around `overlayStore` for opening, closing, and updating arbitrary floating layers from any code location.

```ts
import {overlay} from '@harms-haus/ink-overlay';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `open` | `(content: ReactNode, opts?: LayerOpts) => string` | Open a new overlay. Returns a generated unique id. |
| `close` | `(id: string) => void` | Close an overlay by id. No-op (no notification) if not found. |
| `closeAll` | `() => void` | Close every imperative overlay. |
| `update` | `(id: string, patch: Partial<LayerOpts>, newContent?: ReactNode) => void` | Shallow-merge `patch` into the overlay's opts. If `newContent` is provided, it atomically **replaces** the content in the same update. No-op if the id is not present. |

The `opts` argument is a [`LayerOpts`](../components/layers.md) object — the same shape used by `<Layer>`, with `anchor`, `z`, `backdrop`, `capture`, `transition`, `onDismiss`, etc.

### Open a custom floating layer

```tsx
import {Box, Text} from 'ink';
import {overlay} from '@harms-haus/ink-overlay';

const id = overlay.open(
  <Box borderStyle="round" borderColor="cyan" padding={1}>
    <Text>Custom overlay content</Text>
  </Box>,
  {anchor: 'center', z: 200, backdrop: 'dim'},
);
```

### Update opts and/or content

```tsx
// Change only the backdrop — content stays the same
overlay.update(id, {backdrop: 'opaque'});

// Atomically swap both the content and a z bump
overlay.update(
  id,
  {z: 300},
  <Box borderStyle="round" borderColor="green" padding={1}>
    <Text>Updated content</Text>
  </Box>,
);
```

The `update` call performs a single `notify()` — subscribers see one re-render, not two.

### Close a single overlay or all at once

```tsx
overlay.close(id);   // remove by id (no-op if already gone)
overlay.closeAll();  // remove every imperative overlay
```

---

## Part 2 — The `toasts` service

A stacking, auto-dismiss toast service built on top of `overlayStore`. All active toasts are published as a **single** overlay entry so only one store notification fires per change. The combined content uses `flexDirection="column-reverse"` so the **oldest** toast appears at the bottom (nearest the anchor corner) and newer toasts stack above it.

```ts
import {toasts} from '@harms-haus/ink-overlay';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `(message: ReactNode, opts?: ToastOptions) => string` | Show an info-kind toast. Returns its id. |
| `success` | `(message: ReactNode, opts?: ToastOptions) => string` | Convenience wrapper — sets `kind: 'success'`. |
| `error` | `(message: ReactNode, opts?: ToastOptions) => string` | Convenience wrapper — sets `kind: 'error'`. |
| `info` | `(message: ReactNode, opts?: ToastOptions) => string` | Convenience wrapper — sets `kind: 'info'`. |
| `warn` | `(message: ReactNode, opts?: ToastOptions) => string` | Convenience wrapper — sets `kind: 'warn'`. |
| `dismiss` | `(id: string) => void` | Dismiss a single toast by id. |
| `dismissAll` | `() => void` | Dismiss every active toast immediately. |

### `ToastOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `duration` | `number` | `4000` | Auto-dismiss delay in milliseconds. |
| `anchor` | `Anchor` | `'bottom-right'` | Anchor position for the toast container. |
| `id` | `string` | generated (UUID) | Stable id. Calling any show method with an existing id **replaces** the previous toast (the old one is dismissed first, then the new one is added). |

For details on stacking behavior (max 3 visible toasts with oldest-eviction) and anchor inheritance (the container anchor is pinned from the **first-added** toast), see [`components/toast.md`](../components/toast.md).

### Fire-and-forget toasts

```ts
toasts.success('File saved');
toasts.error('Connection failed');
toasts.warn('Slow network detected');
toasts.info('Syncing…');
```

### Custom duration and anchor

```ts
const id = toasts.show('Processing large batch…', {
  duration: 10_000,
  anchor: 'top-right',
});
```

### Dismiss by id or all at once

```ts
toasts.dismiss(id);     // cancel auto-dismiss timer + remove this toast
toasts.dismissAll();    // clear every active toast
```

### Stable id for updatable toasts

```ts
// Using the same id replaces the previous toast instead of stacking
toasts.info('Uploading…', {id: 'upload-status'});

// Later, replace it with a success — the old "Uploading…" is dismissed first
toasts.success('Upload complete', {id: 'upload-status'});
```

---

## Related documentation

- [**`components/overlay-host.md`**](../components/overlay-host.md) — The host that subscribes to `overlayStore` and merges imperative + declarative layers.
- [**`components/layers.md`**](../components/layers.md) — Full `LayerOpts` shape (anchor, z, backdrop, transition, callbacks, etc.).
- [**`components/toast.md`**](../components/toast.md) — The `<Toast>` presentational component, stacking/max-stack UX, and anchor-inheritance behavior.
