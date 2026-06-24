# Architecture

ink-overlay is a layer compositing system built on top of Ink's flat, tree-traversal-based rendering model. It cannot ask Ink to paint things out of order, so it restructures its own JSX tree on every render so that layers appear in the correct back-to-front sequence. Everything else — the registration pattern, the dual declarative/imperative descriptor sources, the backdrop overpaint, the overflow clipping — follows from that one constraint. This document explains the paint model, the host-and-layer relationship, how descriptors are merged and sorted, and the terminal realities that shape backdrop and clipping behavior. For how layers are positioned once they are rendered, see [positioning.md](./positioning.md); for the input and focus layer built on top of this architecture, see [input-and-focus.md](./input-and-focus.md); for runtime limitations (Bun, non-TTY, flicker), see [limitations.md](./limitations.md).

---

## Paint Order Is Tree Traversal Order

Ink has no `z-index` prop and no compositing pipeline. The paint order is determined entirely by the order in which nodes are visited during the tree traversal that produces the final output. Ink's `Output.get` method walks its internal `operations` list in insertion order, and each `write` operation overwrites whatever characters already occupy those positions in the output buffer. A node that appears later in the tree is written later, so its characters land on top.

This means the only lever the framework has for controlling visual stacking is the position of layer nodes in the JSX tree it hands to Ink. If a modal needs to appear above a toast, the modal's render output must be visited after the toast's. The framework's entire job is to guarantee that ordering deterministically.

It is worth contrasting this with the browser model. In a browser, elements participate in a paint stacking context governed by `z-index`, opacity, transforms, and document order. You can set `z-index: 999` on a deeply nested element and it will float above a sibling declared earlier. Ink offers nothing analogous. There is no stacking context, no `z-index`, and no compositor. The framework's `z` prop is a logical sorting key that it translates into physical tree position — it is not forwarded to Ink as a style property. The sorting happens entirely in JavaScript, before Ink ever sees the tree.

---

## Relative Host, Absolute Layers

