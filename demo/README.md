# Demo App

`@harms-haus/ink-overlay` ships an **interactive, keyboard-navigable terminal app** that exercises nearly every feature of the library — declarative components (`<Modal>`, `<Popover>`, `<Tooltip>`, `<Toast>`, `<CommandPalette>`), the imperative `overlay` / `toasts` services, the `<Layer>` primitive, the LIFO input dispatcher, focus trapping, animation, and runtime detection.

The demo is organized as a **scene registry**: a single Ink app renders a menu, you pick a scene, and that one scene mounts and drives its own `useInput` listeners and state. The source of every scene is **heavily commented** with explanatory prose and `──` section dividers — so a developer can open `demo/scenes/*.tsx` in an editor and read it top-to-bottom, learning not just what each prop does but what alternatives exist, why this scene chose one over another, and what the tradeoffs are. The exact labels and structure vary from scene to scene: some use labeled blocks (e.g. `WHY`, `OPTIONS`, `NOTE`), others use free-form prose, but every scene covers the design rationale, the exercised API and props, and the available alternatives and their tradeoffs. The primary value of the demo is this commented source, not the running app alone.

## Prerequisites

- **Node.js ≥ 22.** The library declares `"engines": { "node": ">=22" }`. Interactive input features (modal dismiss, focus trap, command-palette navigation) require Node — Bun currently has an input bug that breaks raw-mode key capture.
- **An interactive TTY.** Ink throws `Raw mode is not supported` when `stdin` is not a real terminal. Concretely this means:
  - Do **not** run it inside CI.
  - Do **not** run it with piped or redirected stdin (e.g. `npm run demo < file` or `npm run demo | cat`).
  - Run it from a normal terminal session.
