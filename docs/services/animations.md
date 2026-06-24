# Transitions & Animations — Implementation Guide

This page is the practical, usage-oriented companion to the [concepts › animation](../concepts/animation.md) reference. That page explains _why_ transitions are frame-stepped style mutations rather than continuous interpolations (terminals have no alpha channel and no sub-cell rendering); this page shows how to actually apply them — built-in named transitions, hand-authored `TransitionConfig` objects, the `'fade'` caveat, and the two exported resolution helpers. Every signature, default, and frame value below is taken directly from `src/animation.tsx` and `src/layer.tsx`. For the component that owns the `transition` prop, see [`<Layer>`](../components/layers.md).

## Built-in named transitions

The `transition` prop is currently accepted only by [`<Layer>`](../components/layers.md); none of the higher-level components (`<Modal>`, `<Popover>`, `<Tooltip>`, `<Toast>`, `<CommandPalette>`) expose it. When passed to `<Layer>`, it accepts a `TransitionName` string. Six names are predefined; `getTransitionSteps` (covered below) resolves each to a cached, deterministic `TransitionConfig`. All four slide variants step through three frames at 80 ms each (≈240 ms total); `fade` carries two frames at 80 ms; `none` is a single no-op frame with zero duration (instantaneous).

| Name            | Enter frames                  | Exit frames               | `duration` |
| --------------- | ----------------------------- | ------------------------- | ---------- |
| `'none'`        | `{style: {}}`                 | `{style: {}}`             | `0`        |
| `'fade'`        | `height: 0` → `height: 1`     | `height: 1` → `height: 0` | `80`       |
| `'slide-up'`    | `marginTop: 4` → `2` → `0`    | `0` → `2` → `4`           | `80`       |
| `'slide-down'`  | `marginBottom: 4` → `2` → `0` | `0` → `2` → `4`           | `80`       |
| `'slide-left'`  | `marginLeft: 4` → `2` → `0`   | `0` → `2` → `4`           | `80`       |
| `'slide-right'` | `marginRight: 4` → `2` → `0`  | `0` → `2` → `4`           | `80`       |

A named transition on a `<Layer>`:

```tsx
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {OverlayHost, Layer} from '@harms-haus/ink-overlay';

function App() {
	const [open, setOpen] = useState(false);

	return (
		<OverlayHost>
			<Box padding={1}>
				<Text>Press o to toggle</Text>
			</Box>

			<Layer
				open={open}
				onOpenChange={setOpen}
				anchor="bottom"
				transition="slide-up"
			>
				<Box paddingX={1}>
					<Text>Slides up from the bottom edge</Text>
				</Box>
			</Layer>
		</OverlayHost>
	);
}
```

When `transition` is omitted, `<Layer>` resolves to `undefined` and `<LayerRenderer>` falls back to the internal `IDENTITY_TRANSITION` constant (defined in `src/layer.tsx`): a single empty-style frame for enter and exit with `duration: 0`, which is effectively `'none'`.

## Custom `TransitionConfig`

A transition is just a plain object — no registration needed. The `TransitionConfig` type (from `src/types.ts`) is:

```ts
type TransitionStep = {style: Record<string, number | string>};
type TransitionConfig = {
	enter?: TransitionStep[];
	exit?: TransitionStep[];
	duration?: number; // ms per frame
};
```

Each frame's `style` is a partial Box-style override. The `LayerRenderer` shallow-merges the active frame's style onto the content `<Box>` via `mergeTransitionStyle` (frame values win), so any Ink Box property — `marginTop`, `marginLeft`, `height`, `width`, `padding`, etc. — is fair game.

> **Exit needs more than one frame to animate.** When `<Layer>` closes, it checks `resolvedTransition?.exit && resolvedTransition.exit.length > 1`. If `exit` has at most one frame, the layer is unregistered immediately with no exit animation. The same `≤1` check drives the `canSkip` fast-path inside `useEnterExit`, which jumps straight to the `visible`/`exited` stage without starting an interval. Always author at least two exit frames if you want the close to be visible.

A custom slide using `marginTop` steps:

```tsx
// import {Box, Text} from 'ink';
// const [show, setShow] = useState(false);
import {Layer} from '@harms-haus/ink-overlay';
import type {TransitionConfig} from '@harms-haus/ink-overlay';

const customSlide: TransitionConfig = {
	enter: [
		{style: {marginTop: 6}},
		{style: {marginTop: 3}},
		{style: {marginTop: 0}},
	],
	exit: [
		{style: {marginTop: 0}},
		{style: {marginTop: 3}},
		{style: {marginTop: 6}},
	],
	duration: 60, // 60 ms per frame → ~180 ms total enter
};

<Layer
	open={show}
	onOpenChange={setShow}
	anchor="center"
	transition={customSlide}
>
	<Box padding={1}>
		<Text>Custom three-step slide</Text>
	</Box>
</Layer>;
```

