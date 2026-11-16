---
name: improve-ux
description: Implement requested usability or visual improvements to an existing interface, including fixes from a UX audit. Use ui-audit for review-only requests and screenshot for capture alone.
---

# Improve UX

Identify the affected action and what should become easier or clearer. Inspect the
current surface or supplied evidence, and follow the project's design system,
components, and user references. For a small established-pattern fix, nearby code
and existing tests may be enough to choose the change.

For a composition problem, start from user intent, select the project's canonical
surface pattern, fill semantic slots, then validate. Repair information architecture,
hierarchy and interaction before decoration; atomic controls and tokens alone do
not establish composition. Keep a small established-pattern fix small. Do not impose
fixed radii, palettes, card density, shadow styles, or panel consolidation. Ask about
taste only when an unresolved preference changes the outcome materially. Preserve
approved decisions with their scope; passing tests or silence are not taste approval.

Game menus need deliberate action grouping, priority, audience and availability,
with a clear controller/keyboard path and Back/focus return. Internal tools belong
on an explicit specialist surface. Interactive tutorials need observable success,
clear input/timing and an explanation of what to change after a failed attempt.
Complete from real evidence; demonstrations must restore the attempt and never
earn progress. Reuse a composition that enforces these slots instead of adding
another independent text overlay. Keep product visuals separate from shared behavior.

Implement the requested result through its visible interaction. Verify the changed
state in the real interface; use `screenshot` for capture help. Check narrow layouts,
keyboard behavior, long content, or recovery when the change can affect them. Run
the project's relevant checks without turning an isolated fix into a full audit.

Finish with the changed behavior, verification, and material gaps. Preserve new
recurring constraints in the owning project's tests or guidance when evidence
warrants it; do not automatically append findings to a globally installed skill.
