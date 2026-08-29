# General Conventions

Use this when a task touches harness shape, naming, or documentation ownership that
is not specific to runtime, UI, TypeScript, or tests. Root `AGENTS.md` owns general
workflow and context-loading rules.

## Harness Shape

- Keep the harness local-first.
- Prefer explicit typed contracts over ad hoc strings.
- Keep websocket command handling behind a narrow typed bridge.
- Preserve plan-first execution and verification flow.
- Persist workspace, project, thread, and chat history locally unless repo docs explicitly change strategy.

## Naming

- Keep new harness filenames and directories in kebab-case by default.
- Keep generated test, script, and fixture filenames in kebab-case unless an upstream tool requires another shape.
- Keep `data-test-*` hook names in kebab-case.
- Do not rename existing non-kebab-case public API symbols just for style.

## Docs Touch Policy

- Keep shipped behavior in `apps/harness/README.md`, product inventory and evidence
  in `docs/harness/**`, and implementation details beside their owning source or test.
- Add a documentation link only when behavior or ownership materially changes.
- Skill-only changes do not require product README, story, or coverage updates.
