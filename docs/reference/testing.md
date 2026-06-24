# Testing helpers

The `tests/helpers/` directory ships three helpers that cover the two things `ink-testing-library` cannot do on its own — wrapping a tree in a real [`<OverlayHost>`](../components/overlay-host.md) so that `<Layer>`-based components have their context, and simulating a terminal *resize* — plus a small `delay()` helper that works with Ink's real-timer rendering loop. Together they let you render any component in this package the same way it renders in production.

> ## ⚠️ These are source files — copy them, don't import them
>
> `tests/helpers/*.{ts,tsx}` are **`.ts`/`.tsx` source files**, not part of the published build. They are **not** emitted to `dist/`, and the package's `exports` field maps only the root entry point (`.`):
>
> ```json
> "exports": {".": {"types": "./dist/index.d.ts", "default": "./dist/index.js"}}
> ```
>
> Importing them via `@harms-haus/ink-overlay/tests/helpers/...` **will fail** at resolve time. To use them, **copy the helper source into your own test setup** and import it through a **relative path**:
>
> ```ts
> // ✅ relative import from your copied helper
> import {renderWithHost} from './helpers/render-with-host.js';
> // ❌ will NOT resolve
> import {renderWithHost} from '@harms-haus/ink-overlay/tests/helpers/render-with-host';
> ```
>
> Every example below assumes you have copied the files into `tests/helpers/` (or similar) inside your own project.

## `renderWithHost(tree, hostProperties?)`

Wraps [`ink-testing-library`](https://github.com/vadimdemedes/ink-testing-library)'s synchronous `render()` in an [`<OverlayHost>`](../components/overlay-host.md). Any `<Layer>`-based component — `<Modal>`, `<Popover>`, `<Tooltip>`, `<CommandPalette>`, or a raw `<Layer>` — needs that host in the tree to register, sort, and paint. Without it the component renders nothing. `renderWithHost` returns the standard `ink-testing-library` result shape (`lastFrame`, `frames`, `rerender`, `unmount`, `stdin`, `stdout`, `cleanup`), so you can use it as a drop-in replacement.

```tsx
import {Text} from 'ink';
import {renderWithHost} from './helpers/render-with-host.js';
import {Modal} from '@harms-haus/ink-overlay';

test('modal renders its title and children', () => {
  const {lastFrame} = renderWithHost(
    <Modal open title="Confirm" onDismiss={() => {}}>
      <Text>Are you sure?</Text>
    </Modal>,
  );

  expect(lastFrame()).toContain('Confirm');
  expect(lastFrame()).toContain('Are you sure?');
});
```

The optional second argument is spread onto `<OverlayHost>` as props. Note that `<OverlayHost>` currently accepts **only** a `children` prop — there is no host-level configuration to pass today. The second argument exists purely for forward-compatibility and has no effect at present:

```tsx
import {renderWithHost} from './helpers/render-with-host.js';

// hostProperties has no effect today — OverlayHost only accepts children.
const result = renderWithHost(<App />);
```

## `createResizableStdout(initial?)` and `renderResizable(tree, options?)`

`ink-testing-library` renders to an in-memory buffer whose dimensions are fixed at 80×24 and cannot be changed — there is no way to simulate a terminal resize. `createResizableStdout(initial?)` builds a fake `stdout`/`stdin` pair (both `EventEmitter`-based, both reporting `isTTY === true`) whose `columns`/`rows` can be mutated at runtime. The optional `initial` argument accepts `{columns?: number; rows?: number}` (both default to `80`×`24`). Calling `resize(cols, rows)` updates the fake stdout and emits a `'resize'` event, which Ink listens for and uses to trigger a full re-render at the new size.

It returns `{stdout, stdin, resize, getFrames, lastFrame, cleanup}`.

The fake stdout buffers the multiple chunks Ink writes per frame (synchronized-output begin/end sequences plus content) and flushes them as a single frame on the next microtask, so `getFrames()` returns one entry per rendered frame rather than a stream of fragments.

`renderResizable(tree, options?)` is a convenience wrapper: it calls `createResizableStdout()`, passes the pair to Ink's real `render()`, and returns the Ink instance merged with `resize`, `getFrames`, `lastFrame`, `stdout`, `stdin`, and an `unmountAndCleanup()` that tears everything down.

**Real timers are in effect.** Ink's render loop relies on real `setTimeout`/microtasks, so you **must** `await delay(...)` after rendering, resizing, or sending input before asserting on frames.

```tsx
import {Text, Box} from 'ink';
import {renderResizable} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';
import {Layer} from '@harms-haus/ink-overlay';

test('layer reflows after a resize', async () => {
  const {lastFrame, resize, unmountAndCleanup} = renderResizable(
    <Layer open anchor="bottom">
      <Box flexDirection="column">
        <Text>layered content</Text>
      </Box>
    </Layer>,
    {columns: 80, rows: 24},
  );

  await delay(20); // let the initial frame flush
  expect(lastFrame()).toContain('layered content');

  resize(40, 12); // shrink the terminal
  await delay(20); // let the re-render flush

  // The layer is re-laid-out against the new 40-column width.
  expect(lastFrame()).toContain('layered content');

  unmountAndCleanup();
});
```

If you only need the fake streams (e.g. to feed them to your own `render()` call), use `createResizableStdout()` directly:

```tsx
import {render} from 'ink';
import {createResizableStdout} from './helpers/create-resizable-stdout.js';
import {delay} from './helpers/delay.js';

const {stdout, stdin, resize, getFrames, cleanup} = createResizableStdout({
  columns: 100,
  rows: 30,
});

const instance = render(<App />, {stdout, stdin, exitOnCtrlC: false});
await delay(20);

resize(60, 20);
await delay(20);

console.log(getFrames());
instance.unmount();
cleanup();
```

## `delay(ms)`

A one-line promise-based sleep built on real `setTimeout`. Ink's rendering loop is incompatible with fake timers (they break the internal flush cycle), so every test using `renderResizable` or any real-`render()` path needs a real-timer wait between an action and an assertion.

```ts
import {delay} from './helpers/delay.js';

await delay(30); // give the event loop time to flush a frame
```

Typical values are 10–30 ms — just enough for Ink's microtask/timer checkpoint to run. Pair it with every `renderResizable` render, `resize()` call, or `stdin.write()` in your tests.
