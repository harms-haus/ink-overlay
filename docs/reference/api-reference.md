# API Reference

This page is the complete type and helper reference for `@harms-haus/ink-overlay`. It documents every exported type alias and every exported utility function so that component docs, concept docs, and service docs can link to a single source of truth rather than re-stating shapes inline. All signatures below are reproduced verbatim from `src/types.ts`, `src/primitives.ts`, `src/runtime.ts`, `src/animation.tsx`, `src/toast.tsx`, and `src/manager.tsx`; consult those files when in doubt. The runtime detection helpers and the pure positioning primitives are safe to call from any context (including non-React code) — they perform no I/O and have no global side effects on import.

## Shared Types

### `Anchor`

The nine positional anchor strings used to pin a layer to a region of the viewport. Consumed by [`Layer`](../components/layers.md) and by the imperative `overlay.open` via `LayerOpts.anchor`; the raw coordinate math lives in [`computeAnchorCoords`](#computeanchorcoords) and is explained in [Positioning](../concepts/positioning.md).

```ts
export type Anchor =
	| 'center'
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';
```

### `Placement`

The twelve placement variants consumed by [`computePopoverPosition`](#computepopoverposition). The bare axis value (`'top'`, `'bottom'`, `'left'`, `'right'`) is equivalent to the `-center` side; the hyphenated suffix selects the cross-axis alignment.

```ts
export type Placement =
	| 'top'
	| 'top-start'
	| 'top-end'
	| 'bottom'
	| 'bottom-start'
	| 'bottom-end'
	| 'left'
	| 'left-start'
	| 'left-end'
	| 'right'
	| 'right-start'
	| 'right-end';
```

### `BackdropKind`

Controls how the region behind an overlay is rendered. See [`LayerOpts.backdrop`](#layeropts) and the [Layers](../components/layers.md) component doc.

```ts
export type BackdropKind = 'none' | 'opaque' | 'dim';
```

### `Role`

The ARIA-style role assigned to a layer. Drives the `role` prop on the rendered root element.

```ts
export type Role = 'dialog' | 'alertdialog' | 'menu' | 'tooltip' | 'toast';
```

### `Viewport`

Terminal dimensions in character cells. `columns` is the horizontal cell count (stdout columns); `rows` is the vertical cell count.

```ts
export type Viewport = {columns: number; rows: number};
```

### `Rect`

A width × height pair in character cells. Used to pass the measured size of a layer or popover into the positioning primitives.

```ts
export type Rect = {width: number; height: number};
```

### `AnchorRect`

The geometry of the anchor element for popover positioning, expressed in root-relative (terminal) coordinates. Consumed by [`computePopoverPosition`](#computepopoverposition).

```ts
export type AnchorRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};
```

### `OffsetEdges`

Per-edge numeric insets. Used both as the `margin` on [`LayerOpts`](#layeropts) (where each edge pushes the layer inward — see [`computeAnchorCoords`](#computeanchorcoords)) and as a `collisionPadding` shape inside [`computePopoverPosition`](#computepopoverposition).

```ts
export type OffsetEdges = {
	top?: number;
	left?: number;
	right?: number;
	bottom?: number;
};
```

### `ExplicitPosition`

Position values for an explicitly placed layer. Each edge may be a number (cells) or a percentage string such as `'50%'`. This is the resolved shape stored on [`OverlayDescriptor`](#overlaydescriptor); the public API accepts the loose `top` / `left` / `right` / `bottom` fields on [`LayerOpts`](#layeropts).

```ts
export type ExplicitPosition = {
	top?: number | string;
	left?: number | string;
	right?: number | string;
	bottom?: number | string;
};
```

### `LayerOpts`

The full option bag accepted by `overlay.open` (see [Imperative API](../services/imperative-api.md)) and by the [`Layer`](../components/layers.md) component. Every field is optional.

```ts
export type LayerOpts = {
	anchor?: Anchor;
	top?: number | string;
	left?: number | string;
	right?: number | string;
	bottom?: number | string;
	z?: number;
	capture?: boolean;
	backdrop?: BackdropKind;
	backdropColor?: string;
	role?: Role;
	overflow?: 'visible' | 'hidden';
	margin?: OffsetEdges;
	transition?: TransitionName | TransitionConfig;
	onDismiss?: () => void;
	onBackdropInput?: () => void;
};
```

Field semantics:

| Field | Purpose |
| --- | --- |
| `anchor` | Viewport region to pin the layer to ([Anchor](#anchor)). |
| `top` / `left` / `right` / `bottom` | Explicit position overrides (number or `'%'` string); take precedence over `anchor` when set. |
| `z` | Stacking order; higher draws on top. Ties broken by insertion order. |
| `capture` | When `true`, the layer claims keyboard focus (focus trap / input capture). |
| `backdrop` | Backdrop mode ([BackdropKind](#backdropkind)). |
| `backdropColor` | Optional color override for the backdrop. |
| `role` | ARIA role ([Role](#role)). |
| `overflow` | `'visible'` (default) or `'hidden'`. |
| `margin` | Inward insets per edge ([OffsetEdges](#offsetedges)). |
| `transition` | Named transition or inline config (see [Animation](../concepts/animation.md)). |
| `onDismiss` | Called when the layer is dismissed (e.g. Escape on a capturing layer). |
| `onBackdropInput` | Called when input lands on the backdrop. |

### `OverlayDescriptor`

The fully-resolved descriptor the overlay store emits per active layer. This is the shape consumed by the internal renderer; it is exported for introspection and testing.

```ts
export type OverlayDescriptor = {
	id: string;
	z: number;
	order: number;
	capture: boolean;
	backdrop: BackdropKind;
	backdropColor?: string;
	role?: Role;
	anchor?: Anchor;
	explicitPosition?: ExplicitPosition;
	content: ReactNode;
	overflow: 'visible' | 'hidden';
	margin?: OffsetEdges;
	transition?: TransitionConfig;
	onDismiss?: () => void;
	onBackdropInput?: () => void;
	exiting?: boolean;
};
```

Note that `transition` is always stored as a resolved [`TransitionConfig`](#transitionconfig) (never a bare `TransitionName`) and that the loose `top`/`left`/`right`/`bottom` from `LayerOpts` are normalized into `explicitPosition`. `order` is the monotonically increasing insertion sequence used as a tie-breaker by [`sortLayers`](#sortlayers); `exiting` marks a layer that is animating out before removal.

### `TransitionName`

The six built-in named transitions. See [Animation](../concepts/animation.md) and [Animations service](../services/animations.md) for visual descriptions.

```ts
export type TransitionName =
	| 'none'
	| 'fade'
	| 'slide-up'
	| 'slide-down'
	| 'slide-left'
	| 'slide-right';
```

### `TransitionStep` and `TransitionConfig`

`TransitionStep` is a single animation frame: a bag of partial Ink `<Box>` style overrides applied for the duration of that frame. Its `style` value is `Record<string, number | string>` — values may be numeric (e.g. `height: 1`) or stringly-tuned CSS-ish values.

```ts
export type TransitionStep = {style: Record<string, number | string>};

export type TransitionConfig = {
	enter?: TransitionStep[];
	exit?: TransitionStep[];
	duration?: number;
};
```

`duration` is the per-frame interval in milliseconds (the whole enter or exit sequence is `frames.length * duration` ms). Both `enter` and `exit` default to a single empty-style frame when omitted.

### `ToastKind`

The four toast severities, mapping 1:1 to the color keys in [`defaultToastColors`](#defaulttoastcolors).

```ts
export type ToastKind = 'success' | 'error' | 'info' | 'warn';
```

### `ToastOptions`

Options accepted by every method on the `toasts` service (see [Imperative API](../services/imperative-api.md)). All fields are optional.

```ts
export type ToastOptions = {
	duration?: number;
	anchor?: Anchor;
	id?: string;
};
```

When `id` is omitted the service generates one via `generateId('toast-')`. On any runtime with `crypto.randomUUID()` (Node ≥ 19, Bun, browsers) the `'toast-'` prefix is **ignored** and the id is a bare RFC-4122 UUID; the prefix only applies to the timestamp+random fallback path. Passing an `id` that already exists replaces the prior toast.

### `CommandPaletteItem`

A single selectable row in the [`CommandPalette`](../components/layers.md) component. `id` and `label` are required; arbitrary extra fields are permitted and are typed `unknown`, so consumers must narrow them before use.

```ts
export type CommandPaletteItem = {
	id: string;
	label: string;
	[key: string]: unknown;
};
```

### `FilterFunction`

A custom filter strategy for [`CommandPalette`](../components/layers.md). Given the full item list and the current query string, it returns the filtered list.

```ts
export type FilterFunction = (
	items: CommandPaletteItem[],
	query: string,
) => CommandPaletteItem[];
```

## Utility Exports

All helpers below are pure (no I/O, no global side effects) unless noted, and are safe to call outside React.

| Export | Signature | Description |
| --- | --- | --- |
| [`anchorToFlexbox`](#anchortoflexbox) | `(anchor: Anchor) => {alignItems; justifyContent}` | Maps an `Anchor` to `alignItems`/`justifyContent` for a `flexDirection='row'` wrapper. |
| [`computeAnchorCoords`](#computeanchorcoords) | `(anchor, viewport, layerSize, margin?) => {top, left}` | Pure coordinate math for anchoring a layer of known size inside a viewport. |
| [`computePopoverPosition`](#computepopoverposition) | `(anchorRect, popoverSize, viewport, placement, opts?) => {top, left, placement}` | Popover positioning with flip + shift collision handling. |
| [`sortLayers`](#sortlayers) | `<T extends {z: number; order: number}>(layers: T[]) => T[]` | Returns a new array sorted ascending by `(z, order)`; non-mutating. |
| [`isBun`](#isbun) | `() => boolean` | `true` when `globalThis.Bun` is defined. |
| [`isNonInteractive`](#isnoninteractive) | `() => boolean` | `true` when stdout is not a TTY or `CI` is set. |
| [`getRuntimeInfo`](#getruntimeinfo) | `() => RuntimeInfo` | Snapshot of `bun`, `interactive`, `rawModeSupported`. |
| [`defaultToastColors`](#defaulttoastcolors) | `Record<ToastKind, string>` | Default color per `ToastKind`. |
| [`resolveTransition`](#resolvetransition) | `(transition) => TransitionConfig \| undefined` | Normalizes a name/config/undefined to a config. |
| [`getTransitionSteps`](#gettransitionsteps) | `(name: TransitionName) => TransitionConfig` | Returns the cached built-in config for a named transition. |

### `anchorToFlexbox`

```ts
export function anchorToFlexbox(
	anchor: Anchor,
): {
	alignItems: 'flex-start' | 'center' | 'flex-end';
	justifyContent: 'flex-start' | 'center' | 'flex-end';
};
```

Maps an `Anchor` to the `alignItems` (vertical cross-axis) and `justifyContent` (horizontal main-axis) values for a `flexDirection='row'` wrapper. For example `'bottom-right'` yields `{alignItems: 'flex-end', justifyContent: 'flex-end'}`. Useful when you need to replicate the host's anchoring in your own flex layout.

### `computeAnchorCoords`

```ts
export function computeAnchorCoords(
	anchor: Anchor,
	viewport: Viewport,
	layerSize: Rect,
	margin?: OffsetEdges,
): {top: number; left: number};
```

Returns the integer `(top, left)` cell coordinates for a layer of size `layerSize` placed against `anchor` inside `viewport`. Margin edges push the layer **inward**: `margin.top`/`margin.left` add to the coordinate, `margin.bottom`/`margin.right` subtract from it — this holds for every anchor (e.g. a `bottom`-anchored layer with `margin.bottom` moves up, away from the bottom edge). Both coordinates are clamped to a minimum of `0`. See [Positioning](../concepts/positioning.md).

### `computePopoverPosition`

```ts
export function computePopoverPosition(
	anchorRect: AnchorRect,
	popoverSize: Rect,
	viewport: Viewport,
	placement: Placement,
	options: {
		offset?: number;
		crossOffset?: number;
		flip?: boolean;
		shift?: boolean;
		collisionPadding?: number | Partial<OffsetEdges>;
	} = {},
): {top: number; left: number; placement: Placement};
```

Computes popover coordinates relative to `anchorRect` (root-relative). Defaults: `offset` 4, `crossOffset` 0, `flip` `true`, `shift` `true`, `collisionPadding` 0. **Flip** mirrors the main-axis placement (`top`↔`bottom`, `left`↔`right`) when the popover would overflow the viewport on the main axis; **shift** clamps both axes inside `[collisionPadding, viewport − size − collisionPadding]`. The returned `placement` reflects any flip that occurred (bare axis for `-center`). When `shift` is disabled the coordinates are still `Math.floor`-rounded but not clamped. See [Positioning](../concepts/positioning.md).

### `sortLayers`

```ts
export function sortLayers<T extends {z: number; order: number}>(layers: T[]): T[];
```

Returns a **new** array (the input is not mutated) sorted ascending by `z`, with ties broken by `order` ascending. The companion comparator `compareLayers` is defined in `src/primitives.ts` but is not re-exported from the public barrel.

### `isBun`

```ts
export function isBun(): boolean;
```

Returns `true` when `globalThis.Bun` is defined. Used to gate the one-time Bun input warning (Bun does not drive `process.stdin.resume()`, so keyboard capture is non-functional — see the runtime doc).

### `isNonInteractive`

```ts
export function isNonInteractive(): boolean;
```

Returns `true` when `process.stdout` is missing `isTTY` **or** when `process.env.CI` is truthy. Mirrors Ink's own interactive detection. The companion `isRawModeSupported()` exists in `src/runtime.ts` (checks `process.stdin.isTTY`) but is not re-exported from the public barrel; use [`getRuntimeInfo`](#getruntimeinfo) for the same signal.

### `getRuntimeInfo`

```ts
export type RuntimeInfo = {
	bun: boolean;
	interactive: boolean;
	rawModeSupported: boolean;
};

export function getRuntimeInfo(): RuntimeInfo;
```

Returns a snapshot bundling `isBun()`, `!isNonInteractive()`, and `isRawModeSupported()`. Safe to call from any context.

> **Note:** `RuntimeInfo` is **not** a named type export from the package barrel — `src/index.tsx` only re-exports `isBun`, `isNonInteractive`, and `getRuntimeInfo` as values. It is shown here as the inferred return type of `getRuntimeInfo()`. If you need to reference the type, derive it via `ReturnType<typeof getRuntimeInfo>`.

### `defaultToastColors`

```ts
export const defaultToastColors: Record<ToastKind, string>;
```

The default color per `ToastKind`:

| `ToastKind` | Color |
| --- | --- |
| `success` | `'green'` |
| `error` | `'red'` |
| `warn` | `'yellow'` |
| `info` | `'blue'` |

These strings are passed straight to Ink's `color` prop, so any value Ink accepts (named color, hex, `rgb()`) is valid when overriding. Used internally by the `Toast` component for both the border and the icon/text color.

### `resolveTransition`

```ts
export function resolveTransition(
	transition: TransitionName | TransitionConfig | undefined,
): TransitionConfig | undefined;
```

Normalizes a transition value: `undefined` → `undefined`; a `TransitionName` string → the result of [`getTransitionSteps`](#gettransitionsteps); a `TransitionConfig` object → returned as-is. This is what `LayerOpts.transition` is run through before being stored on [`OverlayDescriptor`](#overlaydescriptor).

### `getTransitionSteps`

```ts
export function getTransitionSteps(name: TransitionName): TransitionConfig;
```

Returns the built-in enter/exit frame sequence for a named transition. Results are memoized in a module-level `Map<TransitionName, TransitionConfig>` keyed by name, so repeated calls return the same cached object. Each named transition maps to a fixed `TransitionConfig`:

| Name | Effect | `duration` |
| --- | --- | --- |
| `none` | Single empty-style enter/exit frame (no animation). | `0` |
| `fade` | Stepped `height` 0→1 grow on enter, 1→0 collapse on exit. Named "fade" for API compatibility — terminals have no real opacity. | `80` |
| `slide-up` | `marginTop` 4→2→0 on enter, 0→2→4 on exit. | `80` |
| `slide-down` | `marginBottom` 4→2→0 on enter, 0→2→4 on exit. | `80` |
| `slide-left` | `marginLeft` 4→2→0 on enter, 0→2→4 on exit. | `80` |
| `slide-right` | `marginRight` 4→2→0 on enter, 0→2→4 on exit. | `80` |

The fallback `default` case (reachable only if an unknown name bypasses the type system) yields the same config as `none`. See [Animation](../concepts/animation.md) and [Animations service](../services/animations.md) for how these configs are consumed by the `useEnterExit` hook.
