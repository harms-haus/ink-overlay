# Toast

The `<Toast>` component renders a single rounded-border row with an icon and message, colored per kind (`success`, `error`, `warn`, `info`). It is purely presentational — it does not manage timers, stacking, or the overlay store. The `toasts` service in [`src/manager.tsx`](../../src/manager.tsx) uses `<Toast>` internally to render each entry in the stacked auto-dismiss container; you can also render `<Toast>` directly anywhere in your tree.

## Part 1 — `<Toast>` Presentational Component

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `kind` | `ToastKind` (`'success' \| 'error' \| 'info' \| 'warn'`) | `'info'` | Selects the border/icon color via `defaultToastColors`. |
| `children` | `ReactNode` | — | The toast message content. Rendered after a single leading space. |
| `icon` | `ReactNode` | per-kind default icon | Custom icon override. When omitted, defaults to `'✓'` / `'✗'` / `'⚠'` / `'ℹ'` for success/error/warn/info respectively. |

### Rendering

`<Toast>` renders a `<Box borderStyle="round" paddingX={1} flexDirection="row" flexShrink={0}>`. The icon `<Text>` and message `<Text>` are siblings, both rendered in the kind's color for the icon; the message text uses default color. The border color always matches the kind color.

### `defaultToastColors`

Exported from `src/toast.tsx` as `Record<ToastKind, string>`:

| Kind | Color |
|------|-------|
| `success` | `'green'` |
| `error` | `'red'` |
| `warn` | `'yellow'` |
| `info` | `'blue'` |

Import it to reference or override the per-kind palette in custom toast rendering.

### Standalone Usage

```tsx
import {Box, Text} from 'ink';
import {Toast, defaultToastColors} from '@harms-haus/ink-overlay';

function App() {
  return (
    <Box flexDirection="column" gap={1}>
      {/* Each toast uses its default icon + color */}
      <Toast kind="success">File saved</Toast>
      <Toast kind="error">Connection failed</Toast>
      <Toast kind="warn">Slow network</Toast>
      <Toast kind="info">Syncing…</Toast>

      {/* Custom icon override */}
      <Toast kind="success" icon="★">Starred</Toast>
    </Box>
  );
}
```

## Part 2 — Toast UX / Behavior (via the `toasts` Service)

For the full `toasts` API reference (`show`, `success`, `error`, `info`, `warn`, `dismiss`, `dismissAll`), see [services/imperative-api.md](../services/imperative-api.md). This section documents the runtime UX behavior of the stacked toast container.

### Stacking Direction

All active toasts render as a **single overlay store entry** using `<Box flexDirection="column-reverse">`. Insertion order in the internal `toastMap` is preserved, and `column-reverse` causes the **oldest** toast to appear at the **bottom** (closest to the anchor corner) while newer toasts stack above it.

### Max-Stack Cap

`DEFAULT_MAX_TOASTS = 3` — only the **3 most-recent** toasts are visible. When the map is at capacity and a new toast is added, the **oldest** entry is evicted (its dismiss timer is cleared and it is removed) before the new one is inserted. This is a non-configurable constant in `src/manager.tsx`.

### Anchor Inheritance

The container's anchor is **inherited from the oldest (first-added) toast's `anchor` option**, not the most recent. Adding a toast with a different `anchor` does **not** relocate the existing stack. The base overlay opts are fixed at `capture: false`, `backdrop: 'none'`, `z: 90`; only `anchor` varies.

### Auto-Dismiss

Each toast gets a `setTimeout` dismiss timer on insert. The default duration is `DEFAULT_DURATION = 4000` ms. When the timer fires, the toast is removed from the map and the combined content is re-published in place (single overlay store update — no close/reopen flicker). Dismissing early via `toasts.dismiss(id)` or `toasts.dismissAll()` clears the timer(s).

### ID-Based Replace

Calling any service method with an `options.id` that already exists **replaces** the previous toast: the old entry is dismissed first (timer cleared, removed from map), then the new one is inserted with the same id. Without an explicit `id`, a fresh `'toast-…'` id is generated.

### Examples via the `toasts` Service

```tsx
import {toasts} from '@harms-haus/ink-overlay';

// Fire and forget — default 4000ms auto-dismiss, bottom-right anchor
toasts.success('File saved');
toasts.error('Connection failed');
toasts.warn('Slow network');
toasts.info('Syncing…');

// Custom duration and anchor
const id = toasts.show('Processing…', {duration: 10_000, anchor: 'top-right'});

// Dismiss by id before its timer fires
toasts.dismiss(id);

// Dismiss every active toast
toasts.dismissAll();

// ID-based replace — reusing 'save-status' replaces the previous toast
toasts.success('Saving…', {id: 'save-status'});
// …later, same id:
toasts.success('Saved!', {id: 'save-status'});
```
