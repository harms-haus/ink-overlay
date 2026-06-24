# @harms-haus/ink-overlay — Documentation

**@harms-haus/ink-overlay** is an overlay / modal / popover / tooltip / toast /
command-palette framework for [Ink](https://github.com/vadimdemedes/ink) — the
React renderer for the terminal. It layers floating UI on top of your app,
manages input dispatch, focus trapping, z-order, positioning, and animation,
and degrades gracefully in non-TTY and CI environments.

This index offers two reading paths depending on what you need:

---

## 📖 Understand how it works

Start here if you want to learn the *concepts and architecture* before writing
code. Read in order:

1. **[Architecture](./concepts/architecture.md)** — How the `OverlayHost`
   merges declarative + imperative layers, sorts by z-order, and renders
   back-to-front.
2. **[Input & Focus](./concepts/input-and-focus.md)** — The LIFO input
   dispatcher, cooperative gating, focus trapping, and why Ink's shared
   `useInput` emitter requires a custom dispatch model.
3. **[Positioning](./concepts/positioning.md)** — Anchors, explicit offsets,
   popover placement with flip/shift/collision detection, and how Ink's Yoga
   layout drives absolute positioning.
4. **[Animation](./concepts/animation.md)** — Stepped transition frames, the
   `'fade'`/`'slide-*'` presets, and why terminal "fade" is a height-grow, not
   opacity.
5. **[Runtime & Environments](./concepts/runtime-and-environments.md)** — Node
   vs. Bun, raw-mode ref-counting, non-TTY/CI degradation, and flicker
   mitigation.
6. **[Limitations](./concepts/limitations.md)** — Cooperative input gating,
   paint-order z-index, no real transparency, and other constraints.

---

## 🚀 Use it in your project

Start here if you want to ship features quickly. Pick the path that matches
your goal.

### Getting Started

- **[Quick Start](./getting-started.md)** — Install, peer deps, minimal
  `OverlayHost` + `<Layer>` example, and the mental model in brief.

### Components

- **[`<OverlayHost>`](./components/overlay-host.md)** — Root provider; mount
  once near the app root. Manages layer merging, input dispatch, and raw mode.
- **[`<Layer>`](./components/layers.md)** — Declarative floating layer with
  anchor/position, backdrop, z-level, transitions, and capture mode.
- **[`<Modal>`](./components/modal.md)** — Centered, bordered, titled dialog
  built on `<Layer>`.
- **[`<Popover>`](./components/popover.md)** — Element-anchored floating layer
  with placement, flip, shift, and collision detection.
- **[`<Tooltip>`](./components/tooltip.md)** — Popover variant with key/focus
  trigger and auto-dismiss timer.
- **[`<Toast>`](./components/toast.md)** — Presentational toast row (icon +
  text); used internally by the toast service.
- **[`<CommandPalette>`](./components/command-palette.md)** — Filterable,
  keyboard-navigable command list overlay with a fake-cursor input.

### Services

- **[Imperative API](./services/imperative-api.md)** — `overlay.open/close/update`
  and the `toasts.success/error/warn/info` service for hook-free floating UI.
- **[Hooks](./services/hooks.md)** — `useInputCaptureState`,
  `useRegisterInput`, `useFocusTrap`, and `<FocusTrap>`.
- **[Animations](./services/animations.md)** — `resolveTransition`,
  `getTransitionSteps`, and authoring custom `TransitionConfig` objects.

### Reference

- **[API Reference](./reference/api-reference.md)** — Full prop tables for
  every component, signatures for every hook and helper, and exported types.
- **[Testing](./reference/testing.md)** — `renderWithHost`,
  `createResizableStdout`, and the cooperative-gating test patterns.

---

> **Looking for the project overview, install instructions, and badge?** See the
> [root README](../README.md).
