---
name: correctness
description: >
  Scan, fix, verify app correctness bugs with focus on realtime safety, cross-thread state,
  host-sync desync, bridge backpressure, test-breaking side effects, dependency reproducibility,
  and regression coverage. Use when user asks to improve correctness, stabilize behavior, fix
  fundamental bugs, audit for glaring issues, or harden PadPilot against RT/thread/state bugs.
---

# Correctness

Fix correctness first. Style later.

## Start

Run non-mutating scan before edits:

- `bun.cmd run --cwd apps/pad-pilot typecheck`
- targeted failing tests near touched area
- inspect RT hotspots: `apps/pad-pilot/plugin/core/pad-pilot-processor*.cpp`, `apps/pad-pilot/plugin/runtime/*`
- inspect state ownership + bridge batching in `apps/pad-pilot/ui/src`

Read [references/known-findings.md](references/known-findings.md) before deep scan if task smells like repeated bug class.

## Priorities

Severity order:

1. Audio-thread violations: alloc, lock, blocking, JS, cross-thread mutable reads
2. Cross-thread races and lifetime bugs
3. State desync between C++, QuickJS, UI, host-sync
4. Test-breaker side effects at import/init time
5. Dependency/build reproducibility
6. Dead code, naming, comments, cleanup

## PadPilot checks

Always verify:

- `processBlock` reads lock-free, fixed-size, precomputed state only
- no UI or QuickJS access from audio/input native paths
- stale subpayload in host-sync frame cannot drop unrelated fresh state
- bridge hot-path intents coalesce by semantic key, not whole payload
- built-in behavior uses public capability-style APIs when possible
- state serialization remains canonical in processor; UI state is cache

## Fix workflow

For each bug:

1. Reproduce with targeted test or source-contract check.
2. Fix root cause, not branch pile-on.
3. Add one regression or contract test.
4. Re-run narrow tests.
5. Re-run typecheck and wider suite before close.

Prefer source-contract tests for RT invariants that compile/tests may miss.

## Verification

Minimum before close:

- `bun.cmd run --cwd apps/pad-pilot typecheck`
- `bun.cmd run --cwd apps/pad-pilot test:fast`
- `bun.cmd run --cwd apps/pad-pilot test:plugin-native`

If native test too slow, still finish one successful run before closing correctness task. If blocked, state exact blocker.

## Update findings

When fix uncovers stable bug pattern, append it to `references/known-findings.md`.

Preferred path:

- `bun.cmd run ./apps/pad-pilot/scripts/update-correctness-skill.ts --symptom "..." --root-cause "..." --fix-pattern "..." --test "..." --files "a,b,c"`

Rules:

- append only novel patterns
- keep entries short, concrete, reusable
- include regression test and touched files

## Current stabilized patterns

Skill seeded from correctness stabilization work:

- RT routing now uses atomic runtime-module state, not shared strings, in `processBlock`
- host-sync reconcile ignores stale controller-config only, not whole frame
- app devtools side effects moved from import time into lifecycle-gated component
- bridge hot intents coalesce by semantic key and flush before boundary events
