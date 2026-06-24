# Prompt: Build a Standalone Ink Overlay Framework

> **This is a task prompt for an autonomous coding agent.** It asks you to design
> and build a **standalone, generic, framework-agnostic npm package**: an overlay
> / modal / popover / toast / command-palette system for the
> [`vadimdemedes/ink`](https://github.com/vadimdemedes/ink) React-for-terminal
> library. It is **not** tied to any specific app. Build it as a reusable,
> published-quality library.
>
> **Process:** First **verify** the technical claims in §2–§3 against the actual
> Ink source and docs (clone the repo, read `src/`). Then **design** the API
> (§4–§6), then **implement** (§7), then **test** (§8). If any claim below is
> wrong for the Ink version you pin, adjust the design accordingly and note the
> discrepancy.

---

## 1. Mission

Produce a single npm package — **an overlay framework for Ink** — that gives app
authors first-class, browser-like overlay primitives that Ink itself does not
ship: floating layers with anchoring, a z-ordering stack, focus/input capture
(modal trapping), backdrop/dim, clipping, and a set of common overlay "shapes"
(modal dialog, popover anchored to an element, toast, tooltip, command palette).

**Why this exists:** Ink has **no first-party overlay, modal, or z-index system**.
The only primitives are `position="absolute"` + edge offsets, `useWindowSize()`,
`useFocus()`, and `useInput()`. Building correct overlays (centered dialogs that
float, popovers that anchor to other elements, multiple stacked layers with sane
input capture, resize-aware repositioning) is something every non-trivial Ink app
ends up reinventing. This package should be the one everyone reaches for.

**Success criteria:**

- Correct floating overlays that paint above base content and reposition on
  resize, without flicker under `incrementalRendering`.
- A deterministic **z-stack** so authors can open many layers at once and reason
  about which is on top and which owns input.
- A clean **declarative API** (components/JSX) **and** an **imperative API**
  (open/dismiss from anywhere, like a toast or modal manager).
- Strong **TypeScript** types and a real test suite using `ink-testing-library`.

---

## 2. How Ink renders — the mental model you MUST internalize (verify in source)

Before designing anything, read and confirm these facts in the Ink source
(`src/output.ts`, `src/styles.ts`, `src/render-node-to-output.ts`,
`src/hooks/use-window-size.ts`, `src/hooks/use-box-metrics.ts`):

1. **One render tree → one 2D character grid.** Every render, Ink lays out the
   entire React tree via Yoga and rasterizes it into a width×height grid of
   styled characters (`Output` in `src/output.ts`), then writes that grid to
   stdout.
2. **Paint order = tree-traversal order = z-order.** Nodes are written into the
   grid in the order their `write(x, y, text)` operations are pushed; a later
   write **overwrites** an earlier one at the same cell. **There is no `z-index`
   prop.** To stack overlays, you control the _order in which they appear in the
   React tree_ (later sibling = on top). Confirm by reading `Output.get()`.
3. **`position="absolute"` removes a node from flex flow** and positions it via
   `top`/`right`/`bottom`/`left` (numbers, or `'% strings'` for percentages),
   relative to its containing block. Verify the containing-block rules (Yoga:
   absolute is positioned relative to the nearest positioned ancestor; otherwise
   the root). `position="relative"` makes a box a containing block without
   removing it from flow.
4. **`overflow="hidden"`** (and `overflowX`/`overflowY`) clips child content to
   the node's box — this is the **consumer-facing containment** you'll use so a
   modal's body doesn't bleed past its frame. (Ink also has an internal
   `clip`/`unclip` op stack in `Output`, but it is not exposed to consumers —
   don't rely on it.)
5. **`useWindowSize()`** returns `{columns, rows}` and re-renders on
   `stdout`'s `resize` event — the basis for resize-aware anchoring.
6. **`useBoxMetrics(ref)`** returns `{width, height, left, top, hasMeasured}`
   (relative to parent) — the basis for **element-anchored** popovers/tooltips.
   Note: Yoga omits `right`/`bottom` from metrics; account for that.
7. **`useInput((input, key) => …, {isActive})`** — every mounted `useInput`
   fires on every keypress **simultaneously** unless gated by `isActive` or a
   shared router. **This is the crux of modal behavior:** without coordination,
   a background list and a foreground modal both receive the same arrow keys.
8. **`useFocus({id, autoFocus, isActive})` + `useFocusManager()`** — Ink's
   focus system; Tab/Shift+Tab/Esc are auto-wired. Build modal focus-trapping on
   top of (or alongside) this.
9. **Rendering throughput:** with `incrementalRendering: true` (passed to Ink's
   `render()`), Ink line-diffs and only writes changed lines. Overlays must be
   cheap to add/remove and must not cause full-frame flicker.

> If any of the above is inaccurate for the Ink version you pin, **stop and
> re-derive** the correct behavior from source before proceeding.

---

## 3. Research findings — how others build Ink overlays (study and confirm)

Survey these and extract the patterns (don't copy blindly — generalize):

- **`@matthesketh/ink-modal`** — a _centered_ modal. Study how it centers: it does
  **not** use `position="absolute"`; it uses a full-width
  `<Box alignItems="center">` wrapping a fixed-`width`, `borderStyle="round"`
  box. This is the **inline-centering pattern** (cheap, but the modal occupies
  flow and pushes content — it does not float). Read its ~15-line source.
- **`@matthesketh/ink-input-dispatcher`** — the **input-capture pattern** that
  makes modals work: a root `<InputDispatcher>` plus a `useRegisterHandler(handler)`
  hook where each handler returns `boolean | void` (`true` = consumed → stop
  propagation; `false`/void = fall through). Handlers are a **LIFO stack — the
  last component to register wins**, and unregistering restores the previous
  handler. **This LIFO-consumed-handler model is the modal input-capture
  mechanism.** Reimplement (or wrap) it inside the overlay framework so modal
  focus trapping "just works."
- **`@matthesketh/ink-viewport`** — exposes `useTerminalSize()` and
  `useAvailableHeight()`. Compare with Ink's native `useWindowSize()`.
- **Real apps (open-source, Ink-based):** Cloudflare **Wrangler**, **Prisma**,
  **Gatsby**, **Shopify CLI**, **Terraform CDK**, **tap**. Search their repos
  for `position="absolute"`, `useWindowSize`, `useFocusManager`, modal/dialog,
  and "command palette" implementations. Note what they DIY vs. avoid.
- **GitHub code search** for the co-occurrence of `position="absolute"` +
  `useWindowSize()` in `.tsx` — these are people DIY-ing floating overlays.
  Extract their anchor math.

### Recurring patterns people converge on (confirm)

- **Centered dialog (cheap):** flexbox `alignItems="center"` + fixed `width`.
  Occupies flow; does not float. Good enough for many modals.
- **Floating overlay (full control):** `position="absolute"` + `top`/`left`
  computed from `useWindowSize()` (center = `(columns-width)/2`,
  `(rows-height)/2`). This is the only way to _float_ and to do corners/edges.
- **Input capture:** a single dispatcher + LIFO consumed-handler stack; a modal
  registers itself on mount, restoring the prior handler on unmount.
- **Backdrop:** a full-screen `position="absolute"` box (inset 0) with a
  background color, rendered **just before** the overlay content so it sits
  beneath it. **You cannot truly "dim" underlying pixels** — you can only
  overpaint. Offer a solid or tinted fill, and document this limitation.
- **Z-order:** manage an ordered array of layers and render them back-to-front
  (lowest z first in the tree).
- **View-swap as the non-overlay alternative:** many apps avoid overlays
  entirely by conditionally rendering a full-screen view (e.g. a command
  palette). Note this is a _different_ feature; your framework should support
  true floating layers, not just view swaps.

### Known gotchas to handle

- No native z-index — purely tree-order; a managed stack is required for sane
  multi-layer behavior.
- A `position="absolute"` child needs a positioned (`relative`) ancestor or it
  positions relative to the root — easy to get wrong; the framework should
  own the root overlay host so authors never think about this.
- `useInput` handlers all fire simultaneously without a router — the #1 source
  of "my modal and my background both move" bugs.
- Backdrop cannot truly dim — overpaint only.
- Re-anchoring on resize must be debounced/cheap to avoid flicker.
- Wide (CJK) characters and ANSI styling complicate width math — lean on Ink's
  own measurement (`string-width`) rather than rolling your own.
- An overlay taller/wider than the terminal must clip (`overflow="hidden"`) and
  ideally scroll internally, not overflow.

---

## 4. Required feature set

Build a **rich** overlay framework. Implement all of the **core** tier; implement
as many **extended** features as you reasonably can, clearly marking any you defer.

### Core (must-have)

- **`<OverlayHost>` (root):** a single provider that owns the layer stack and an
  absolutely-positioned, full-screen, pointer/`position="relative"` container.
  All overlays render into this host. Mount once near the app root.
- **`<Layer>` (the primitive):** a floating, absolutely-positioned box with:
  - **Anchor presets:** `center` | `top` | `bottom` | `left` | `right` |
    `top-left` | `top-right` | `bottom-left` | `bottom-right` — each computed
    from terminal size via `useWindowSize()`.
  - **Arbitrary offsets:** `top`/`left`/`right`/`bottom` numbers or `%`,
    `margin`, `padding`.
  - **`z` (z-index) prop:** an explicit number; the host sorts layers by `z`
    (ties broken by registration order) and renders back-to-front.
  - **`capture` / modal mode:** when `capture` is set, the layer traps input
    (background `useInput`/focus is disabled) and optionally shows a backdrop.
    When not capturing (`capture={false}`), input passes through to the app
    underneath (e.g. a non-blocking toast or a top-right info overlay).
  - **Backdrop:** optional full-screen underlay (`backdrop` prop: `'none' |
'opaque' | 'dim'`) rendered just below the layer; `onBackdropClick`
    equivalent = `onBackdropInput` (any key dismisses). Document the overpaint
    limitation for `'dim'`.
  - **Clipping:** content clipped to the layer's box via `overflow="hidden"`;
    support an internal scroll region for overflow content.
  - **Resize-aware repositioning:** recompute anchor on `useWindowSize()` change.
- **Focus & input capture:** an internal input dispatcher (LIFO,
  consumed-boolean model — see §3) integrated with `<Layer capture>`, plus
  optional interop with Ink's `useFocus`/`useFocusManager`. Esc-to-dismiss and
  focus restoration (return focus to the previously focused element on close)
  should be default-on and configurable.
- **Declarative API:** `<Layer …>{children}</Layer>` mounts/unmounts via React.
- **Imperative API:** an `OverlayManager` (module singleton or context) with
  `open(node, opts) → id`, `close(id)`, `closeAll()`, `update(id, patch)` — so
  non-React code (a toast service, an error boundary) can show overlays.
- **TypeScript-first:** strict types, full JSX generics, exported prop interfaces.

### Extended (rich, build what you can)

- **`<Popover anchorRef={…} placement="top|right|bottom|left|…">`:** element-
  anchored layer positioned relative to a measured box via `useBoxMetrics`,
  with collision detection (flip when it would overflow the terminal edge) and
  `offset`/`crossOffset` props.
- **`<Tooltip>`:** a popover variant: shows on a configurable trigger (focus/
  hover-ish via a key, since terminals have no hover), auto-dismisses, small z.
- **`<Toast>` / toast service:** stacked, auto-dismissing, anchored to a corner,
  non-capturing, with `toast.success/error/info/warn(message, {duration})`,
  multiple simultaneous toasts stacked without overlap, enter/exit.
- **`<Modal>`:** opinionated centered, bordered, titled, footer-bearing dialog
  built on `<Layer capture anchor="center">` — the common case, batteries
  included (`title`, `footer`, `width`, `borderStyle`, `borderColor`).
- **`<CommandPalette>`:** filterable list overlay (declarative items + render
  item), keyboard-navigable, capturing, with a text filter input — built on
  `<Layer capture>` + a virtualized/windowed list (accept a `renderItem` and
  `maxVisible`). Keep the list logic pluggable; don't hard-couple to one
  virtualizer.
- **Animations / transitions:** optional enter/exit frames (e.g. fade via dim,
  slide via offset steps) using a small frame stepper. Terminals can't do real
  opacity, so express transitions as stepped offset/width/visibility changes.
- **Focus trap primitives exposed:** `useFocusTrap()` / `<FocusTrap>` usable
  independently of `<Layer>` (so authors can trap focus in an inline region).
- **Nesting:** overlays opened from within overlays (a modal that opens a
  popover) must stack correctly with per-layer capture — only the topmost
  capturing layer holds input.
- **Dismiss guarantees:** Esc closes the topmost dismissible capturing layer;
  backdrop-input closes it; programmatic `close(id)`; automatic cleanup on
  unmount (no leaked handlers/layers).
- **Accessibility-ish:** `aria`-equivalent metadata is N/A in terminals, but
  expose a `role`-like prop (`'dialog' | 'alertdialog' | 'menu' | 'tooltip' |
'toast'`) that drives default behaviors (e.g. alertdialog → backdrop blocks
  dismiss).
- **SSR/non-TTY safety:** degrade gracefully (render final frame, no raw mode)
  consistent with Ink's non-interactive behavior.
- **Testing helpers:** a `renderWithHost()` test helper wrapping
  `ink-testing-library` so consumers can assert overlay frames easily.

> You do **not** need every extended feature for v1, but design the architecture
> so each is a clean addition. Document which are implemented vs. deferred.

---

## 5. Design constraints (non-negotiable)

- **Target:** `vadimdemedes/ink` (pin the latest stable `ink@7.x`; verify exact
  version + `engines.node`). Peer-depend on `ink` and `react`; bring in **no
  other UI runtime**. Runtime deps should be minimal.
- **Runtime-agnostic intent:** the package should run under **Node ≥ the Ink
  floor** and under **Bun**. Call out any raw-mode/stdin behavior you cannot
  guarantee under Bun.
- **Zero assumptions about the host app:** no theme system, no state library, no
  router. Styling is via Ink's native style props + caller-provided values
  (accept `borderColor`, background colors, etc. as props with sane defaults).
- **No global side effects on import:** raw mode is only enabled when a
  capturing layer is actually mounted, and restored on unmount.
- **Performance:** adding/removing a layer must not trigger a full re-render of
  the user's app tree (isolate overlay state inside the host). Aim for
  flicker-free under `incrementalRendering`.

---

## 6. Suggested API surface (sketch — refine during design)

```tsx
// Root: mount once
<OverlayHost>{appContent}</OverlayHost>

// Declarative
<Layer anchor="center" capture backdrop="dim" z={100}
       onDismiss={() => setOpen(false)}>
  <Modal title="Confirm" footer="y/n">…</Modal>
</Layer>

// Imperative
const id = overlay.open(<Toast kind="error">Boom</Toast>, { anchor: 'bottom-right' });
overlay.close(id);
// or a dedicated service:
toasts.error("Saved failed", { duration: 3000 });

// Popover
const ref = useRef<DOMElement>(null);
<Popover anchorRef={ref} placement="right">…</Popover>
```

Design the real types, defaults, and option shapes during the design phase.
Prefer **composability** (small primitives + opinionated built-ins) over a
monolithic component.

---

## 7. Implementation & packaging

- **Package shape:** a standalone repo/package (e.g. `ink-overlays` or a scoped
  name). ESM, TypeScript, `dist` built via `tsc` (or `tsgo`), dual type
  declarations. `package.json` with correct `peerDependencies`, `exports`,
  `files`, and `engines`.
- **Structure (suggested):**
  - `src/host.tsx` — `<OverlayHost>`, layer stack context, render orchestration,
    z-sorting.
  - `src/layer.tsx` — `<Layer>` core (anchoring math, capture, backdrop,
    clipping, resize).
  - `src/input-dispatcher.tsx` — the LIFO consumed-handler input router +
    `useFocusTrap`.
  - `src/primitives.ts` — anchor → coordinate math, collision/flip, resize
    hooks (pure, unit-testable).
  - `src/modal.tsx`, `src/popover.tsx`, `src/tooltip.tsx`, `src/toast.tsx`,
    `src/command-palette.tsx` — opinionated built-ins.
  - `src/manager.ts` — imperative `OverlayManager` + toast service.
  - `src/index.tsx` — public exports.
- **Tests:** `vitest` + `ink-testing-library` (or `node --test`). Cover: anchor
  math, z-sort order, capture blocks background input, dismiss paths, resize
  repositioning, popover flip, toast stacking, unmount cleanup. Snapshot key
  frames with `ink-testing-library`.
- **Docs:** a thorough `README.md` with: the mental model (paint-order z-index,
  no true dim), install, the host requirement, each component's props table,
  examples (centered modal, popover, toast, command palette, nested overlays),
  and the Bun/runtime caveats.

---

## 8. Verification (do this before declaring done)

- Confirm every §2 claim against the pinned Ink source (cite file:line in the
  README's "How it works" section).
- Prove the input-capture guarantee with a test: a background list and a
  capturing modal open simultaneously → arrow keys move only the modal, and
  background input resumes after close.
- Prove z-stacking with a test: open 3 layers with `z={1,5,3}` → assert render
  order and that the topmost capturing layer owns input.
- Prove resize repositioning: change `useWindowSize` output → assert a centered
  layer recenters.
- Run the test suite under **Node** and, if feasible, **Bun**; report any
  raw-mode/input differences under Bun.
- Lint + typecheck clean.

---

## 9. Out of scope (do not build)

- A general layout/flexbox system, a theme engine, a state manager, or a router.
- Mouse support (terminals rarely have it; ignore).
- Real transparency/blur (impossible in terminals — overpaint only).
- Coupling to any specific app, framework, or virtualization library.

---

## 10. Deliverable checklist

- [ ] Standalone package, ESM + TS, correct peer deps on `ink`/`react`.
- [ ] `<OverlayHost>`, `<Layer>` (anchors, z, capture, backdrop, clip, resize).
- [ ] Input dispatcher + focus trap; modal capture works; focus restores on close.
- [ ] Imperative `OverlayManager` + toast service.
- [ ] Built-ins: `<Modal>`, `<Popover>`, `<Tooltip>`, `<Toast>`, `<CommandPalette>`.
- [ ] Tests (anchor math, z-order, capture, dismiss, resize, popover flip,
      stacking, unmount cleanup) passing on Node (+ Bun report).
- [ ] `README.md` with mental model, props tables, examples, runtime caveats.
- [ ] §2 claims verified against source with citations.
