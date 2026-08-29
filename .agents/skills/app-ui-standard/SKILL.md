---
name: app-ui-standard
description: Design, implement, or review Hyperfocus first-party application UI against the repository design system while preserving the framework-neutral engine boundary.
---

# Hyperfocus application UI standard

Read the repository `DESIGN.md` before changing application UI.

Keep the engine, project format, and DOM-free editor command API independent of
Solid, StyleX, browser storage, and app preferences. Put reusable presentation in
`packages/ui`; inject persistence from the host application.

For each affected surface:

- identify the data type and select the presentation described in `DESIGN.md`;
- classify settings as shared-user, app-user, project, or session state;
- declare resize, collapse, persistence, and narrow-screen behavior for every
  persistent pane;
- use shared semantic tokens and primitives;
- include hover, focus, keyboard, disabled, loading, empty, error, recovery, and
  guidance behavior that the task actually needs;
- verify focused tests plus desktop and narrow visual behavior.

Do not copy a harness-local component into another app. Extract the useful
contract, improve any accessibility or lifecycle gaps, and migrate callers to the
shared implementation.
