## Positioning

Layers in ink-overlay use one of three positioning strategies. The first — flexbox anchoring — is the default path for `<Layer>` and `<Modal>`: you name a screen-edge or corner and the host's flex container resolves the exact coordinates at render time, with zero measurement. The second — explicit offsets — lets you pass raw top/left/right/bottom numbers when you need surgical control. The third — popover element-anchoring — is the most complex: it builds on top of explicit positioning plus runtime measurement, anchoring the layer to a referenced element and repositioning it with flip, shift, and collision logic. This document explains how each model works, why the framework made these choices, and the limitations you need to know about. For the broader host-and-renderer architecture that consumes these positioning results, see [concepts/architecture.md](./architecture.md).

---

## The Nine-Anchor Flexbox Model

When you set an `anchor` prop on a `<Layer>` (or let it default to `center`), the `LayerRenderer` does not measure your content. Instead it wraps the content in a full-screen absolute-positioned Box with `flexDirection='row'`, then derives `alignItems` (the vertical / cross axis) and `justifyContent` (the horizontal / main axis) from the anchor string via the `anchorToFlexbox` function.

The mapping produces the classic 3×3 grid:

    ┌───────────────────────────────────────────┐
    │                                           │
    │   top-left        top         top-right   │
    │                                           │
    │   left          CENTER         right      │
    │                                           │
    │   bottom-left   bottom     bottom-right   │
    │                                           │
    └───────────────────────────────────────────┘

Each anchor decomposes into a vertical value and a horizontal value. `top` means `alignItems='flex-start'` and `justifyContent='center'` — pinned to the top edge but horizontally centered. `bottom-right` means `alignItems='flex-end'` and `justifyContent='flex-end'` — pushed into the bottom-right corner. `center` maps both axes to `'center'`.

    anchor         alignItems      justifyContent
    ───────────    ────────────    ────────────────
    center         center          center
    top            flex-start      center
    bottom         flex-end        center
    left           center          flex-start
    right          center          flex-end
    top-left       flex-start      flex-start
    top-right      flex-start      flex-end
    bottom-left    flex-end        flex-start
    bottom-right   flex-end        flex-end

### Why Flexbox Instead of Measure-Then-Center?

A naive approach would measure the layer's width and height, compute the centering offsets arithmetically, and apply them as top/left. That approach flickers: the content renders at its default position for one frame before the measurement effect fires and repositions it. By delegating to the flexbox layout engine, the content is centered in the same render pass that paints it — there is never a frame where the content sits at the wrong coordinates. The `LayerRenderer` simply sets the alignment properties and the flex engine resolves placement atomically. This is the same reason CSS frameworks prefer `display: flex` over JavaScript-calculated margins.

---

## Explicit Positioning

When no `anchor` is set but at least one of `top`, `left`, `right`, or `bottom` is provided, the `Layer` computes an `explicitPosition` object and the `LayerRenderer` applies those offsets directly to a `position='absolute'` Box. The values can be numbers (character-cell offsets) or percentage strings.

The two models are mutually exclusive: if `anchor` is set, the explicit offsets are ignored entirely. This precedence is deliberate — an anchor is a high-level intent ("put me at the top"), while explicit offsets are low-level coordinates. Mixing them would be ambiguous. When neither is provided, the renderer falls back to `anchor='center'`, so every layer always has a well-defined position.

---

## Popover Element-Anchoring

A `<Popover>` is positioned relative to a referenced element (the `anchorRef`). Unlike screen-edge anchors, this requires measuring both the anchor's rectangle and the popover's own size at runtime. The popover uses Ink's `useBoxMetrics` hook to read the anchor's measured layout and a second `useBoxMetrics` call on an internal ref to read the popover's own dimensions.

### Flash-Free Offscreen Strategy

Until both the anchor and the popover have been measured, the popover is rendered offscreen at `top: -9999, left: -9999`. This is a deliberate placeholder: it reserves space in the render tree (so `useBoxMetrics` can measure it) without ever painting visible content at the wrong location. Once the `isMeasured` condition is satisfied — both elements have non-zero dimensions and `hasMeasured` is true — the popover snaps directly to its final computed position. The user never sees a flash at `(0, 0)`.

### Root-Relative Coordinate Resolution