- **Dependencies installed.** The `demo` script runs through [`tsx`](https://github.com/privatenumber/tsx), which is a `devDependency` — so `npm install` in the repo root is required.

## Running it

From the repository root:

```bash
npm install
npm run demo
```

`npm run demo` is defined in `package.json` as:

```
tsx --tsconfig tsconfig.demo.json demo/app.tsx
```

It executes `demo/app.tsx` directly against the TypeScript source via a separate demo tsconfig, then takes over your terminal. Use `q` or `Ctrl+C` to exit.

## Controls

| Key       | Action                                                              |
| --------- | ------------------------------------------------------------------- |
| `↑` / `↓` | Move the highlight in the scene menu                                |
| `Enter`   | Open the highlighted scene                                          |
| `Esc`     | Leave the active scene and return to the menu (no-op on the menu)   |
| `q`       | Quit the entire app                                                 |
| `Ctrl+C`  | Force-exit the process (kept working via Ink's `exitOnCtrlC: true`) |

> **Cooperative input model.** The global `q` and `Esc` hotkeys are **voluntarily gated** on `useInputCaptureState()` — they yield whenever a capturing overlay (a `<Modal>` or the `<CommandPalette>`) is open. This means you cannot accidentally quit or back out while a modal is on screen. Individual scenes gate their own `useInput` listeners the same way. The framework cannot enforce this; it is a contract every background component must honor. See [Input & Focus](../docs/concepts/input-and-focus.md) for the full model.

## Scene overview

The menu renders this registry verbatim — order below is the order shown on screen.

| #   | Scene                      | What it demonstrates                                                  |
| --- | -------------------------- | --------------------------------------------------------------------- |
| 01  | **Getting Started**        | `OverlayHost`, declarative `<Modal>`, imperative toasts               |
| 02  | **Layer & Anchors**        | 9 anchor positions, explicit offsets, overflow, margin                |
| 03  | **Backdrop**               | `none` / `dim` / `opaque`, custom color, `onBackdropInput`            |
| 04  | **Z-Ordering**             | `z` paint order across stacked layers                                 |
| 05  | **Modal Deep-Dive**        | Every `<Modal>` prop, `alertdialog`, role variants                    |
| 06  | **Popover**                | `anchorRef`, placements, flip/shift, `collisionPadding`               |
| 07  | **Tooltip**                | Key/focus triggers, custom `triggerKey` & `dismissDelay`              |
| 08  | **Toasts**                 | Imperative `toasts` service + presentational `<Toast>`                |
| 09  | **Command Palette**        | Filtering, navigation, windowing, custom `renderItem`                 |
| 10  | **Animations**             | Named transitions (`fade`, `slide-*`), custom config, exit animations |
| 11  | **Imperative Overlay**     | `overlay.open` / `close` / `closeAll` / `update`                      |
| 12  | **Input & Focus**          | Capture gating, LIFO dispatch, `FocusTrap`, nesting                   |
| 13  | **Runtime & Environments** | `getRuntimeInfo`, Bun / non-TTY graceful degradation                  |

Source files live in [`demo/scenes/`](./scenes/), named to match the registry order (e.g. `01-getting-started.tsx` … `13-runtime.tsx`). Note the **mixed export styles**: scenes `01` and `03` use named exports; all others use default exports.

## Architecture notes

These notes are for developers reading the demo source. They mirror the extensive JSDoc in [`demo/app.tsx`](./app.tsx).

### One shared `<OverlayHost>`

`<OverlayHost>` is mounted **exactly once**, high in the tree — `App` wraps everything in a single host. It owns the React context and the imperative overlay store that every overlay component and hook reads from. Because every scene lives underneath this one host, scenes can freely open overlays without each supplying their own host. Nesting two hosts is unsupported and will silently produce duplicate or conflicting overlays.

### Only one scene is mounted at a time

`App` renders either the menu _or_ exactly one scene (`activeScene ? <Scene/> : <Menu/>`). This is deliberate: each scene registers its own `useInput` listener, and Ink has no event-consumption mechanism — every active `useInput` callback fires on every keypress. Mounting several scenes at once would let their listeners collide. Mounting just one at a time keeps exactly one set of input handlers active.

### Global hotkeys live inside the host

The app is split into two components:

- **`App`** — the root. Owns the active-scene state and mounts `<OverlayHost>`.
- **`DemoShell`** — rendered _inside_ `<OverlayHost>`. Owns the global `q` / `Esc` hotkeys and switches between the menu and the active scene.

This split is mandatory. `useInputCaptureState()` (and every other overlay hook) reads from the `InputDispatcher` context, which is only provided _inside_ the `<OverlayHost>` subtree. `App` is the _parent_ of the host, so calling `useInputCaptureState()` there throws `useInputDispatcher must be used within an <InputDispatcher>`. `DemoShell`, being a child of the host, is within the context.

### Every scene gates itself (the cooperative input model)

Each scene's `useInput` listeners opt into `isActive: !isCaptured`, where `isCaptured = useInputCaptureState()`. This is the cooperative input model in action: it is strictly **voluntary**. The framework cannot enforce it; every background component — including the scene menu in [`demo/menu.tsx`](./menu.tsx) — is responsible for yielding to capturing overlays.

### Shared demo chrome

[`demo/ui.tsx`](./ui.tsx) provides two purely cosmetic helpers — `SceneShell` (a title/description/body/keybinding-hints frame) and `KeyHint` (an inline highlighted key) — so every scene shares the same look. These helpers contain **no overlay logic**; they keep the demos DRY and make it obvious that the interesting work is in the library, not the chrome.

## Source-import pattern

The demo imports the library via a **relative source path**, not the package name or a compiled `dist/` bundle:

- `demo/app.tsx` and `demo/menu.tsx` import from `../src/index.js`.
- `demo/scenes/*.tsx` import from `../../src/index.js`.

This means TypeScript type-checks the demo against the **real, current library surface**, so any API drift between the demo and the library is caught at compile time rather than at runtime. The demo is therefore also a live regression test for the public API. (`npm run typecheck` runs `tsc --noEmit` against both the library and the demo tsconfigs.)

## Read the source

The demo's primary value is its **commented source**. Each `demo/scenes/*.tsx` file is written to be read top-to-bottom, with comments covering three themes: the design rationale behind a given choice, a walkthrough of the API/props being exercised, and a survey of the available alternatives and their tradeoffs. The exact labels and structure vary from scene to scene — some use labeled blocks like `WHY` or `OPTIONS`, others use free-form prose with `──` section dividers — so don't expect a rigid template. For the best experience, open the scene file in an editor alongside the corresponding page in [`docs/`](../docs/) — for example, read `06-popover.tsx` next to [docs/components/](../docs/components/), or `10-animations.tsx` next to [docs/concepts/animation.md](../docs/concepts/animation.md).

## See also

- [Project README](../README.md) — install, quick start, and feature overview.
- [Full documentation](../docs/README.md) — concepts (`docs/concepts/`), component usage (`docs/components/`), services, and the [API reference](../docs/reference/api-reference.md).
