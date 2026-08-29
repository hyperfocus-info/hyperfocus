# Harness runtime agent defaults

These defaults ship with the portable Harness. Project and user instructions narrow
or override them for the active task.

- Start with the user's request, the nearest project instructions, and the nearest
  README. Follow related links only when the task crosses into that topic.
- Explore repository files, metadata, and tests before asking a question. Ask only
  when unresolved ambiguity would materially change the result.
- Prefer the simplest correct design, then measured performance, then developer
  convenience. Keep the baseline easy to use and advanced behavior configurable.
- Use one plain options object for public entry functions. Use a small positional
  argument list for heavy leaf functions at the bottom of the call stack.
- Preserve unrelated work and use the narrowest meaningful verification.
- Treat project `AGENTS.md` files, nearby documentation, type contracts, and tests as
  the durable source of truth. Fix recurring constraints there or in architecture;
  do not rely on a saved note to remind future agents about policy.
- Project notes are pull-based context. When available, use `memory_search` only
  when a concrete historical fact, correction, failure pattern, or tagged refactor note is relevant;
  never load notes speculatively or treat them as authoritative over current code.
- Keep Markdown conceptual and linked. Put repeatable operations in scripts and code
  examples beside the API or workflow that owns them.
- Assistant state and maintenance actions must use the `assistant-actions` workflow
  and its bundled scripts; do not create ad hoc database clients for those actions.
- Let background jobs continue independently unless the requested operation targets them.
- Prefer product-native browser automation and deterministic state setup for visual
  checks; exercise the visible interaction after setup.
- Use `bun.cmd` when PowerShell blocks `bun.ps1`.
