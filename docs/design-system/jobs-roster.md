# Harness jobs roster

The task is to find scheduled work, understand its next action, and inspect or
manage it without confusing job configuration with a particular run. This is a
review candidate, not user approval.

## Hierarchy and interaction

Previously each bordered card repeated description, risk, lane, owner and
schedule information already present in detail. Nested padding reduced the
usable list width. Six row commands competed with selection; tiny tracked labels
and a permanently healthy capacity meter consumed attention and vertical space.

The roster now shows name, status, project and next run. Full description, owner,
risk, lane and schedule remain in selected detail. New job is the visible primary
action; shell creation and notification settings use Job options. Shared
ActionMenu holds row commands and bulk secondary actions. Congestion appears
when relevant; execution pause remains visible. A row's native selection button
exposes aria-current, while its separate bulk toggle exposes aria-pressed.

The local JobRosterRow composes existing Button, ActionMenu and semantic type.
It belongs to `apps/harness/ui/src/components/background-jobs/job-roster-row.tsx`;
its sole consumer is BackgroundJobsJobsList. Job-specific selection and transport
remain in Harness. No token, shared roster framework or new theme was needed.

## Selection is shared context

A remembered run previously overrode Jobs detail. Trace also computed a different
fallback using older filtering rules. Jobs now ignores remembered run selection,
persists its effective visible job and clears context when no jobs match. Trace
reads that same selected ID. Synchronization runs only for the active Jobs pane;
a mounted hidden Jobs view cannot overwrite navigation back to Runs. Focused
regressions cover all three failures and preserve existing command payloads.

## Responsive evidence

| State | Before | After |
| --- | --- | --- |
| Desktop 1440 x 1000 | [Original](../../.local/design-system/evidence/jobs/before/desktop.png) | [Current](../../.local/design-system/evidence/jobs/after/desktop.png) |
| Tablet 820 x 1000 | [Original roster](../../.local/design-system/evidence/jobs/before/tablet-roster.png) | [Current roster](../../.local/design-system/evidence/jobs/after/tablet-roster.png) |
| Mobile 390 x 844 | [Original roster](../../.local/design-system/evidence/jobs/before/mobile-roster.png) | [Current roster](../../.local/design-system/evidence/jobs/after/mobile-roster.png) |

The mobile list shows roughly three ordinary jobs instead of one and a half.
The desktop keeps roster, work and trace panes; narrow layouts reuse the existing
pane switcher with an accurate Jobs label. They preserve selection between Jobs
and Work. Detail facts reflow into one column, and the detail pane owns scrolling.
Moving commands into a menu adds one step to secondary row actions; selected
detail keeps Run now and Edit directly available.

Additional evidence: [200% text](../../.local/design-system/evidence/jobs/after/text200.png),
[44px touch controls](../../.local/design-system/evidence/jobs/after/touch.png),
[last of 120 jobs](../../.local/design-system/evidence/jobs/after/large-list-end.png),
[long name](../../.local/design-system/evidence/jobs/after/mobile-long-name.png),
[long detail](../../.local/design-system/evidence/jobs/after/mobile-long-detail.png),
[reachable detail end](../../.local/design-system/evidence/jobs/after/mobile-long-detail-end.png),
[failure/backoff](../../.local/design-system/evidence/jobs/after/mobile-blocked.png),
[empty search](../../.local/design-system/evidence/jobs/after/search-empty.png) and
[empty workspace](../../.local/design-system/evidence/jobs/after/empty.png).

## Repeatable acceptance

Reuse the managed Harness and set HARNESS_URL to its returned URL:

```powershell
bun packages/ui/scripts/design-system/capture-jobs.ts
bun run test:harness
bun run typecheck:harness
bun run check:process-policy
```

DESIGN_EVIDENCE_DIR overrides output; DESIGN_CAPTURE_PHASE=before records the
currently served version, not reconstructed history. The fixture intercepts
websocket startup with synthetic jobs, globally pauses execution and drops all
outgoing commands. It exercises the real app and stylesheet without altering
real jobs or recording private transcripts. The script owns its headless browser
and verifies actual Windows window visibility.

The [report](../../.local/design-system/evidence/jobs/after/report.json) records viewport geometry at
1440/820/390/2560px, short-height layout, text scaling, touch targets, keyboard
selection, menu focus return, disabled execution, bulk selection and bounded
virtualization through the final job. No browser errors or visible automation
windows were observed. These are behavioral/geometry checks and review images,
not an automatically approved pixel baseline or live scheduler acceptance.
The long-detail check scrolls to the final Execution log and verifies its actual
hit-test reachability, rather than relying on the outer pane's dimensions.

Focused selection/trace coverage passed 54 tests / 224 assertions; narrow pane
label identity passed 1 test / 5 assertions. The full Harness suite passed all
671 UI tests and core tests, but failed one terminal WebSocket mock-client test
at its 5000ms timeout; that failure reproduced alone. Harness typecheck, UI build,
targeted lint and process policy pass. Source structure remains blocked by the
unrelated PadPilot evaluator file count; the jobs panel baseline was ratcheted
from 2301 to 2205 lines.
The shared server's historical error backlog remains: including errors 1099/1100
for missing `tryMarkAssistantQuestionRunWaiting`. The intercepted browser fixture
does not validate that unrelated runtime path; no backlog entries were marked fixed.

## Remaining debt and next surface

The adjacent trace still repeats selected metadata and uses older small type.
Job edit and Health dialogs retain their existing composition. Loading/reconnect,
live execution and OS notification flows were not exercised by this intercepted
visual fixture. The filter popover was captured and state filtering has component
tests; its full submenu journey was not automated in the browser. These are
outside the roster closure; retain their owners in the
[debt inventory](design-debt.md).

Next real surface: **Editor AI action review** (DD-012). The next useful test is
whether these readable summaries and disclosures can show actual parameter
changes and affected objects before a user applies a plan, while preserving
revision guards and the equivalent editor command path.
