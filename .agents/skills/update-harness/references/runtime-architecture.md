# Runtime And Architecture

Use this when touching backend runtime, websocket protocol, provider structured output, run lifecycle, subagents, worktrees, BranchFS, or server completion.

## Runtime Shape

- Runtime turn budgets are typed run contracts.
- Budgeted model turns reserve before prompts, persist current usage, and hard-fail
  with a categorized exhaustion state. Verify the affected protocol, persistence,
  orchestration, concurrency, or server lifecycle boundary when changing it.
- Run finalization belongs to the active execution owner; legacy client `run.complete` requests receive a typed rejection.
- Final assistant text and terminal state commit atomically. Resolving input or receiving partial provider text is not task completion.
- Server completion paths should share the same helper, persist the final assistant message, clear streaming and abort state, emit `run.updated`, then emit `chat.complete`.
- Overlapping or unknown subagent ownership must upgrade same-worktree plans to isolated BranchFS worktrees before execution.
- Trace BranchFS isolation upgrades and keep BranchFS flush behind explicit promote/flush flow.

## Boundaries And Validation

- Never execute raw shell commands from websocket input.
- Keep command handling behind a narrow, typed bridge.
- Fail fast on invalid input, malformed payloads, and unexpected message types.
- Validate unknown payloads with zod at boundaries.
- Treat all LLM/provider JSON as hostile boundary input.
- Never rely on prompt-only enum compliance for provider-generated structured payloads.

## Structured LLM Output

- For LLM-generated structured payloads, keep exact zod schemas and add deterministic alias normalization only for known-safe synonyms before parsing.
- For recoverable LLM schema failures, make one bounded repair attempt before failing a user-visible run.
- Do not widen domain types to accept invalid model vocabulary.

## Runtime Defaults

- Preserve multi-provider support; provider-specific assumptions belong in adapters.
- Debug-only instrumentation uses `process.env.NODE_ENV !== "production"` rather
  than a separate `HARNESS_DEBUG` toggle. This condition never authorizes destructive
  recovery: unset/unknown environments also satisfy it. Repair needs an explicit
  capability or launch mode.

## Subagents And Worktrees

- Runtime subagent contracts need explicit owned paths. Overlapping or unknown
  ownership uses isolated BranchFS worktrees and records the isolation upgrade.
  Promotion follows the explicit flush contract. These are Harness runtime rules;
  they do not require contributor delegation for ordinary edits.