`useBoxMetrics` returns parent-relative coordinates — offsets relative to the immediate parent Box. But popovers need root-relative coordinates because the popover layer is positioned by the OverlayHost (a sibling of the app tree, not a child of the anchor's parent). The `getRootRelativeRect` function walks the `parentNode` chain from the anchor element upward, summing each ancestor's yoga `getComputedLayout()` left and top offsets. The final rect is `{left, top, width, height}` in root-relative space.

---

## The Twelve Placements

A popover's `placement` prop combines a main axis with an optional cross-axis alignment. The four axes are `top`, `bottom`, `left`, and `right`; each pairs with `start`, `center` (the default when omitted), or `end`:

    Axis        start         (default)      end
    ────────    ──────        ─────────      ────
    top         top-start     top            top-end
    bottom      bottom-start  bottom         bottom-end
    left        left-start    left           left-end
    right       right-start   right          right-end

The main axis determines which side of the anchor the popover appears on. The cross-axis alignment controls perpendicular positioning: for a `bottom` placement, the cross axis is horizontal, so `start` aligns the popover's left edge with the anchor's left edge, `center` centers it, and `end` aligns right edges. For a `left` placement, the cross axis is vertical, and the same logic applies to the top/bottom edges.

The `offset` prop adds a gap along the main axis (between the anchor edge and the popover). The `crossOffset` prop shifts along the cross axis.

---

## Collision Detection

After computing the initial position, `computePopoverPosition` applies up to two correction passes. Both are enabled by default but can be individually disabled.

### Flip

The flip pass checks whether the popover overflows the viewport along the main axis. If `placement='bottom'` but the popover would extend past `viewport.rows`, the axis is mirrored to `top`. Similarly, `top` flips to `bottom`, `left` flips to `right`, and vice versa. The cross-axis alignment is preserved — a `bottom-start` that flips becomes `top-start`, not `top-center`.

    BEFORE FLIP — popover overflows the bottom viewport edge:

        ┌────────────────────┐
        │      anchor        │
        └────────────────────┘
        ┌────────────────────┐
        │     popover        │  ← extends past the last row
        └────────────────────┘

    AFTER FLIP — axis mirrored to 'top', side preserved:

        ┌────────────────────┐
        │     popover        │
        └────────────────────┘
        ┌────────────────────┐
        │      anchor        │
        └────────────────────┘

Flip only considers main-axis overflow. Cross-axis overflow is left to the shift pass.

### Shift

After flipping (or deciding not to), the shift pass clamps the popover's coordinates within the viewport bounds. The clamping range accounts for the popover's own dimensions: the minimum left is the padding, the maximum left is `viewport.columns - popoverWidth - paddingRight`, and the same logic applies vertically. Shift does not change the placement axis — it is a pure clamp.

### Collision Padding

The `collisionPadding` prop adds extra inset to the shift clamp on all four sides. It accepts a single number (uniform) or a partial `OffsetEdges` object (`{top, right, bottom, left}`) for per-edge control. For example, `collisionPadding={2}` keeps the popover at least 2 cells away from every viewport edge. Padding only affects the shift clamp; it does not influence the flip decision.

The final `placement` returned by `computePopoverPosition` reflects any axis flip, so consumers know where the popover actually landed — it may differ from the requested placement.

---

## Margin Offsets and Clipping

The `margin` prop (`OffsetEdges`) applies inward offsets on the inner content Box within a `LayerRenderer`. Each edge pushes the content away from its respective viewport boundary: `margin.top` pushes the content down, `margin.bottom` pushes it up, and likewise for left/right. Margins work regardless of the anchor — a bottom-anchored layer with `margin.bottom` will be pulled slightly above the bottom edge.

The `overflow` prop (default `'hidden'`) controls whether content that exceeds the layer's bounding box is clipped. Ink implements clipping via a clip-rectangle stack: when `overflow='hidden'`, the renderer pushes a clip region and any write operations outside that region are skipped. This prevents floating content from bleeding over adjacent UI. Set `overflow='visible'` to allow overflow when you need content to paint outside the layer bounds.

---

## Resize Handling

Positioning is recomputed whenever the terminal dimensions change. The `LayerRenderer` calls Ink's `useWindowSize()` hook, which triggers a re-render on resize. Because the host Box is sized to the terminal's row count and width, flexbox-anchored layers automatically recenter or re-align. Popovers go further: the `Popover` component also calls `useWindowSize()` and `useBoxMetrics`, both of which refire on resize. When the viewport shrinks or grows, `computePopoverPosition` runs again with the new dimensions, and the popover may flip or shift to stay on screen.

---

## The Ancestor-Shift Limitation

Popovers reposition when the anchor's own metrics change, when the popover content resizes, and when the terminal resizes. They do **not** reposition when an ancestor or sibling element moves the anchor's root-relative position without changing the anchor's parent-relative metrics.

This happens because `useBoxMetrics` reports offsets relative to the immediate parent. If a sibling above the anchor grows by three rows, the anchor's root-relative top shifts down by three — `getRootRelativeRect` would compute different coordinates — but the anchor's parent-relative metrics remain identical, so the position effect does not re-run. The popover stays at its old coordinates while the anchor has moved underneath it.

Ink exposes no public per-node layout observer. An internal `addLayoutListener` exists in `ink/build/dom.js` but is not part of the public API, so the framework cannot subscribe to arbitrary layout changes. The practical workaround is to close and reopen the popover, or to key it on the layout-affecting state so it remounts and re-measures. For the full discussion of this and related runtime constraints, see [concepts/limitations.md](./limitations.md).
