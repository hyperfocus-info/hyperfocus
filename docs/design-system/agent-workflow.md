# AI context and shared defaults

This reference owns the design-context injection and shared AI preference behavior
used by Harness, Editor, Website, and PadPilot. For first-party UI implementation
use [app-ui-standard](../../.agents/skills/app-ui-standard/SKILL.md); for prior
surface examples search the [evidence index](evidence-index.md).

## Shared settings and task-derived context

Harness **Preferences → AI & Providers** publishes compatible provider and
reasoning defaults for Editor and PadPilot. Existing explicit app profiles win;
**Use Hyperfocus defaults** removes that override. Model catalogs and execution
policies differ, so model selection, Fast mode, credentials, and review/approval
remain app-owned. Discovery must not persist an automatically chosen profile.

Design guidance is **not a preference**. The portable task router adds a short,
self-contained paragraph when the request needs an interface, including ordinary
app creation without UI vocabulary. It adds only evidenced requirement branches:
forms, data, navigation, media, game menus or interactive learning. Existing project context can constrain the
design but cannot trigger UI intent on its own.

For generated user projects, the paragraph follows the user's visual direction
and existing project components. It supplies task-level usability constraints,
not a Hyperfocus brand fallback or inaccessible repository links. Material
unresolved taste choices require a concrete question; ordinary open choices remain
available to the agent. First-party app standards still live in [DESIGN.md](../../DESIGN.md).

| Request | Added context |
| --- | --- |
| Build an app that tracks expenses | Project/user design direction, readable actions and deliberate data presentation |
| Build a signup app in React matching this Figma mockup | Requested stack/reference and form validation |
| Build a video app with sidebar navigation | Project/user direction plus media and navigation rules |
| Build a pause menu | Bounded player-intent composition, priority/audience/availability, controller focus and Back |
| Add an interactive tutorial | Observable steps, input/timing, automatic completion, corrections and reversible demonstration |
| Make a MIDI bass line / build a CLI app | None |

Harness execution/planning, Editor planning, Website proposals, and PadPilot
embedded/remote requests use the same router. Retired `designGuidance` fields
are ignored on read and omitted on the next explicit preference write; reading
does not migrate the user's file. Provider/reasoning overrides are independent.
The router uses bounded English patterns, not semantic understanding. Mixed
backend/frontend requests and localization remain recorded routing debt.

