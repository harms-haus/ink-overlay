# Bun Test Results — @harms-haus/ink-overlay

**Date:** 2026-06-24
**Bun version:** 1.3.14
**Vitest version:** 3.2.6

## Summary

| Metric     | Result                          |
| ---------- | ------------------------------- |
| Test files | **28 passed** (28)              |
| Tests      | **270 passed** (270)            |
| Duration   | 15.96s (85.15s total test time) |
| Exit code  | **0**                           |

**All tests pass under Bun.** No hangs, no failures.

## File-by-File Results

| Test File                                  | Tests | Status  | Duration |
| ------------------------------------------ | ----- | ------- | -------- |
| tests/primitives.test.ts                   | 47    | ✅ PASS | 5ms      |
| tests/store.test.ts                        | 16    | ✅ PASS | 5ms      |
| tests/runtime.test.ts                      | 5     | ✅ PASS | 3ms      |
| tests/smoke.test.ts                        | 1     | ✅ PASS | 1ms      |
| tests/exports.test.ts                      | 22    | ✅ PASS | 2ms      |
| tests/toast.test.tsx                       | 19    | ✅ PASS | 108ms    |
| tests/helpers/resizable-stdout.test.tsx    | 7     | ✅ PASS | 529ms    |
| tests/resize.test.tsx                      | 2     | ✅ PASS | 624ms    |
| tests/z-stacking.test.tsx                  | 2     | ✅ PASS | 834ms    |
| tests/non-tty.test.tsx                     | 1     | ✅ PASS | 216ms    |
| tests/nesting.test.tsx                     | 1     | ✅ PASS | 876ms    |
| tests/toast-stacking.test.tsx              | 6     | ✅ PASS | 3814ms   |
| tests/unmount-cleanup.test.tsx             | 3     | ✅ PASS | 1402ms   |
| tests/input-capture.test.tsx               | 2     | ✅ PASS | 2137ms   |
| tests/dismiss.test.tsx                     | 5     | ✅ PASS | 2828ms   |
| tests/modal.test.tsx                       | 8     | ✅ PASS | 2308ms   |
| tests/popover-flip.test.tsx                | 4     | ✅ PASS | 3450ms   |
| tests/host-basic.test.tsx                  | 6     | ✅ PASS | 2292ms   |
| tests/layer-basic.test.tsx                 | 8     | ✅ PASS | 2712ms   |
| tests/animation.test.tsx                   | 21    | ✅ PASS | 2990ms   |
| tests/animation-snapshot.test.tsx          | 5     | ✅ PASS | 3350ms   |
| tests/input-dispatcher.test.tsx            | 14    | ✅ PASS | 3378ms   |
| tests/focus-trap.test.tsx                  | 11    | ✅ PASS | 4479ms   |
| tests/focus-trap-integration.test.tsx      | 2     | ✅ PASS | 2650ms   |
| tests/toast-service.test.tsx               | 19    | ✅ PASS | 9550ms   |
| tests/command-palette.test.tsx             | 14    | ✅ PASS | 13254ms  |
| tests/command-palette-integration.test.tsx | 7     | ✅ PASS | 5962ms   |
| tests/tooltip.test.tsx                     | 12    | ✅ PASS | 15391ms  |

## Notes

- **bun#6862 (process.stdin.resume()) was NOT an issue.** Bun 1.3.14 appears to handle `process.stdin.resume()` correctly in the vitest test environment. All integration tests involving `useInput`, raw-mode, and input capture passed without hanging.
- No timeout guards were needed — all tests completed within expected timeframes.
- Pure unit tests (primitives, store, runtime, exports) run in <10ms.
- Integration tests involving Ink rendering typically take 1–16s each.