A custom fade-like effect built from margin steps (since there is no true opacity, stepping a margin toward zero mimics a gentle close):

```tsx
// Assumes `TransitionConfig` is in scope (see imports above)
// and `show`/`setShow` are declared: const [show, setShow] = useState(false)
const gentleClose: TransitionConfig = {
	enter: [
		{style: {marginLeft: 10}},
		{style: {marginLeft: 4}},
		{style: {marginLeft: 1}},
		{style: {marginLeft: 0}},
	],
	exit: [
		{style: {marginLeft: 0}},
		{style: {marginLeft: 4}},
		{style: {marginLeft: 10}},
	],
	duration: 50,
};
```

You can mix and match: a custom `enter` that slides in from the left and an `exit` that collapses — the `transition` prop slot accepts either a name string or a full `TransitionConfig` object.

## The `'fade'` caveat

Terminals have no alpha channel, so a true cross-fade is impossible. The `'fade'` name is retained for API compatibility, but the implementation in `getTransitionSteps` is honest about what it does: enter sets `height` from `0` to `1`, exit reverses it. The visual effect is a quick collapse/expand to a single row — **not** an opacity fade. (A previous version tried `dim`/`dimColor`, but those are `<Text>` props that Ink silently ignores on a `<Box>`, so there was no visible dimming at all.)

For a more visible entrance, prefer `'slide-up'` or `'slide-down'`. See [concepts › animation](../concepts/animation.md) for the full rationale behind the terminal rendering constraints that make this model necessary.

## Resolution helpers

Two functions exported from the package barrel bridge user-facing transition specs and concrete configs.

### `getTransitionSteps(name)`

```ts
function getTransitionSteps(name: TransitionName): TransitionConfig;
```

The lowest-level building block. Returns — and caches in a module-level `Map` — the predefined frame sequence for one of the six built-in names. Because configs are deterministic, the first call computes and stores the config; subsequent calls with the same name return the cached object. This is what `resolveTransition` delegates to internally. Use it when you need the raw config for a known built-in — for example, to clone it and tweak a few frames before passing the result to a `<Layer>`.

```tsx
// import {Box, Text} from 'ink';
// const [show, setShow] = useState(false);
import {getTransitionSteps, Layer} from '@harms-haus/ink-overlay';

// Clone the built-in slide-up and slow it down
const slowSlideUp = {
	...getTransitionSteps('slide-up'),
	duration: 200,
};

<Layer
	open={show}
	onOpenChange={setShow}
	anchor="bottom"
	transition={slowSlideUp}
>
	<Box padding={1}>
		<Text>Slow slide-up</Text>
	</Box>
</Layer>;
```

### `resolveTransition(spec)`

```ts
function resolveTransition(
	transition: TransitionName | TransitionConfig | undefined,
): TransitionConfig | undefined;
```

The general-purpose resolver — the same function `<Layer>` calls internally (inside a `useMemo` keyed on the `transition` prop) to normalize the prop into a concrete config. Its three branches:

- `undefined` → `undefined`
- a string name → delegates to `getTransitionSteps(name)`
- a raw `TransitionConfig` object → returned as-is

Use it when you want to pre-resolve a transition spec programmatically before deciding whether to render a `<Layer>` at all, or when building a wrapper component that forwards a flexible `transition` prop.

```tsx
import {resolveTransition, Layer} from '@harms-haus/ink-overlay';
import type {TransitionName, TransitionConfig} from '@harms-haus/ink-overlay';

function MyPanel({
	transition,
}: {
	transition?: TransitionName | TransitionConfig;
}) {
	// Resolve once outside JSX to inspect/branch on the concrete config
	const resolved = resolveTransition(transition);
	const hasExit = (resolved?.exit?.length ?? 0) > 1;

	return (
		<Layer transition={transition} anchor="center">
			{/* hasExit tells you whether close will animate */}
		</Layer>
	);
}
```

## See also

- [Concepts › Animation](../concepts/animation.md) — the frame-stepped transition model, `useEnterExit` state machine, and why the layer stays mounted during exit.
- [`<Layer>`](../components/layers.md) — the component that owns the `transition` prop and feeds resolved configs to the host.
- [Concepts › Limitations](../concepts/limitations.md) — terminal rendering constraints behind the no-alpha, no-sub-cell model.