All interface tasks receive the [attention contract](attention.md) and the composition-first authoring order from
[DESIGN.md](../../DESIGN.md#compose-the-task-before-styling-controls), preservation
of approved choices and real-consumer validation. The shared
[interaction contract](navigation-settings.md) adds unique grouped navigation,
settings views/shortcuts, normal input values, alignment and last-open Escape.
Domain branches do not require
the word “UI”; writing tutorial prose, technical completion APIs, headless game
tests and excluded interfaces do not trigger them. The injected text contains no
repository-only paths, package dependency mandate or Touch of Death visual theme.
Harness planner/execution, Editor planning, Website proposals and PadPilot request
tests cover delivery to the actual host prompt builders. These tests prove routing
and injection, not the visual quality of a future model response.

This controls automatically supplied AI context. It does not rewrite a project's
own instructions, remove accessibility behavior from controls, or change the
first-party application's theme. A customer's visual identity and explicit task
requirements take precedence over Hyperfocus styling. Do not impose the dark
theme, logo, or brand palette on generated products.

The [runtime contract](../../packages/ai-runtime/README.md) owns persistence and
HTTP/native transport details. Shared preferences contain no secrets. Harness
and embedded-app credentials retain their existing vault boundaries. Tests inject
temporary stores and fake transports; never test defaults against the user's file.


## Implementation and verification routes

For repository game menus, use **intent → menu type → canonical composition →
semantic content → validation**. The [game-menu owner](game-menus.md) routes proven
compositions and their constraints. Atomic controls and tokens do not authorize an
arbitrary layout. Keep product-specific taste separate from foundation mechanics.

Tutorials use **skill → observable steps → canonical coach → evidence → validation**.
The [tutorial contract](tutorials.md) requires input, timing and success semantics,
automatic completion, demonstration isolation and actionable attempt feedback.
Do not substitute a text overlay and a Next button for this learning loop.

| Change | Owner / relevant evidence |
| --- | --- |
| Shared provider/reasoning defaults | Portable `runtime/user-preferences.ts`, runtime preference store, affected app client; [provider handoff](provider-preferences.md) |
| Context injection | Portable `runtime/design-context.ts` and its tests, then the affected planner/caller |
| Host credential or persistence behavior | [Runtime contract](../../packages/ai-runtime/README.md); temporary stores and fake transports |
| Shared preference UI | [Editor settings](editor-settings.md), [PadPilot settings](padpilot-settings.md), [provider handoff](provider-preferences.md) |
| Actual visual capture | [Shared UI commands](../../packages/ui/README.md) and affected surface's evidence page |

Embedded planners cannot browse repository files. Their context must be
self-contained; do not supply inaccessible paths or claim that a reference was
loaded. Repository agents can follow these routes as needed.

Verification follows the changed boundary: focused contract/prompt tests for
injection, temporary-store/transport tests for preference behavior, and the real
host flow for changed UI. Use the managed server's returned URL and owned headless
capture tools. Never test defaults against the user's preferences or send real
provider requests merely to verify context assembly.

Handoffs identify the context/profile decision, affected consumers, evidence, and
unverified boundaries. Link the owning evidence rather than copying transcripts,
command inventories, or credentials.

## Observable quality obligations

Harness outcome admission and its legacy/opaque-caller limits are described in
[the runtime owner](../../apps/harness/README.md). In this rule-level report,
`VERIFIED` means technically verified. `outcomeVerification` remains UNVERIFIED;
whole-task domain evidence must come from its own evaluator. Late child work
requires a new integrated-candidate boundary and fresh verification.

`@hyperfocus/ai-core/quality` owns the bounded rule catalog, eligibility, versioned
handoff schema and derived coverage report. Its metadata references the existing
design contracts; it does not turn every instruction into a new rule language.
`@hyperfocus/ai-runtime/quality` resolves the small self-contained contract fragments
and records their SHA-256 hashes. Those hashes identify the supplied fragments,
not a claim that the complete linked document or skill was read.

The execution path is:

`task intent + owned/changed paths → expected rules → host selection → context
assembly → adapter delivery → child handoff → candidate hash → frozen host checks
→ derived coverage → completion guard`.

Eligibility is independent of selection. The router combines bounded English task
signals, affected UI paths, declared surface and project. The Books journey overrides
the generic journey; equally scoped conflicts block dispatch. Changed-file comparison
excludes preexisting dirty bytes and exposes missed UI eligibility after execution.
Unknown intent and unavailable Git inspection remain explicit limitations. The
router cannot guarantee coverage of every language, generated file or product rule.

Harness stores `plan.quality` in the existing SQLite run and transmits it through
the existing task protocol. Run details renders the reconstructed report. Pi records
the exact payload hash at `session.prompt`; CLI submission and other opaque adapters
remain UNKNOWN. No receipt proves model attention, provider retention, voluntary
skill reads or opaque runtime-created children. Editor's runtime returns the same
trace with proposals; its review panel invalidates it after project changes or Apply.
After Apply, the Editor host can independently reopen and exercise the captured
2D project. Versioned Editor obligations bind the receipt to project and binary
content, session/revision and renderer build; later edits or asset hydration make
it stale. Unsupported projects and other product obligations stay UNKNOWN.
The [Editor verification profile](../../apps/engine-editor/README.md#verification)
owns its scope and reproduction command. Proposal execution alone is implementation.

Supported Harness workers receive versioned references, audience/journey references,
composition IDs and the verification profile. The host resolves and supplies required
fragments before dispatch, validates missing/stale/conflicting references, and retains
verification ownership. Validation checks the host's intent, audience and verification
profile as well as rule hashes;
required journeys, compositions and accepted decision references cannot be dropped.
Nested handoffs preserve additional parent references. A blocked envelope stays
visible in the trace and cannot establish propagated coverage.
Only validated, privately retained handoffs authorize nested dispatch. Returned
envelopes and observation records are copies; a rejected attempt cannot become a
parent. A corrected retry retains blocked events and records fresh valid propagation.
Current routing conservatively gives each managed worker all eligible rules; external child delegation
is unsupported. Retries create fresh obligations and receipts.

For a project with `package.json#hyperfocus.quality`, the shared execution runtime
(used by Harness and `inspect:outcome --execute`) freezes `test:quality`,
verifier inputs and declared shared dependencies before dispatch. It executes the
profile after implementation, validates a fresh nonce-bound receipt, rehashes the
candidate/verifiers, and requires referenced evidence to exist. A missing profile,
skipped check, failed process, stale evidence or unsupported delivery cannot produce
VERIFIED. Both normal and direct terminal completion enforce this. Existing historical
rows remain readable and report UNKNOWN when they have no lifecycle evidence.

Execution remains on the existing run state machine. The report distinguishes
IMPLEMENTED, CHECKED and VERIFIED; unresolved qualitative review is REVIEW REQUIRED.
It never synthesizes ACCEPTED or a human approval. An explicit `Prototype:`,
`Experiment:` or `Spike:` intent prefix selects advisory implementation-only checks;
skipped checks remain unverified. Mentioning an old prototype in a production task
does not select that profile. Backend-only work does not run the UI browser profile.
Passing `host-verifier` evidence cannot clear a qualitative obligation: that needs
current-candidate `human-review` evidence with a reference. Machine failures remain
visible, and successful deterministic checks can coexist with REVIEW REQUIRED.
This validates evidence scope, not the identity or truthfulness of a reviewer.

### Enforcement audit

| Mechanism | Classification and actual boundary |
| --- | --- |
| Root/scoped instructions and voluntary skills | ADVISORY; automatic discovery alone does not establish loading or compliance. Voluntary reads are UNOBSERVABLE here. |
| Existing task-derived design prose | Host assembly VERIFIED by prompt-builder tests; later compliance was ADVISORY. |
| Typed compositions, action schemas, token/accessibility checks | ENFORCED within their modeled scope; cannot establish a complete journey or taste. |
| Existing attention/browser and shipping checks | VERIFIED when actually run on the candidate; their existence alone did not gate ordinary task completion. |
| New managed SDK delivery and handoff boundaries | VERIFIED for exact versions submitted; missing references ENFORCED before dispatch. CLI receipt visibility is UNSUPPORTED. |
| New frozen UX checks and completion guard | ENFORCED for catalogued applicable obligations, with positive and negative evidence. |

| Requirement class | Deterministic evidence | Remaining judgment |
| --- | --- | --- |
| Structural | Navigation destination uniqueness, explicit priority/audience, valid destination allowlist, composition root budget | Whether the grouping reflects the audience's mental model |
| Behavioral | Actual Books draft open/hide/reopen/resume and menu Escape/focus return | Other journeys, hardware/controller accessibility |
| Visual/geometric | Required controls, hit testing, clipping, page overflow and text bounds at three viewports and enlarged text | Readability beyond measured bounds, aesthetic quality |
| Qualitative | Explicit UNKNOWN/review-required state | Approved reference comparison and human/product acceptance |

### Reproduction and limits

- `bun apps/harness/scripts/quality/demonstrate.ts` exercises real orchestration,
  versioned child delivery, Books browser checks, SQLite reopen and dropped-handoff /
  skipped-verifier mutations using deterministic provider transport, with no model call.
- `bun apps/harness/scripts/quality/report.ts --db <database> --task <run-id>`
  reconstructs the machine-readable report without reading transcripts.
- [Books verification](../../apps/engine-editor/website/examples/books/README.md#develop-and-verify)
  owns the positive journey and six UI mutations covering duplicate destinations,
  root-action hierarchy, recovery, focus, responsive controls and retained task context.
- [Editor verification](../../apps/engine-editor/README.md#verification) owns the
  rendered proposal inspection, applied-project browser checks and stale-state mutations.

This is scoped enforcement, not a security boundary against a process that can rewrite
the host or its SQLite database. Profile inputs and declared dependencies bound the
candidate; undeclared transitive dependencies and installed browser/tool binaries are
not fully attested. No semantic LLM grader or second telemetry service is involved.
Raw runs belong in `.local/quality-observability` and the project's `.local/quality`;
keep one summary and essential captures for review, and prune obsolete runs after
their replacement evidence has been accepted.

October 4 composition integration: 119 focused tests cover routing, four host
request paths, public tutorial entries and real game adapters; 42 candidate-browser
checks pass with no runtime errors. Evidence is under
`.local/design-system/composition-contracts/`. UI/AI-core builds, Harness typecheck,
guidance and process checks pass. Package/editor typechecks and the broad style
gate still report unrelated workspace violations. The candidate was verified
without replacing the shared playable or earlier product evidence. Generated-model
visual quality and physical-controller acceptance are not inferred from these checks.
