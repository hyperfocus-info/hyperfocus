# Twenty-five additional surface iterations

This run starts with the enlarged-text roster finding from the previous
[ten Harness surfaces](next-ten-harness.md). It counts real task surfaces, not
primitive variants. Per-surface searches, owner decisions, captures, replay and
acceptance limits live in the four handoffs below. The
[debt inventory](design-debt.md) owns unresolved findings.

| # | Real surface | Result | Evidence and similarity map |
| --- | --- | --- | --- |
| 1 | Harness Jobs roster | Reserved list viewport and contained keyboard filters | [Rosters](next25-rosters.md) |
| 2 | Harness Runs roster | Same navigation contract for run selection | [Rosters](next25-rosters.md) |
| 3 | Harness Assistants roster | List survives enlarged controls and filters | [Rosters](next25-rosters.md) |
| 4 | Harness Projects/thread navigation | Project list remains reachable below tools | [Rosters](next25-rosters.md) |
| 5 | Assistant pending questions | Named answer, blank guard and readable width without nested short-list scrolling | [Harness tasks](next25-harness.md) |
| 6 | Assistant recovery dialog | Recovery reason before optional diagnostics | [Harness tasks](next25-harness.md) |
| 7 | Assistant Jobs collection | Pane-aware cards and readable status | [Harness tasks](next25-harness.md) |
| 8 | Assistant recent Runs collection | Pane-aware cards and complete summaries | [Harness tasks](next25-harness.md) |
| 9 | Assistant configuration | Readable routing and long model identifiers | [Harness tasks](next25-harness.md) |
| 10 | Streamed tool output | Semantic states, readable invocation, consistent detail action | [Harness tasks](next25-harness.md) |
| 11 | Trace browser approval | Visible pause reason; rejection remains available | [Harness tasks](next25-harness.md) |
| 12 | Website Versions & recovery | Explicit loaded/empty history feedback | [Website tasks](next25-editor.md) |
| 13 | Website Add page/navigation | Duplicate-address feedback before creation | [Website tasks](next25-editor.md) |
| 14 | Website Starters & quickstart | Replacement confirmation names its starter | [Website tasks](next25-editor.md) |
| 15 | Website Product table import | Review announcement and focus destination | [Website tasks](next25-editor.md) |
| 16 | Website Deployment guide | Missing target fields explain unavailable preparation | [Website tasks](next25-editor.md) |
| 17 | Website Live settings transfer | Local error and retry feedback | [Website tasks](next25-editor.md) |
| 18 | Website Collections/forms/quizzes | Discard accepts latest baseline before another edit | [Website tasks](next25-editor.md) |
| 19 | PadPilot Controller preferences | Stable controller controls and modal reading space | [PadPilot tasks](next25-padpilot.md) |
| 20 | PadPilot Custom controller layout | Contained mapping grid and visible learning controls | [PadPilot tasks](next25-padpilot.md) |
| 21 | PadPilot Diagnostics | Sampling status before diagnostic details | [PadPilot tasks](next25-padpilot.md) |
| 22 | PadPilot Create Module | Creation footer remains inside the viewport | [PadPilot tasks](next25-padpilot.md) |
| 23 | PadPilot Module install review | Truthful browser persistence scope | [PadPilot tasks](next25-padpilot.md) |
| 24 | PadPilot Marketplace browse | Named search and query-specific empty recovery | [PadPilot tasks](next25-padpilot.md) |
| 25 | PadPilot Update review | Staging action before optional release notes | [PadPilot tasks](next25-padpilot.md) |

## Shared owners

Website's seven existing disclosures and PadPilot's update/install context now use
the small native-backed shared `Disclosure`, with no second-host API additions.
Harness retains its app-local `LeftPane` navigation contract and
assistant detail layout owner. PadPilot retains its app-local Modal adapter because
its host focus, sizing and dismissal contracts are already real consumers.
These owners reuse existing semantic tokens; no theme engine, new preference or
generic layout language was added.

Harness-local Button and its Tooltip wrapper now share the canonical label-wrapping
contract, covering long suggested answers and recovery/approval actions at narrow
enlarged text instead of patching each caller with smaller type.

Shared Popover now follows asynchronous content growth. Harness VirtualList also
owns the async empty-to-loaded and hidden-pane offset repairs found by real roster
selection, extending the fix to existing transcript and collection consumers.

Task-specific validation stays with the task: duplicate addresses, staged snapshot
recovery, controller identity and execution policy are not visual primitive props.
Each handoff distinguishes hosted rendering from isolated real-component fixtures.
Browser evidence does not establish provider, scheduler, deployment or native DAW
acceptance, and screenshots are implementation references rather than user approval.

## Integration boundary

The four roster journeys pass desktop 1440, tablet 820, mobile 390 and 390px/200% root
text, including first/last pointer selection and visible selection after return.
PadPilot has 21 real-host variants plus task, Escape, disclosure and fixed-action
checks. Website has 21 real-component variants with local error, disabled, stale,
focus and native-disclosure recovery. The Harness task handoff owns its exact
viewport matrix and scrolled destination evidence.

Harness and PadPilot app typechecks, Website scoped typecheck and UI builds pass.
Shared focused tests cover disclosure state and async popup growth; Harness adds
empty-mount and hide/reveal virtual-list regressions. Process policy passes.
The integrated Harness suite passes 157 tests/576 assertions across 12 files;
the shared primitive/composer suite passes 7 tests/50 assertions. The scoped
Website and PadPilot handoffs record their separate suites and browser checks.
The broad source gate remains blocked by the pre-existing PadPilot evaluator
directory count 38 versus baseline 36. Package-wide typecheck still reports existing
creative-preset types and older Editor capture-script errors. No baseline was raised.

Native PadPilot acceptance remains DD-009. Exactly one next visual surface is
recommended: the Harness command bar (DD-030), whose current enlarged-text height
still competes with the task even though navigation no longer loses its rows.
