# Hooks & `<FocusTrap>`

`ink-overlay` exposes four low-level primitives underneath its declarative
components: the **`<FocusTrap>`** wrapper, its backing **`useFocusTrap`** hook,
the **`useRegisterInput`** hook for the LIFO input-dispatcher stack, and the
**`useInputCaptureState`** gating hook that cooperative background components
must use. For the mechanism behind the stack and `captureDepth`, see
[Input & Focus](../concepts/input-and-focus.md); for why cooperation cannot be
enforced, see [Limitations](../concepts/limitations.md).

> **Read this before wiring up background components:** every `useInput` /
> `useFocus` that lives *outside* a capturing overlay **MUST** be gated with
> `useInputCaptureState()` — otherwise those handlers keep firing while a modal,
> palette, or other capturing layer is open.

---

## `<FocusTrap>`

Declarative wrapper around [`useFocusTrap`](#usefocustrap). While `active`, it
confines Tab / Shift+Tab focus cycling to its children and signals capture
(cooperatively, via `captureDepth`) so background components deactivate.

| Prop           | Type         | Default | Description                                                          |
| -------------- | ------------ | ------- | -------------------------------------------------------------------- |
| `active`       | `boolean`    | `true`  | Whether the trap is engaged.                                         |
| `onEscape`     | `() => void` | —       | Called when Escape is pressed inside the trap.                       |
| `restoreFocus` | `boolean`    | `true`  | Restore focus to the previously-focused element on deactivation.     |
| `children`     | `ReactNode`  | —       | Content whose focus should be confined.                              |

The body renders `children` unchanged inside a fragment; all behavior delegates
to `useFocusTrap(active, {onEscape, restoreFocus})`.

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {FocusTrap} from '@harms-haus/ink-overlay';

function Menu() {
  const [open, setOpen] = useState(false);
  useInput((_input, key) => {
    if (key.return) setOpen(true);
  });
  return (
    <Box flexDirection="column">
      <Text>Press Enter to open the menu</Text>

      {open && (
        <FocusTrap active onEscape={() => setOpen(false)} restoreFocus>
          <Box flexDirection="column" borderStyle="round" padding={1}>
            <Text>Tab cycles between these items</Text>
            <Text>Esc to close</Text>
          </Box>
        </FocusTrap>
      )}
    </Box>
  );
}
```

---

## `useFocusTrap`

```ts
function useFocusTrap(
  active: boolean,
  options?: {onEscape?: () => void; restoreFocus?: boolean},
): {trapId: string; isTrapped: boolean};
```

| Parameter           | Type         | Default | Description                                     |
| ------------------- | ------------ | ------- | ----------------------------------------------- |
| `active`            | `boolean`    | —       | Engages/disengages the trap.                    |
| `options.onEscape`  | `() => void` | —       | Escape handler invoked while trapped.           |
| `options.restoreFocus` | `boolean` | `true`  | Return focus to the previously-focused element. |

| Return field | Type      | Description                                    |
| ------------ | --------- | ---------------------------------------------- |
| `trapId`     | `string`  | Stable unique id (from `useId`) for this trap. |
| `isTrapped`  | `boolean` | Mirrors `active`.                              |

When `active` transitions to `true`, the hook:

1. Snapshots the current `focusManager.activeId` so focus can be restored later.
2. Increments a per-`FocusManager` depth counter; only the **first** active trap
   (0 → 1) calls `focusManager.disableFocus()`, disabling Ink's global Tab
   navigation. The ref-counting prevents an inner trap's deactivation from
   re-enabling Tab nav while an outer trap is still confining.
3. Registers an input handler via `useRegisterInput` that intercepts Tab /
   Shift+Tab (forwarding to `focusManager.focusNext()` / `focusPrevious()`) and
   Escape (invoking `onEscape`). Tab cycling only visits focusables with
   `isActive: true`, so gated background components are skipped.
4. Increments `captureDepth` (`captureEnter` / `captureExit`) so cooperative
   background components see `isCaptured = true` and deactivate their own
   `useInput` / `useFocus`.

On deactivation the counter is decremented; only the **last** active trap
(1 → 0) calls `focusManager.enableFocus()` and, if `restoreFocus` is `true`,
restores focus to the snapshotted id.

```tsx
import {Box, Text} from 'ink';
import {useFocusTrap} from '@harms-haus/ink-overlay';

function CustomRegion({open, onClose}: {open: boolean; onClose: () => void}) {
  const {trapId, isTrapped} = useFocusTrap(open, {
    onEscape: onClose,
    restoreFocus: true,
  });

  return (
    <Box>
      <Text>trap {trapId} active={String(isTrapped)}</Text>
    </Box>
  );
}
```

---

## `useRegisterInput`

Registers a handler on the LIFO input-dispatcher stack owned by
`<InputDispatcher>` (mounted inside `<OverlayHost>`). On each keypress the stack
is walked top-down (most-recently-registered first). Returning `true` consumes
the event and stops the walk; returning `false` or `void` lets lower handlers see
it. `handler` identity is stabilised via `useEffectEvent`, so passing a fresh
inline closure on each render does **not** churn the stack.

```ts
function useRegisterInput(
  id: string,
  handler: (input: string, key: Key) => boolean | void,
  isActive?: boolean, // default true
): void;
```

| Parameter  | Type                                           | Default | Description                                                                  |
| ---------- | ---------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `id`       | `string`                                       | —       | Stable unique id. Re-registering with the same id replaces the prior entry. |
| `handler`  | `(input: string, key: Key) => boolean \| void` | —       | Handler invoked when this entry is reached during the walk.                  |
| `isActive` | `boolean`                                      | `true`  | When `false`, the handler is not registered.                                 |

The `Key` type comes from `ink`; import it directly via `import {type Key} from 'ink'`.

```tsx
import {useRegisterInput} from '@harms-haus/ink-overlay';

function HotkeyRow({onConfirm}: {onConfirm: () => void}) {
  useRegisterInput('hotkey-row', (input, key) => {
    if (key.return) {
      onConfirm();
      return true; // consume — stop the walk
    }
    return false; // pass through to lower handlers
  });

  return null;
}
```

See [Input & Focus](../concepts/input-and-focus.md) for how the walk relates to
`captureDepth` and `useInputCaptureState`.

---

## `useInputCaptureState`

```ts
function useInputCaptureState(): boolean;
```

Returns `true` while `captureDepth > 0` (i.e. at least one capturing overlay or
focus trap is active). This is the cooperative-gating hook that **every**
background component using `useInput` or `useFocus` must read.

Ink fires **all** active `useInput` hooks on **every** keypress via one shared
`EventEmitter`; there is no consumed-flag, propagation stop, or priority. The
framework cannot block an uncooperative handler — it can only signal that capture
is in effect. Gate both `useInput` and `useFocus` on the negation of
`isCaptured`:

```tsx
import {useInput, useFocus} from 'ink';
import {useInputCaptureState} from '@harms-haus/ink-overlay';

function BackgroundList() {
  const isCaptured = useInputCaptureState();

  // Keyboard shortcuts stay silent while a modal / palette is open.
  useInput(
    (input, key) => {
      if (input === 'j') {/* move down */}
      if (input === 'k') {/* move up */}
    },
    {isActive: !isCaptured},
  );

  // Focus cycling deactivates so the active trap's focusNext/focusPrevious
  // skip this component entirely.
  const {isFocused} = useFocus({isActive: !isCaptured});

  return null;
}
```

Any background component that skips this gating will keep reacting to keys while
a capturing overlay is open. This is a documented limitation of Ink's
architecture, not a bug — see [Limitations](../concepts/limitations.md). The
framework's own `<Tooltip>` honors this pattern: its key-trigger handler is
gated behind `useInputCaptureState()`.
