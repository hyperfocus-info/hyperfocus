# PadPilot AI settings: third real surface

2026-09-19. Candidate reference, not an approved visual baseline.

## Task and hierarchy

The task is to configure how PadPilot proposes changes, understand whose defaults
apply, and recover when the runtime or provider is unavailable. The former drawer
nested three settings panels, gave four selectors equal weight, rendered status
as an inert button, and always showed a credential form even for CLI accounts.

The drawer now leads with **AI assistant**, persistent inheritance scope, and
**Provider / Model**. **Advanced options** discloses Runtime and Reasoning.
Provider access follows, with an explicit Save API key action only for direct
providers. Existing credentials can be replaced through a disclosure. Controllers
remain a separate final task. Rules and spacing use existing shared tokens,
Button, FormField/Input, SelectControl, and typography; no settings framework or
new token family was extracted.

Changing a selection creates a PadPilot override; **Use Hyperfocus defaults**
restores shared provider/reasoning inheritance. Discovery does not save a profile.
Design context is derived from task intent, not this drawer or any toggle. See
[the context workflow](agent-workflow.md) for examples and on-demand references.

## Interaction and recovery

Empty/pending credentials cannot save. Provider changes and close clear drafts;
failed saves retain drafts. Duplicate saves and stale responses cannot update a
new drawer session. Refreshing to a different shared provider clears the old key
draft. CLI installation is described as **Uses CLI account**, without claiming a
verified login. Storage copy reflects the runtime's Windows-encrypted or memory-only
capability. Saved credentials are explicitly not claimed to prove provider access.

Browser verification also found and fixed a real integration failure: same-origin
GETs omit Origin, but the marketplace rejected them; the preferences read route
was missing. Reads now require the expected origin, loopback, and same-origin
fetch metadata when Origin is absent. Unsafe requests retain the Origin check.

## Before and after

The original baseline is the real **runtime failure state**, captured after the
obsolete guidance toggle was removed but before hierarchy changes. The after is
the real available catalog with no API key. These are not matching successful
runtime states; recovery is part of the improvement. Password fields are masked,
even when empty. The wider desktop drawer is deliberate: 540px instead of 420px.

| View | Before | After |
| --- | --- | --- |
| 1440px desktop | [Original](../../.local/design-system/evidence/padpilot-settings/before-desktop.png) | [Current](../../.local/design-system/evidence/padpilot-settings/after-desktop.png) |
| 820px intermediate | [Original](../../.local/design-system/evidence/padpilot-settings/before-tablet.png) | [Current](../../.local/design-system/evidence/padpilot-settings/after-tablet.png) |
| 390px narrow | [Original](../../.local/design-system/evidence/padpilot-settings/before-mobile.png) | [Current](../../.local/design-system/evidence/padpilot-settings/after-mobile.png), [last setting](../../.local/design-system/evidence/padpilot-settings/after-mobile-bottom.png) |
| Additional | | [2560px](../../.local/design-system/evidence/padpilot-settings/after-wide.png), [200% text](../../.local/design-system/evidence/padpilot-settings/after-text200.png), [touch](../../.local/design-system/evidence/padpilot-settings/after-touch.png) |

Opaque surfaces remove background interference. Section rules replace nested
boxes. Frequent choices are visible together; infrequent configuration no longer
competes. Narrow views deliberately scroll rather than compress labels or targets.
No task-time improvement or native-host acceptance is claimed.

## Validation and reproduction

Use the managed server URL as `PADPILOT_URL`. An existing live process lock can be
avoided with `bun .agents/skills/dev-server/scripts/dev.ts start pad-pilot --isolated --json`;
stop the returned owned ID after verification. Never delete a live lock.

```powershell
bun apps/pad-pilot/scripts/design-system/capture-padpilot-settings.ts
bun test packages/ai-core/src/runtime/design-context.test.ts packages/ai-core/src/runtime/user-preferences.test.ts packages/ai-runtime/src/preferences
bun run typecheck:pad-pilot
bun run typecheck:editor
bun run typecheck:packages
bun run check:process-policy
```

Settings unit tests, from `apps/pad-pilot`:

```powershell
bun test --conditions=browser --preload ./ui/src/test-setup.ts ./ui/src/components/ai-settings ./ui/src/components/elements/drawer.test.tsx
```

The [browser report](../../.local/design-system/evidence/padpilot-settings/after-report.json) checks horizontal
overflow, last-control hit testing, menu Escape/focus return, modal Tab containment,
pointer entry through the narrow Modules menu, 200% text, and 44px coarse-pointer
controls. Closed settings unmount; the collapsed Modules sidebar is inert.
The bounded sidebar toolbar keeps its filter above action buttons. This preserves
the existing navigation pattern rather than adding another menu.

Clearly synthetic catalog responses exercise [long labels](../../.local/design-system/evidence/padpilot-settings/fixture-long-labels.png),
[80 searchable models](../../.local/design-system/evidence/padpilot-settings/fixture-large-list.png),
[long errors](../../.local/design-system/evidence/padpilot-settings/fixture-long-error.png),
[empty](../../.local/design-system/evidence/padpilot-settings/fixture-empty.png), and
[loading](../../.local/design-system/evidence/padpilot-settings/fixture-loading.png) states. Browser capture
blocks AI writes and sends no provider request. Owned Chromium has no visible
Windows windows and is closed in cleanup. Fixture responses are not native/runtime evidence.

Verification checkpoint: 17 portable preference/context tests, 28 embedded tests,
12 settings/drawer tests, the sidebar accessibility regression, 19 marketplace
route/security tests, and the 1,695-test Harness suite passed. Relevant app/package
typechecks and process policy passed. The full marketplace suite has one unrelated
Windows symlink EPERM failure (86 passed). Source structure still fails on the
pre-existing synaesthetic-evaluator directory count of 38 versus baseline 36.

## Remaining boundary and next handoff

The native WebView/DAW journey remains unverified. Catalog-order model fallback
currently selects a research model in the captured environment, so this is not
evidence of good model selection. Local profile persistence still treats browser
storage as optional and can silently fail. These and remaining visual inconsistencies
belong in the [design debt inventory](design-debt.md).

The proposed next surface, **Editor AI panel**, has now been implemented and
validated in its [own handoff](editor-ai-panel.md). It transfers disclosure to
active conversation/review work. That handoff names the next bounded surface.
