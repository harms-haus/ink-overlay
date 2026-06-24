# Input and Focus

Ink's input pipeline is fundamentally flat: every active useInput hook fires on every
keypress, with no built-in way to prioritize, consume, or stop propagation. This document
explains why that architecture makes overlays difficult, how this framework builds a LIFO
consumed-handler stack and a cooperative capture-depth signal on top of it, and how focus
trapping layers on top of both.

## Ink's Flat Input Model

Inside Ink's App component there is a single EventEmitter. When a keypress arrives, App
emits one 'input' event. Every active useInput hook has registered a listener on that same
EventEmitter. There is no consumed boolean, no propagation-stop, and no priority ordering.
All active listeners fire, unconditionally, on every keypress.

This is the core problem. If a modal is open and you want Escape to dismiss it rather
than navigate a background list, you cannot stop the background handler. Both the modal's
useInput and the list's useInput receive the event and both run — no stopPropagation, no
return value Ink checks, no API to unregister another component's listener. The framework
cannot prevent an uncooperative standalone useInput from firing — see [Limitations](./limitations.md)
and [Hooks](../services/hooks.md).

## Why the Framework Needs Its Own Input Model

To provide ordered, consumable input routing for overlay-internal components, the
InputDispatcher maintains a LIFO (last-in, first-out) handler stack. It owns exactly one
useInput hook — whose isActive is gated by isRawModeSupported so it is a safe no-op in
non-TTY environments — and on every keypress it walks that stack.

The walk proceeds from the top of the stack (most recently registered) down to the
bottom. Each handler receives the input string and key descriptor and returns true to
consume the event or false/void to pass it through. When a handler returns true, the walk
stops and no lower-priority handler sees the event. If a handler throws, the error is
logged with the handler's id and the walk continues so unconsumed input still reaches
handlers below. This matters: a buggy handler in one overlay should not silently swallow
events that other overlays need.

Handlers are registered/unregistered through registerInput and unregisterInput on
InputDispatcherContext. Registration deduplicates by a string id — if an entry with that
id exists, it is removed before the new one is pushed, so re-registering never produces
duplicates. The stack lives in a ref, not state, so mutations do not trigger re-renders.
The dispatch walk is created via useEffectEvent so it always reads the latest stack without
re-subscribing to Ink's EventEmitter.

Each capturing LayerRenderer registers its handler via useRegisterInput, which stabilizes
the handler identity with useEffectEvent so changing it does not churn the stack. It
accepts isActive (default true); when false, the handler is not registered. The handler
enters on mount or when isActive flips true, and leaves on cleanup or when isActive flips
false.

## The LIFO Stack in Action

The diagram below shows the dispatch walk when a CommandPalette (opened last, at the top
of the stack) receives a keypress and consumes it. The Modal and Tooltip handlers below it
never see the event.

    keypress arrives
           │
           ▼
    ┌──────────────────────────┐
    │     InputDispatcher       │
    │   (single useInput)       │
    └────────────┬─────────────┘
                 │  walk: TOP → BOTTOM
                 ▼
    ┌──────────────────────────┐
    │    LIFO Handler Stack     │
    │                           │
    │  [2] CommandPalette  ◄─── │ tried first
    │       returns true        │ CONSUMED → walk stops
    │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
    │  [1] Modal (dialog)       │ never reached
    │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
    │  [0] Tooltip trigger      │ never reached
    └──────────────────────────┘

If the CommandPalette handler had returned false or void, the walk would continue to the
Modal handler, then to the Tooltip handler if the Modal also passed it through. This LIFO
ordering mirrors real-world expectations: the most recently opened overlay gets first claim
on input.

## The captureDepth Counter and the Cooperative Contract

The LIFO stack handles routing among overlay-internal handlers, but it cannot prevent an
uncooperative background useInput from firing independently. To solve this, the
InputDispatcher also maintains a captureDepth counter — and unlike the handler stack, this
one is stored as state so changes trigger re-renders and propagate to consumers.

When a capturing layer or active focus trap mounts, it calls captureEnter, which
increments captureDepth. On unmount it calls captureExit, which decrements, floored at
zero so an unbalanced exit never produces a negative depth. The boolean isCaptured is
simply captureDepth greater than zero. Background components read this through
useInputCaptureState and gate their useInput/useFocus with isActive set to !isCaptured.