`OverlayHost` renders a single `<Box>` with `position='relative'`, `width='100%'`, `height={terminalRows}` (sourced from Ink's `useWindowSize`), and `flexDirection='column'`. Inside that box, the host renders two groups of children: first the application's own children (the background UI), then the sorted list of layer descriptors mapped through `LayerRenderer`.

Each `LayerRenderer`, in turn, renders its content inside a `<Box>` with `position='absolute'`. This is the only combination that produces overlay behavior in Ink. A relative-positioned ancestor establishes a containing block, and absolute-positioned descendants are laid out relative to it rather than flowing inline with siblings. Ink maps `position: 'absolute'` to Yoga's `POSITION_TYPE_ABSOLUTE` and applies top/left/right/bottom offsets, removing the node from normal flex flow. Without the relative parent, absolute children would be positioned relative to the root and could land anywhere; without absolute positioning, layers would participate in the column flex layout of the host box and push each other around instead of overlapping.

Within each `LayerRenderer`, the content may optionally be wrapped in a `FocusTrap` when the layer's `capture` flag is set. The trap is responsible for confining Tab and Shift+Tab cycling to the layer's focusable elements and for incrementing the capture-depth signal that tells background components to deactivate their own input handlers. That subsystem is documented fully in [input-and-focus.md](./input-and-focus.md); from the architecture perspective, the key point is that capture is a layer-level property that the renderer translates into a focus-trap wrapper around the content box.

The result is a stack of independently positioned layers floating over the background:

    ┌─────────────────────────────────────────┐
    │  OverlayHost  (relative, 100% × rows)   │
    │                                         │
    │   children (background app)             │
    │                                         │
    │   ┌─ LayerRenderer z=0 ────────────┐    │  ← paints first
    │   │  background layer               │    │
    │   └─────────────────────────────────┘    │
    │                                         │
    │   ┌─ LayerRenderer z=100 ──────────┐    │
    │   │  middle layer                   │    │
    │   └─────────────────────────────────┘    │
    │                                         │
    │   ┌─ LayerRenderer z=200 ──────────┐    │  ← paints last
    │   │  top layer                      │    │
    │   └─────────────────────────────────┘    │
    └─────────────────────────────────────────┘

Later-rendered siblings (higher z, or same z with higher order) appear in the tree after earlier ones and therefore paint on top.

---

## The Registration Pattern

A `<Layer>` component never renders floating content itself — it returns `null`. This is not laziness; it is a deliberate inversion of control. If each layer rendered its own absolute box wherever it happened to sit in the application tree, the framework would have no way to sort them globally by z-level. A layer buried deep in a child component could not reliably appear above a layer declared at the top of the tree, because paint order is fixed by tree position, and the framework does not control the consumer's tree structure.

The registration pattern solves this by separating the concern of "what should be on screen" from "where in the tree it gets rendered." Each `<Layer>` is responsible only for describing itself — its z-level, its positioning props, its content, its callbacks — and for pushing that description up to the host. The host is responsible for collecting all descriptions, sorting them, and rendering the actual floating UI. This separation is what makes both the declarative `<Layer>` component and the imperative `overlay`/`toasts` services produce identical rendering behavior: they both feed descriptors into the same host pipeline.

Instead, when a `<Layer>` opens it calls `host.registerLayer(descriptor)` through the `OverlayHostContext`, handing the host a descriptor containing its id, z-level, anchor or explicit position, content, backdrop, transition, and callbacks. The host stores that descriptor in a mutable ref. While the layer stays open and its props change, the layer calls `host.updateLayer(id, patch)` with a shallow-merged patch so the host always has the latest content and configuration. When the layer closes, it either calls `host.unregisterLayer(id)` immediately (if there is no multi-step exit transition) or calls `host.updateLayer(id, {exiting: true})` to let the exit animation play before the host removes it.

The context itself — `OverlayHostContext` — exposes four methods: `registerLayer`, `unregisterLayer`, `updateLayer`, and `removeLayerAfterExit`. The last one is called by `LayerRenderer` when an exit transition finishes; the host's implementation simply delegates to `unregisterLayer`. The context value is memoized so that its identity is stable across re-renders as long as the callback identities do not change, which prevents unnecessary re-renders of consumers that read the context. If a component tries to use the context outside of an `<OverlayHost>`, the `useOverlayHost` hook throws an error immediately, making misconfiguration loud and obvious.

When a `<Layer>` unmounts entirely (not just closes, but is removed from the tree while still open), a cleanup effect calls `unregisterLayer` so the floating content does not linger on screen. This covers cases like conditional rendering where the parent stops rendering the `<Layer>` component.

Because the host owns all descriptors in a single flat collection, it can sort them globally before rendering. The layers appear in the tree in sorted order, as siblings after the application children, giving the framework total control over paint order regardless of where each `<Layer>` was declared in the consumer's component hierarchy. The `<Layer>` itself renders nothing — the host renders its content through `LayerRenderer`.

The host uses a single `version` state counter — a plain integer incremented via `setVersion(v => v + 1)` — as the re-render trigger. Registering, unregistering, or updating a layer calls `bumpVersion()`, which tells React to re-render the host. The host then reads the current contents of its mutable refs, re-sorts, and re-maps. React nodes are never stored in state; the descriptors live in refs, and state is used only to signal that something changed. This avoids stale-closure issues and keeps the refs as the single source of truth.

There is one subtlety worth noting. The `<Layer>` component deliberately omits `children` from the dependency array of its main lifecycle effect, to avoid churning through register-and-update cycles on every render that only changes content. But this means a content-only change would leave the host's descriptor stale, since the effect would not re-run. To close that gap, `<Layer>` runs a second effect after every render that compares the current children ref against a previously-synced snapshot; if they differ, it pushes a content-only update to the host via `updateLayer`. The `<Layer>` also handles React StrictMode double-invocation: if the effect detects that the layer was previously open but registration was cleared (as happens when StrictMode unmounts and remounts), it re-registers rather than updating a non-existent descriptor.

---

## Merging and Sorting Two Descriptor Sources

The host maintains two independent descriptor collections that it merges on every render.

The first source is **declarative** — descriptors registered via the context by `<Layer>` and the built-in components (`<Modal>`, `<Popover>`, `<CommandPalette>`, and so on). These live in a `Map<string, OverlayDescriptor>` and each receives a monotonically increasing `order` value from a simple counter that increments on every registration.

The second source is **imperative** — descriptors that arrive from the `overlayStore` via a subscription established in a `useEffect`. The `overlay` and `toasts` services push entries into this store, and the host's subscription callback copies them into a ref and calls `bumpVersion()`. Imperative descriptors receive their order values from a separate counter that starts at a large base constant — `IMPERATIVE_ORDER_BASE`, set to ten million. This ensures that when a declarative layer and an imperative layer share the same z-level, the imperative one always sorts after the declarative one, making stacking deterministic rather than dependent on registration timing.

The host concatenates both descriptor arrays and passes them to `sortLayers()`, which returns a new array (it does not mutate the input) sorted ascending by z, with ties broken by order ascending. The comparison function is straightforward: if two layers have different z values, the one with the lower z sorts first; if they share a z value, the one with the lower order sorts first. The sorted list is then mapped through `<LayerRenderer>`, producing a sequence of sibling nodes inside the host box. Because Ink paints later siblings on top, this back-to-front ordering directly produces the correct visual stacking.

The imperative order cache deserves a mention. When the store delivers a new set of entries, the host prunes cache entries for ids that are no longer present, then assigns each surviving or new entry a stable order from the imperative counter. An entry that persists across store updates keeps its original order, so its position in the sort is stable across re-renders — it does not jump around as other overlays open and close.

It is worth pausing on why the imperative base is so large. Declarative layers get sequential orders starting from zero. If imperative layers used the same counter space, their sort position relative to declarative layers at the same z would depend on timing — whichever registered first would sort first. By offsetting imperative orders into the millions, the framework guarantees that at any given z-level, all declarative layers paint before all imperative ones. This is an arbitrary but deterministic tiebreak rule: it means a declarative `<Modal>` at z=100 always sits beneath an imperative `overlay.open()` at z=100, and consumers can reason about stacking without worrying about registration race conditions.

    sort key:   (z, order) ascending
                 │
                 ▼
    ┌──────────────────────────────────────────────────┐
    │  declarative z=0   order=0                       │  ← paints first
    │  declarative z=0   order=1                       │
    │  declarative z=100 order=2                       │
    │  imperative z=100  order=10_000_000              │
    │  imperative z=200  order=10_000_001              │  ← paints last
    └──────────────────────────────────────────────────┘

---

## Backdrop Is Overpaint, Not Transparency

Terminals have no alpha channel. A character cell is either written with a color or not written at all; there is no way to blend a semi-transparent layer over the content beneath. This means a backdrop cannot dim or blur the background — it can only paint solid color over it.

When a layer's backdrop is not `'none'`, `LayerRenderer` renders an additional `<Box>` with `position='absolute'`, full width and height, and a solid `backgroundColor`. This box is a sibling that appears before the content wrapper in the tree, so the content paints on top of it. The color is `backdropColor` if provided, otherwise `'black'` when the backdrop kind is `'opaque'` and the hex string `#1a1a2e` (a very dark blue-black) when the kind is `'dim'`. Neither is a true transparency effect — both are opaque fills. The `'dim'` variant simply uses a dark color that visually recedes; the `'opaque'` variant uses pure black to fully conceal the background. The backdrop is an overpaint, not a composite.

One consequence of the overpaint model is that the background content beneath the backdrop is destroyed — it is not preserved underneath in any recoverable layer. When the layer closes and the backdrop disappears, the background must be fully re-rendered by Ink's next output flush. This is fine for normal React re-renders, but it means the framework cannot do things like "dim then undim" without a full repaint of the area. There is no concept of hiding or showing a composited layer; every change is a complete re-render of affected cells.

---

## Clipping via overflow='hidden'

Ink maintains a stack of clip rectangles during rendering. When a `<Box>` has `overflow='hidden'`, the renderer pushes a clip rectangle onto the stack before rendering its children; write operations whose coordinates fall outside the current clip rectangle are skipped, and the rectangle is popped when the box's subtree is done. This is Ink's only mechanism for preventing content from painting outside a bounding region.

`LayerRenderer` applies `overflow` (defaulting to `'hidden'`, matching `<Layer>`) to the inner content box that wraps the layer's children. Without this default, a layer's content could bleed past its intended bounding box and overwrite neighboring UI — whether background elements, other layers, or the terminal border. Because terminals have no clipping or compositing at the glyph level, every character written to the output buffer stays there unless overwritten, so unchecked overflow produces visible corruption. The `'hidden'` default ensures that each layer's content stays within its box, and the clip stack ensures that content rendered inside a clipped ancestor does not escape even when it is absolutely positioned. Consumers who need content to overflow — for example, a deliberately oversized visual element — can set `overflow='visible'`, but they take responsibility for the visual consequences.

It is also worth noting that the clip applies to the inner content box, not to the outer positioning wrapper. The `LayerRenderer` applies the `overflow` property to the box that directly wraps the layer's children, along with any margin offsets. The outer wrapper (the absolute-positioned flexbox or explicit-position box) handles only placement, not clipping. This separation means positioning and clipping are independent concerns: a layer can be anchored to a corner and still clip its content to whatever size the inner box resolves to.

For popover layers, this clip behavior interacts with the measurement-based positioning pipeline. Because popovers render offscreen until both the anchor element and the popover content have been measured, the clip rectangle is already in place by the time content becomes visible, preventing any flash of un-clipped content during the measurement phase. The full popover positioning story is covered in [positioning.md](./positioning.md).

---

## Putting It Together

The architecture is a chain of consequences. Ink paints by tree traversal, so the framework must control tree order. To control tree order globally, layers register with a single host instead of rendering themselves. The host merges declarative and imperative descriptors, sorts them by (z, order), and renders them back-to-front as absolute-positioned children of a relative host box. Backdrops are solid overpaints because terminals have no alpha, and content is clipped by default because terminals have no compositing.

The result is that consumers get a familiar, web-like overlay API — a `z` prop, backdrop kinds, controlled and uncontrolled open state, named transitions — backed by a system that maps every one of those abstractions onto the one primitive Ink actually offers: the order of nodes in a tree. The positioning math that determines where each absolute box lands is covered in [positioning.md](./positioning.md); the LIFO input dispatcher and focus trap that manage keyboard interaction on top of this rendering structure are covered in [input-and-focus.md](./input-and-focus.md). The stepped frame-based animation engine that drives enter and exit transitions is documented in [animation.md](./animation.md).
