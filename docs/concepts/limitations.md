# Platform Limitations

This document is the frank, honest accounting of what this library **cannot** do and — more importantly — **why**. Every overlay framework built on Ink runs into the same walls set by terminal physics and Ink's internal architecture. Naming them directly builds trust: you will not waste time hunting for an API that does not exist or filing a bug for behavior that is inherent to the medium. For each limitation below we cover what it is, the root cause, whether it is addressable (and where the fix would live — terminal physics vs upstream Ink vs an external runtime), and the current mitigation or workaround.

For the architectural context behind these constraints, see [Architecture](./architecture.md). Input-related limitations are discussed alongside the dispatcher in [Input & Focus](./input-and-focus.md); positioning limits in [Positioning](./positioning.md); animation behavior in [Animation](./animation.md); and the Bun/non-TTY details in [Runtime & Environments](./runtime-and-environments.md).

---

## Backdrop Overpaint — No Real Transparency

**What it is.** The `dim` and `opaque` backdrop kinds are not semi-transparent overlays. They are solid blocks of colorized space characters painted over the content beneath at render time. `opaque` fills with black; `dim` fills with `#1a1a2e` (a dark navy). The content that was previously at those coordinates is simply overwritten in Ink's output buffer — it is not dimmed, blurred, or blended.

**Root cause.** Terminal cells are character grids, not pixel buffers. Each cell holds exactly one character, one foreground color, and one background color. There is no alpha channel, no compositing step, and no concept of layered pixel data. When Ink's `render-background.ts` writes a background fill, it calls `output.write(x, y, line)` which directly overwrites whatever occupied those cells in the previous frame. The output buffer is a 2D array of characters — last writer wins. This is terminal physics, not an Ink design choice.

