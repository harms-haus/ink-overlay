## Animations and Transitions

Ink-overlay's animation system is built around a deliberately simple idea: a transition is a fixed, ordered list of style frames, not a continuous interpolation. Because terminal renderers repaint entire character cells on every output flush, there are no sub-cell transforms, no compositing pipeline, and no alpha channel. The only way to produce motion is to change box-level style properties (margins, height, and similar) in discrete steps across multiple render cycles. Every claim below is grounded in the implementation in `src/animation.tsx` and its sole consumer, `LayerRenderer` in `src/layer.tsx`.

### Why Frame-Stepping Is the Only Option

In a browser, a CSS transition asks the layout engine to interpolate between two states at 60 FPS, and the compositor handles sub-pixel rendering. In a terminal, each frame is a grid of fixed-width character cells. When Ink decides to re-render, it clears the screen region and writes new characters wholesale — there is no concept of "50% opacity" or "translateX(12.3px)." You either paint a cell or you do not. This means a "transition" can only be expressed as a sequence of distinct box layouts: move the margin by N cells, then N/2, then 0. Each intermediate layout is a real, complete render. The framework formalizes this into a small data structure: an array of frames, each carrying a partial Box-style object, plus a single `duration` value (in milliseconds) that governs how long each frame is held before the next is applied.

### The Frame-Stepped Transition Model

A `TransitionConfig` has three fields:

- **enter** — an ordered array of style frames applied when the layer opens (visible goes false to true).
- **exit** — an ordered array of style frames applied when the layer closes (visible goes true to false).
- **duration** — the number of milliseconds each frame is held before advancing to the next.

Each frame is a `TransitionStep` whose `style` property is a partial Box-style override (for example, `{marginTop: 4}`). The hook `useEnterExit` is the engine that drives these frames. It maintains a four-state machine: `entering`, `visible`, `exiting`, `exited`. When the `visible` boolean flips to true, the hook enters the `entering` stage and steps through the enter frames one by one at `duration`-millisecond intervals. When it reaches the last enter frame, it transitions to `visible` and holds that final frame's style indefinitely. When `visible` flips back to false, the hook enters `exiting`, steps through the exit frames, and on the last frame transitions to `exited` and fires the optional `onExited` callback. The hook returns three values: the current `stage` (`'entering'`, `'visible'`, `'exiting'`, or `'exited'`), the `currentStyle` object to apply to the content Box for the active frame, and a `key` counter that increments each enter/exit cycle — the `LayerRenderer` uses this key to force a remount between cycles so React restarts the interval cleanly.

The frame-stepping loop is implemented with a plain `setInterval` inside a `useEffect`, not with Ink's own `useAnimation` hook. The code comments explain why: `useAnimation` depends on the `AnimationContext` provider (only present inside Ink's internal `<App>`) and uses shared timer / render-throttle semantics that make deterministic frame-counting difficult, especially in tests. A self-contained interval is trivially testable with real timers and a simple `await delay()`.

The hook also includes a `canSkip` optimization: when both the enter and exit arrays have at most one frame each (as with the `none` transition), the hook skips the entering/exiting stages entirely and jumps straight to `visible` or `exited`. This avoids an unnecessary timer and render cycle for transitions that have no animation.

### Enter vs Exit — and Why the Layer Stays Mounted During Exit

A critical architectural detail is that the exit sequence is not instantaneous. When a layer begins closing, the host marks the descriptor with `exiting: true` rather than removing it immediately. The `LayerRenderer` passes `!descriptor.exiting` as the `visible` argument to `useEnterExit`, so the hook drives the exit frames. The layer remains mounted — and painted — until the final exit frame completes, at which point `onExited` calls `host.removeLayerAfterExit(descriptor.id)` and the host finally unregisters the layer. This is what makes exit transitions visible: the content is progressively restyled across multiple frames before disappearing. If a transition's exit array has only one frame (or no transition is configured), the layer is unregistered immediately on close with no exit animation.

### Built-In Transitions

The function `getTransitionSteps(name)` returns the predefined frame sequence for each built-in transition name. Results are cached in a module-level `Map` keyed by name, since transition configs are fully deterministic and never change at runtime. The built-ins are:

