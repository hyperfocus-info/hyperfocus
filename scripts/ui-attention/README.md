# Presentation checks

`bun run verify:ui --url <managed-app-url> --ready <app-ready-locator> --settings --out .local/ui-review`
checks the actual page, navbar menus, trigger toggling, Escape, and settings at
desktop, intermediate, phone and 200% text sizes. It saves screenshots and a
failing receipt for violations. The CLI never chooses menu commands or writes data.
Use the owning app's fixture/journey to reach populated reports, imports and
dialogs; an empty start screen does not verify those states.
Choose a visible application landmark available only after initialization (for
example Books' `[data-ui-home]`). Failed HTTP responses and missing ready-state
elements fail with a receipt; a blank/error document cannot pass acceptance.

`inspectAttention` in `@hyperfocus/ui/attention` is self-contained for browser
evaluation. Website acceptance also runs it. It checks action priority, names,
cursors, unique navbar actions/copy, input weight, form/upload alignment,
horizontal overflow, clipped/wrapped control text and modal bounds/content. Identity checks are optional in the
CLI (`--branding`) and enabled by default in the function.

The shared controls emit geometry markers. Hosts mark the main navbar
`data-ui-navbar`; `data-ui-action` identifies the same command across differently
worded controls. `aria-controls` connects portaled menu items to their trigger.
DOM hosts tie emphasized button styling to `data-ui-primary`; do not color every
submit button as primary while leaving the inspector with zero marked actions.
Multi-form views choose one primary action and transfer it with the active task.
Do not exempt a failing surface by removing markers or weakening the budget.

Run `bun test scripts/ui-attention` for static rule cases and
`bun scripts/ui-attention/rendered-regressions.ts` for the real-browser inspector
regressions. The latter deliberately renders bad geometry to prove detection;
it is not application acceptance. The same command builds real shared icon
buttons and SettingsWorkspace, checks token-sized targets, pointer hit ownership
and click effects at desktop/tablet/phone/200% text, and retains a shrinking legacy
wrapper as a failing negative control. Text wrapping and tooltip dismissal remain
covered. Both use the existing hidden browser owner.
`bun scripts/ui-attention/startup-regressions.ts` proves failed HTTP and blank
documents cannot receive a passing acceptance report.

The lint rule rejects explicit duplicate navbar action IDs, secondary navbar copy,
settings dialogs, bold inline input values and existing attention violations.
Dynamic conditions, CSS inheritance and ordering need rendered checks. Keyboard
shortcut invocation, nested Escape, data preservation and subjective composition
still require the app's real journey.

`hyperfocus/ui-foundation` rejects literal operational text below 12px/0.75rem
(including font shorthand) and literal foregrounds paired with adaptive
accent/status surfaces. It is enforced in shared primitives/forms/preferences/
task review, PadPilot generic elements, and the repaired Harness Button/chat
family. This explicit rollout boundary preserves legacy work while preventing
regressions in repaired owners; expand it after verifying each remaining owner.
Tests and spatial artwork are not substitutes for a control-text exemption.
Any necessary local lint suppression must name the concrete spatial purpose.
Computed/cascaded colors, relative `em` sizes and arbitrary CSS expressions still
need real-host verification; lint does not prove contrast or accessibility.
Ordinary StyleX state maps are compared by state with default inheritance;
intersections between different selectors or media queries still need rendered checks.

Shared interaction tests cover additive description IDs and tooltip hover/focus/
Escape lifetime. Host adapter tests must include two visibly primary buttons as
a failing fixture and an active modal that excludes background actions. Keep
negative fixtures: they prove the validator sees the behavior it claims to check.
