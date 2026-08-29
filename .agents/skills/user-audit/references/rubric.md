# User-audit rubric

## Persona grid

Assess computer skill and AI familiarity separately:

| Dimension | Beginner | Intermediate | Advanced |
| --- | --- | --- | --- |
| Computer skill | Needs visible navigation, plain recovery, forgiving defaults | Understands common desktop patterns and settings | Uses shortcuts, logs, terminals, and dense controls |
| AI familiarity | Needs intent-based modes, consequence copy, and cost/privacy guidance | Understands prompting, models, and review loops | Understands agents, tools, autonomy, traces, and orchestration |

Do not assume advanced computer skill implies AI familiarity, or the reverse.

## Randomized reaction lenses

Computer skill and AI familiarity remain the baseline axes. Add the sampled modifiers from the run's `persona-run.json` as concrete reaction lenses:

- Translate each modifier's `reaction` into at least one check in the applicable flow.
- Record which modifier exposed or raised the severity of a finding.
- Do not lower baseline accessibility, safety, or truthfulness expectations because the sampled persona is tolerant or expert.
- When no flow can exercise a selected modifier, record that coverage gap instead of inventing evidence.
- Do not claim assistive-technology compatibility from DOM automation alone. For example, labeled text fields support a voice-input inference, but actual dictation remains untested without a real voice-control system.
- For a before/after fix check, replay the original seed. For discovery after fixes, use a new seed.

## Flow coverage

Start from the recorded product mission and cover the applicable journey stages:

1. First load and orientation.
2. Project/data selection and search.
3. Onboarding/help and recovery.
4. Create, edit, and cancel work.
5. Mode/provider/model selection.
6. Plan review and execution decision.
7. Running, failed, completed, and empty states.
8. Evidence, memory, events, logs, or history.
9. Secondary entities such as assistants, jobs, or automations.
10. Preferences, safety, and discoverability.
11. Keyboard/focus behavior.
12. Desktop and narrow/mobile layout.

For code/API-only missions, replace inapplicable visual stages with consumer setup, API discovery, implementation feedback, diagnostics, runtime behavior, and artifact verification. Never penalize a code-only surface for lacking UI; audit the actual contract its users consume.

Use deterministic state setup to reach rare states. Do not wait through long natural progression when a safe fixture or app API can establish the same state.

## Story and package coverage

Tie every audit to the repository's durable documentation routes.

- UI missions should name the canonical story owner and list covered, partially
  covered, and untested story IDs. Use `docs/user-stories.md` only as the index;
  the app or package story file owns the actual story text.
- Harness missions should also name the matching coverage-matrix rows and their
  status. Treat a touched `GAP-HIGH` row as an audit risk even when the product flow
  works during manual replay.
- Shared UI missions should cover both `packages/ui/user-stories.md` and the
  reusable UI expectations in `docs/package-testing.md`.
- Package and public API missions should name the relevant Package Matrix row from
  `docs/package-testing.md`, the nearest package README, the verification commands
  used, and any expectation not exercised by the mission.
- Do not claim all stories or package expectations are covered from one
  mission-level pass. Mark untested docs as residual risk or create additional
  seeded missions.

## Severity

- **P0:** Core path crashes, loses data, shows materially wrong context, or makes required controls unreachable.
- **P1:** Major task is misleading, blocked, or dependent on hidden expert knowledge; trust or recovery is impaired.
- **P2:** Noticeable friction, density, discoverability, copy, or consistency gap with a workaround.
- **P3:** Minor polish issue with little task impact.

Raise severity when the issue crosses persona groups, affects destructive/paid actions, or presents evidence for the wrong entity.

## Evidence rules

- Screenshot every evaluated state and inspect each image.
- For surfaces without rendered UI, capture the exact commands, relevant source artifact, stdout/stderr, diagnostics, test/runtime output, and resulting files instead of screenshots.
- Record viewport, persona, actions, dialogs, visible text, controls, unlabeled controls, document overflow, internal overflow candidates, and console/log entries.
- Record the persona id, seed, modifier count, modifier ids, and catalog version with the evidence.
- Redact password values and avoid capturing secrets.
- Treat automation success as navigation evidence, not usability success.
- Distinguish page overflow from intentional truncation and from internal control clipping.
- On narrow screens, require one usable primary pane at a time; a window fitting the viewport is insufficient when fixed secondary panes starve its main task.
- Confirm source cause only after tracing relevant state and rendering code.

## Output contract

Include:

- Executive verdict and persona fit.
- Scenario matrix with result per flow.
- Findings first, sorted by severity.
- For each finding: observed behavior, affected personas, evidence, likely/confirmed cause, and fix direction.
- What works well.
- Recommended implementation order.
- Untested risks and limits.
- Artifact and raw evidence paths.
- Product surface, stated mission, success criteria, resulting artifact, and whether the mission succeeded.
- Story owner, covered story IDs, partially covered story IDs, untested story IDs, and coverage-matrix status when applicable.
- Package-testing route, Package Matrix expectations exercised, verification commands, and package expectations not exercised when applicable.
- Requested and effective inference model, reasoning effort, acceleration mode, turns, and usage when AI was queried.
