---
name: next-todo
description: >
  Execute the next high-priority item from docs/harness/todo.md end-to-end. Use when the user says
  "implement next todo", "work next item", "pick next roadmap item", or asks for product-minded
  implementation plus research, grilling, docs cleanup, and todo removal.
---

Implement the next `docs/harness/todo.md` item end-to-end. Optimize for PMF, not checkbox parity.

## Default Stack

Use `update-harness` for harness code, protocol, UI, tests, and docs.

## Workflow

1. Read `docs/harness/todo.md`, `apps/harness/README.md`, and repository instructions first.
2. Unless user overrides, pick highest remaining todo item.
3. If item changes product shape, do official-source research first:
   - competitor docs
   - official repos/docs
   - issue trackers for pain signals
4. Summarize PMF pain points before coding:
   - setup friction
   - unclear capability limits
   - frozen or unrecoverable sessions
   - context drift / missing persistent instructions
   - opaque background work
5. Ask one focused question at a time for unresolved boundary choices.
   - Ask only what codebase research cannot answer.
   - Include recommended answer.
   - If user does not answer quickly, proceed with explicit assumption.
6. Implement smallest slice that is end-to-end useful now.
   - Prefer real utility over fake surface parity.
   - Capability-gate unsupported paths.
   - Degrade explicitly, never silently.
   - Keep local-first and typed-contract shape intact.
7. Add or update tests for protocol, persistence, server/runtime, and UI logic touched by the change.
8. Run focused checks, then `bun.cmd run typecheck:harness` and
   `bun.cmd run test:harness` when the item changes core harness behavior.
9. Update docs:
   - remove the completed item from `docs/harness/todo.md`
   - if scope remains, replace it with narrower follow-up items
   - update `apps/harness/README.md` at a high level when shipped behavior changed
10. In final response, include:
   - what shipped
   - PMF/pain-point read
   - assumptions from grilling
   - verification status
   - residual risks

## Heuristics

- Features win PMF when they improve first 5 minutes, not when they look broad on a checklist.
- Favor inspectable state, resumability, and explicit reasons for disabled actions.
- If transport/storage works but agent cannot truly use the data, do not claim feature complete.
- For multimodal or external-tool features, wire real model/tool consumption before polishing UI.
- When roadmap item is too broad, ship the highest-signal slice and rewrite remainder as smaller follow-up todos.