This is the cooperative contract: the framework provides the isCaptured signal, and every
background component must opt in by checking it. When a modal opens, captureDepth goes to
one, isCaptured becomes true, and cooperative background components' useInput/useFocus go
inactive. When it closes, they reactivate. The contract is voluntary — an uncooperative
component that ignores isCaptured still receives all keypresses through its own standalone
useInput, because that listener is not on the LIFO stack but a separate subscription to
Ink's EventEmitter. See [Limitations](./limitations.md) for the full discussion.

## Focus Trapping

Ink's focus system is global: focusNext and focusPrevious cycle through all active
focusables in the entire tree, with no scoped focus region. Pressing Tab in a modal with
three buttons would cycle through every active focusable in the app, not just those
buttons. The useFocusTrap hook and its FocusTrap wrapper build scoped focus on three
mechanisms.

First, the trap calls focusManager.disableFocus(), which suspends the framework's built-in
Tab handling so it can no longer cycle focus outside the trapped region.

Second, the trap registers its own handler on the LIFO stack via useRegisterInput. That
handler intercepts Tab (calls focusManager.focusNext), Shift+Tab (calls
focusManager.focusPrevious), and Escape (calls onEscape), returning true for each to
consume the event. Because focus cycling still operates on Ink's internal focusable list,
correct scoping depends on background components having deactivated their useFocus when
isCaptured is true, so those focusables are skipped. The trap does not enumerate the
focusable list directly; it relies on the cooperative contract to make background
focusables invisible to the cycle.

Third, the trap increments captureDepth while active, feeding the cooperative signal.
On deactivation it restores global focus navigation via enableFocus and by default returns
focus to the previously-focused element (restoreFocus defaults to true). The snapshot of
that element's id is taken at activation time, before disableFocus.

### Nested Traps and Ref-Counted Focus Disable

Ink's disableFocus and enableFocus are not ref-counted — they set a single boolean flag on
the FocusManager. If two nested traps are active and the inner one calls enableFocus on
deactivation, the outer trap loses its confinement prematurely. To prevent this, the hook
maintains a module-level WeakMap named focusTrapDepths, keyed by the FocusManager instance,
tracking how many traps are currently engaged on each manager.

Only the first trap to activate on a given FocusManager (depth 0→1) calls disableFocus.
Only the last to deactivate (depth 1→0) calls enableFocus and performs focus restoration.
Intermediate activations and deactivations adjust the counter without touching the
flag. The WeakMap is keyed per FocusManager (not a single integer) because each Ink App
root creates its own FocusManager singleton, keeping counters isolated across independent
render roots such as tests.

## Raw Mode Is Ref-Counted

Terminal raw mode is what allows Ink to receive individual keypresses instead of
line-buffered input. Ink internally tracks rawModeEnabledCount: each useInput hook
increments it on mount and decrements on unmount. The actual setRawMode call on stdin
happens only on zero-to-one and one-to-zero transitions, preventing flicker when many hooks
mount or unmount in the same render cycle.

The OverlayHost mirrors this ref-counted approach. During each render it computes
capturingCount — the number of sorted layers with capture set to true that are not exiting.
A previousCapturingCount ref tracks the last committed value. When capturingCount
transitions from zero to positive, the host calls setRawMode(true), guarded by
isRawModeSupported and wrapped in try/catch. When it transitions back to zero, it calls
setRawMode(false). Raw mode is enabled the moment the first capturing layer appears and
disabled the moment the last one disappears.

The host applies the same ref-counted transition to focus: disableFocus on the first
capturing layer, enableFocus on the last to leave. On unmount, a cleanup effect reads
previousCapturingCount inside the cleanup function to check whether capturing was still
active, and if so restores raw mode and re-enables focus.

## Non-TTY Behavior

When isRawModeSupported is false (SSR, CI, piped output), the InputDispatcher's own
useInput is created with isActive false — no setRawMode call, no error thrown. Capture is
a no-op for input: layers still render their backdrops and content but no keypresses are
trapped or dispatched. Overlays appear in their final state but do not respond to keyboard
input, consistent with Ink's own non-interactive mode.