**Addressable?** No. This is a hard constraint of the terminal medium itself. No amount of framework code can introduce a compositing pipeline that the terminal does not support. The only "transparency" in a terminal is the default background color (often literally transparent or matching the terminal emulator's own background), which is why `backdrop="none"` leaves underlying content fully visible — it simply writes nothing.

**Current mitigation.** The two named backdrop kinds are the best available approximations. `dim` (`#1a1a2e`) is chosen to read as a darkening veil against typical dark terminal backgrounds; `opaque` (`black`) is the heaviest possible occlusion. If neither suits your design, pass `backdropColor` with any valid chalk-compatible color string to use a custom solid tint. The backdrop visual is purely cosmetic — it does not affect input capture, which is governed by the `capture` prop and the input dispatcher (see [Input & Focus](./input-and-focus.md)).

---

## 'fade' Transition Is a Height-Grow, Not an Opacity Fade

**What it is.** When you pass `transition="fade"` to a `<Layer>` (or any component built on it), the visual effect is a stepped height grow from 0 rows to 1 row — a collapse/expand — not a true opacity dissolve. The enter sequence applies `height: 0` then `height: 1`; the exit sequence reverses.

**Root cause.** Same terminal physics as the backdrop limitation above: there is no alpha channel, so true opacity interpolation is impossible. The name `fade` was retained for API compatibility, but an earlier implementation that tried to apply `dim`/`dimColor` to a wrapper `<Box>` produced no visible effect because those are `<Text>` props — Ink silently ignores them on `<Box>`. See [Animation](./animation.md) for the full transition system.

**Addressable?** Not for true opacity. Terminal physics forbids it. The height-grow is the current best-effort approximation and is unlikely to improve meaningfully within the terminal model.

**Current mitigation.** Use `slide-up`, `slide-down`, `slide-left`, or `slide-right` for a more visually pronounced entrance. These transitions animate `marginTop`/`marginBottom`/`marginLeft`/`marginRight` across multiple stepped frames (3 steps each, 80ms interval) and produce a clear directional motion. You can also pass a fully custom `TransitionConfig` with arbitrary per-frame `style` overrides for any effect expressible as stepped Box-style changes.

---

## Cooperative Input Gating Cannot Block an Uncooperative Standalone useInput

**What it is.** When a capturing overlay (e.g. a modal with `capture={true}`) is open, the framework **cannot** prevent a background component's own `useInput` hook from firing. If that component does not cooperatively check the capture state, its handler will receive every keypress alongside the overlay's handler — including keys the overlay intended to consume.

**Root cause.** Inside Ink's `<App>` component, every active `useInput` hook registers a listener on a single shared `EventEmitter`. When a keypress arrives, `App` emits once and **all** registered listeners fire. There is no `consumed` boolean, no propagation-stop mechanism, and no priority ordering. The framework's `InputDispatcher` (see [Input & Focus](./input-and-focus.md)) implements its own LIFO handler stack **with** a consume-boolean for overlay-internal routing (Esc dismiss, Tab cycling, backdrop clicks), but that stack only governs handlers that were explicitly registered through `useRegisterInput`. A standalone `useInput` from the consumer's code is outside the dispatcher's control — it fires on the shared emitter regardless of capture state.

**Addressable?** Yes, but only upstream in Ink. The fix would be a consumed-input or priority API in Ink's `useInput` — a mechanism by which a handler can signal "this event is consumed; do not dispatch to lower-priority listeners." This would be a well-scoped, non-breaking addition (an optional return value or a new `useInput` option). It has not been proposed or merged as of Ink 7.1.0. Until it exists, the framework is limited to providing the `isCaptured` **signal**; enforcement is cooperative.

**Current mitigation.** Background components **must** gate their `useInput` and `useFocus` calls on the negation of `useInputCaptureState()`. The pattern is: read `isCaptured` from the hook, then pass `isActive: !isCaptured` to your `useInput` or `useFocus` call. The framework's own `<Tooltip>` honors this contract — its key-trigger handler is gated so the trigger key does not fire while a capturing layer is open. Any component you write that handles keyboard input outside the overlay system must follow the same pattern. This is a documented limitation, not a bug; it is the only safe approach given Ink's architecture.

---

## Popover Does Not Track Ancestor or Sibling Layout Shifts

**What it is.** A `<Popover>` anchored to an element will reposition correctly when the anchor itself resizes, when the popover content resizes, or when the terminal is resized. But if an **ancestor or sibling** element shifts the anchor's root-relative position without changing the anchor's own parent-relative metrics, the popover will **not** follow — it stays at its previously computed coordinates until one of its tracked dependencies changes.

**Root cause.** Ink's `useBoxMetrics` hook returns parent-relative layout metrics and only re-fires when those specific numbers change. The `<Popover>` component walks the `parentNode` chain via `getRootRelativeRect()` to sum ancestor offsets into root-relative coordinates, but this walk runs inside a `useEffect` whose dependency array is the set of parent-relative metrics and viewport dimensions. When an ancestor moves the anchor in root-relative space — say, a sibling above it grows by two rows — the anchor's parent-relative metrics are unchanged, so the effect does not re-run, and the root-relative walk is never re-triggered. Ink does expose an internal `addLayoutListener` in `build/dom.js`, but it is not part of the public API. See [Positioning](./positioning.md) for the full positioning pipeline.

**Addressable?** Yes, but only via an Ink PR. The fix would be exposing a public per-node layout-commit listener (or a `useLayoutEffect`-equivalent that fires after Yoga layout settles) so consumers can observe root-relative position changes. This is a reasonably scoped upstream contribution. Until it lands, the framework cannot detect ancestor/sibling-driven shifts.

**Current mitigation.** If the anchor moves due to surrounding content changes, either (a) close and reopen the popover, forcing a fresh measurement cycle, or (b) set a React `key` on the `<Popover>` that is derived from the layout-affecting state — when that state changes, React unmounts and remounts the popover, re-running the initial measurement. For most UIs where the anchor is in a stable position (toolbars, fixed headers, focus-driven triggers), this limitation is invisible.

---

## Bun Interactive Input Is Broken (bun#6862)

**What it is.** Under the Bun runtime, the framework **renders** correctly — overlays paint, backdrops fill, layouts compute. But all **interactive input** is non-functional: `useInput` receives no keypress events, the focus trap cannot intercept Tab, and keyboard-based dismiss (Esc) does nothing.

**Root cause.** Bun does not call `process.stdin.resume()` in its runtime initialization (oven-sh/bun#6862), so the readable stream for stdin never begins flowing and no keypress data reaches Ink's input pipeline. This is purely external — it is a Bun bug, not an Ink bug and not a framework bug. A secondary issue (bun#12918) means raw mode may not restore cleanly on abrupt process exit; the framework restores raw mode on **clean unmount** of `<OverlayHost>`, but an abrupt exit (e.g. SIGINT) can leave the terminal in a broken state.

**Addressable?** Externally — the fix lives in the Bun runtime. The framework already guards against this gracefully: `warnBunInput()` fires once when capture is first attempted, and the dispatcher's own `useInput` sets `isActive: false` when `isRawModeSupported` is falsy, so no `setRawMode` call throws.

**Current mitigation.** Use Node for any application that relies on interactive input. Under Bun, treat the framework as render-only. If you must run under Bun, register your own `process.on('SIGINT', …)` handler that disables raw mode and re-enables focus as a safety net for terminal state restoration. See [Runtime & Environments](./runtime-and-environments.md) for the full degradation matrix across Node, Bun, and non-TTY/CI environments.

---

## Which of These Might Improve?

Of the five limitations above, **two are fixable upstream in Ink** with reasonably scoped contributions:

- **Cooperative input gating (#3)** would be resolved by a consumed-input or priority API in Ink's `useInput` — an optional return value or option that lets a listener claim an event and prevent lower-priority dispatch.
- **Popover layout-shift tracking (#4)** would be resolved by a public layout-commit listener hook, allowing consumers to observe root-relative position changes driven by ancestor/sibling reflow.

The remaining three are **terminal physics** — no alpha channel means no real backdrop transparency (#1) and no true opacity fade (#2); Bun's stdin bug (#5) is an external runtime issue outside both the terminal and Ink. These will not change unless the underlying platform changes, which is not on any roadmap.