- **none** — a single empty-style frame for both enter and exit, with `duration: 0`. No visible animation; the layer appears and disappears instantly. This is the effective default when no transition is configured (the `IDENTITY_TRANSITION` constant in `layer.tsx` mirrors this shape).
- **fade** — see the dedicated section below on its limitation.
- **slide-up** — three enter frames that reduce `marginTop` from 4 → 2 → 0, and three exit frames that increase it from 0 → 2 → 4. The content appears to slide up from below its final position. Duration is 80 ms per frame.
- **slide-down** — the mirror of slide-up, using `marginBottom` (4 → 2 → 0 on enter; 0 → 2 → 4 on exit). The content slides down from above.
- **slide-left** — three frames using `marginLeft` (4 → 2 → 0 on enter; reversed on exit). Content slides in from the right.
- **slide-right** — three frames using `marginRight` (4 → 2 → 0 on enter; reversed on exit). Content slides in from the left.

All four slide transitions share the same structure: a starting offset of 4 cells, a midpoint at 2, and a resting position at 0, held for 80 ms each — a total of roughly 240 ms for the full entrance or exit.

### The 'fade' Limitation

The name `fade` is retained for API compatibility, but the implementation is honest about what it actually does. The source comments in `getTransitionSteps` explain that a previous version attempted to apply `dim` / `dimColor` to the wrapper `Box`, but those are `Text`-level props in Ink — they are silently ignored on a `Box`, so there was no visible dimming at all. The current implementation uses a stepped height grow: the enter sequence sets `height` from 0 to 1, and the exit sequence reverses it (1 to 0). The visual effect is a quick collapse/expand — the layer briefly renders at zero height, then jumps to one row. A true cross-fade is impossible in a terminal because there is no alpha channel and no compositing layer: you cannot blend two render states. The framework's documentation recommends using `slide-up` or `slide-down` when a more visible entrance animation is desired.

### Custom Transitions

A custom transition requires no registration — it is simply a `TransitionConfig` object with your own `enter` and `exit` frame arrays and a `duration` value. Each frame's `style` can include any valid Ink Box style property (margins, padding, height, width, and so on). Because the framework applies transition styles by shallow-merging them onto the content box (via `mergeTransitionStyle`), any property you include in a frame's style overrides the base style for that frame. The `mergeTransitionStyle` helper takes the base content Box style and the current frame's style and produces a merged object where the frame's values take precedence, so each step in the animation is a fully-resolved Box style.

Note that if a transition name is passed that does not match one of the six built-ins, `getTransitionSteps` falls back to its `default` case: an instantaneous no-op with a single empty-style frame for both enter and exit and `duration: 0`, which is effectively the same as the `none` transition. You can mix and match freely: a custom enter that slides from the left and a custom exit that collapses to zero height, or any combination that fits your UI. The `transition` prop on `<Layer>` accepts either a built-in name string or a full `TransitionConfig` object, so the same prop slot serves both cases. For practical examples of custom transition configs, see services/animations.md.

### Resolution: getTransitionSteps and resolveTransition

Two exported helpers bridge the gap between user-facing transition specs and concrete configs:

- **getTransitionSteps(name)** takes a `TransitionName` string and returns the cached `TransitionConfig` for that built-in transition. Because configs are deterministic, the result is computed once per name and stored in a module-level `Map` for subsequent calls. This is the lowest-level building block.
- **resolveTransition(spec)** is the general-purpose resolver. It accepts `undefined` (returns `undefined`), a string name (delegates to `getTransitionSteps`), or a raw `TransitionConfig` object (returns it as-is). This is what `<Layer>` uses internally to normalize the `transition` prop into a concrete config before registering with the host.

The `resolveTransition` function is also exported from the package barrel for consumers who want to pre-resolve a transition spec programmatically.

### Frame Timeline (ASCII)

The diagram below shows a three-frame enter transition (such as `slide-up`) advancing over time. Each frame is held for `duration` ms, then the next style is applied. After the last enter frame, the layer holds the final style in the `visible` stage.

    time ──►

    │  0 ms          80 ms         160 ms        240 ms        ∞
    │   │              │              │              │           │
    │   ▼              ▼              ▼              ▼           ▼
    │ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ │ enter   │  │ enter   │  │ enter   │  │ visible  │  │ visible  │
    │ │ frame 0 │  │ frame 1 │  │ frame 2 │  │ (hold    │  │ (hold    │
    │ │ margin  │→ │ margin  │→ │ margin  │→ │  frame 2)│→ │  frame 2)│
    │ │  Top: 4 │  │  Top: 2 │  │  Top: 0 │  │  Top: 0  │  │  Top: 0  │
    │ └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
    │                                                          │
    │   ←───── entering stage ──────►          ←── visible ──►

When the layer closes, the same pattern runs in reverse using the exit frames, and the layer is only unregistered after the final exit frame completes. For a deeper discussion of terminal rendering constraints that make this model necessary, see concepts/limitations.md. For practical usage examples including custom transition configs, see services/animations.md.
