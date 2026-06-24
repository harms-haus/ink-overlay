# Getting Started

`@harms-haus/ink-overlay` is an overlay framework for [Ink](https://github.com/vadimdemedes/ink): modals, popovers, toasts, tooltips, and a command palette, all positioned in absolute layers and painted with correct z-order inside a single `<OverlayHost>`. This guide installs the package and walks through one runnable app that demonstrates the two ideas the rest of the library is built on — a **declarative** `<Modal>` and an **imperative** `toasts.success(...)` call fired from anywhere.

## Install

```bash
npm install @harms-haus/ink-overlay
```

Other package managers work the same way:

```bash
pnpm add @harms-haus/ink-overlay
yarn add @harms-haus/ink-overlay
```

### Peer dependencies

The package declares the following peer dependencies (see `package.json`); install them if your project does not already include them:

| Package | Version | Notes |
|---------|---------|-------|
| `ink` | `>=7.0.0` | Required — Ink is not bundled. |
| `react` | `>=19.0.0` | Required — React 19 is the minimum supported. |
| `@types/react` | `>=19.0.0` | Optional — only needed for TypeScript users. |

### Runtime dependencies

`chalk` and `match-sorter` are declared as regular `dependencies` and installed automatically — no action needed on your part. `match-sorter` powers the default `CommandPalette` filter; `chalk` renders the inverse-video fake cursor.

## A complete, runnable app

The app below does three things:

1. Mounts `<OverlayHost>` **once**, near the root.
2. Shows a **declarative** `<Modal>` whose `open` state is controlled via `useState`.
3. Fires an **imperative** toast from a `useInput` handler — `toasts.success(...)` requires no hook and no provider plumbing beyond the host.

Save it as `app.tsx` and run it with `tsx app.tsx` (or compile with `tsc` and run with `node`). Prefer a zero-setup alternative? Clone the repo, run `npm install && npm run demo` to explore every component interactively — no extra code required (requires an interactive Node.js TTY; see [demo/README.md](../demo/README.md)).

```tsx
import {render, useInput, Box, Text} from 'ink';
import {useState} from 'react';
import {OverlayHost, Modal, toasts} from '@harms-haus/ink-overlay';

function App() {
  const [showModal, setShowModal] = useState(false);

  useInput((input) => {
    if (input === 'm') {
      setShowModal(prev => !prev);
    } else if (input === 't') {
      // Imperative — works from anywhere, no hook required.
      toasts.success('Toast fired!');
    } else if (input === 'q') {
      process.exit(0);
    }
  });

  return (
    <OverlayHost>
      <Box flexDirection="column" padding={1}>
        <Text>Press m to open the modal.</Text>
        <Text>Press t to fire a toast.</Text>
        <Text>Press q or Ctrl+C to quit.</Text>
      </Box>

      {/* Declarative overlay — open state lives in React. */}
      <Modal
        open={showModal}
        onOpenChange={setShowModal}
        title="Hello"
      >
        <Text>Modal content goes here.</Text>
        <Text dimColor>Press Esc to close.</Text>
      </Modal>
    </OverlayHost>
  );
}

render(<App />);
```

**What happens when you run it:**

- `m` toggles the centered, bordered modal. `Esc` (or any dismissal path wired through `onDismiss`) closes it.
- `t` pushes a success toast into the bottom-right stack; it auto-dismisses after 4 seconds (the default `duration`).
- `<OverlayHost>` owns the absolute-positioned layer list, the LIFO input dispatcher, and raw-mode bookkeeping — so both the modal and the toast paint with correct z-order without any manual layering.

## Where to go next

> **Interactive demo** — run `npm run demo` to explore every component, service, and concept in a keyboard-navigable showcase. (Requires an interactive Node.js TTY.) See [demo/README.md](../demo/README.md).

- **[OverlayHost](components/overlay-host.md)** — the root provider: what it mounts, its single `children` prop, and why you only need one.
- **[Layers & Components](components/layers.md)** — `<Layer>`, `<Modal>`, `<Popover>`, `<Tooltip>`, and `<CommandPalette>`, all built on the same layer registration model.
- **[Imperative API](services/imperative-api.md)** — the `overlay` and `toasts` services for fire-and-forget floating layers from anywhere in your codebase.
- **[Architecture](concepts/architecture.md)** — how z-order, the input dispatcher, and focus trapping actually work under the hood.

## Runtime note

Interactive features (keyboard input, focus trapping, modal dismissal) require **Node.js**. Bun has an [input bug](concepts/runtime-and-environments.md) that prevents keypress events from arriving, so use Node for anything beyond static rendering.
