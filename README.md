# @harms-haus/ink-overlay

Overlay / modal / popover / tooltip / toast / command-palette framework for [Ink](https://github.com/vadimdemedes/ink).

## Why

- **Declarative + imperative APIs.** Mount `<OverlayHost>` once and use components (`<Modal>`, `<Popover>`, `<Tooltip>`, `<Toast>`, `<CommandPalette>`) or fire floating layers from anywhere via the `overlay` and `toasts` services — no hook required.
- **LIFO input dispatch + focus trapping.** A consumed-boolean handler stack plus cooperative `captureDepth` gating keeps nested overlays correct, even though Ink fires every `useInput` listener simultaneously.
- **Animations.** Built-in stepped transitions (`fade`, `slide-*`) with a custom config escape hatch.
- **SSR / non-TTY safety.** Renders degrade gracefully without raw mode; runtime detection via `isBun` / `isNonInteractive` / `getRuntimeInfo`.
- **Tiny surface.** Runtime deps are just `chalk` and `match-sorter`. Works with `ink >=7` and `react >=19`.

## Install

```bash
npm install @harms-haus/ink-overlay
```

**Peer dependencies:** `ink >=7.0.0`, `react >=19.0.0`, `@types/react >=19.0.0` (optional).

## Quick Start

```tsx
import {render, Box, Text} from 'ink';
import {useState} from 'react';
import {OverlayHost, Modal, toasts} from '@harms-haus/ink-overlay';

function App() {
	const [open, setOpen] = useState(false);

	return (
		<OverlayHost>
			<Box flexDirection="column" padding={1}>
				<Text>Press m to open a modal</Text>
			</Box>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Hello"
				onDismiss={() => setOpen(false)}
			>
				<Text>Modal content</Text>
			</Modal>
		</OverlayHost>
	);
}

render(<App />);

// Imperative toast — no hook required
toasts.success('Saved!');
```

**See it all live.** Run `npm run demo` for an interactive, keyboard-navigable showcase of every component and concept (requires an interactive Node.js TTY — the demo does not run under Bun, in CI, or with piped stdin, since Ink throws `Raw mode is not supported`; see [demo/README.md](./demo/README.md)).

## Documentation

👉 **Full documentation: [docs/README.md](./docs/README.md)**

Two entry points:

- **[docs/concepts/](./docs/concepts/)** — how it works: [architecture](./docs/concepts/architecture.md), [positioning](./docs/concepts/positioning.md), [input & focus](./docs/concepts/input-and-focus.md), [animation](./docs/concepts/animation.md), [limitations](./docs/concepts/limitations.md), and [runtime & environments](./docs/concepts/runtime-and-environments.md).
- **[docs/components/](./docs/components/)** — usage: `<OverlayHost>`, `<Layer>`, `<Modal>`, `<Popover>`, `<Tooltip>`, `<Toast>`, `<CommandPalette>`. See also [services/](./docs/services/) (hooks, imperative API, animations) and the [API reference](./docs/reference/api-reference.md).
- **[demo/](./demo/)** — interactive keyboard-navigable showcase of every component, service, and concept. Run with `npm run demo` (requires an interactive Node.js TTY; see [demo/README.md](./demo/README.md)).

> **Note:** Interactive features (input, focus trap, keyboard dismiss) require Node. See [Runtime & Environments](./docs/concepts/runtime-and-environments.md).

## License

MIT
