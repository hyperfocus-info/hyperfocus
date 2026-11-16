---
name: app-ui-standard
description: Implement or review Hyperfocus first-party application UI using the repository design system. Use for a concrete UI change; repeated design-debt batches use design-system-evolution.
---

# Application UI

For missing or changed app identity, use
[generate-app-logo](../generate-app-logo/SKILL.md). The same source supplies header,
favicon, app icons and social metadata; expose project preferences rather than
hard-coding a generated favicon or Open Graph tags in a build output.

Read [DESIGN.md](../../../DESIGN.md), then search the
[visual system](../../../docs/design-system/README.md) and existing `packages/ui`
controls for the affected interaction. For generated-product or AI design-context
routing, read the [agent workflow](../../../docs/design-system/agent-workflow.md).

For game menus, use the [game composition owner](../../../docs/design-system/game-menus.md):
intent, menu type, canonical composition, semantic content, then validation.
For interactive learning, use the [tutorial contract](../../../docs/design-system/tutorials.md):
observable steps, real input/timing, automatic completion, reversible examples and
actionable corrections. Start with these compositions before arranging primitives.

Use approved examples and saved owner decisions to resolve appearance. Ask only
about a missing subjective choice that materially changes the result; carry
routine implementation through validation. Preserve approved reusable decisions
with their owning pattern or reference, including their scope and evidence.
Explicit user designs and stacks take precedence in generated projects.

Keep engine/project/DOM-free command contracts independent of Solid, StyleX,
browser storage, and app preferences. Reusable presentation belongs in
`packages/ui`; host apps own persistence and privileged adapters.

Select state scope and pane resize/collapse behavior from the existing contract.
Verify the affected interaction, required states, responsive layout, and keyboard
behavior with proportionate evidence. Token imports alone do not prove computed
styles. Put generic resets in the reset layer.

For navigation, settings, forms and overlays, use the
[shared composition contract](../../../docs/design-system/navigation-settings.md)
and [rendered checks](../../../scripts/ui-attention/README.md). Exercise the
populated task, menus, settings shortcut and nested Escape; an empty page is not
evidence for those states.

Follow the user's action through host state, mutation, visible result and supported
undo/recovery. Popup behavior or an enabled button does not establish that journey.

When multiple real consumers need a Harness-local control, improve its existing
contract and migrate them to the shared owner; do not copy it between apps.
