# User-audit rubric

## Persona grid

Assess computer skill and AI familiarity separately:

| Dimension | Beginner | Intermediate | Advanced |
| --- | --- | --- | --- |
| Computer skill | Needs visible navigation, plain recovery, forgiving defaults | Understands common desktop patterns and settings | Uses shortcuts, logs, terminals, and dense controls |
| AI familiarity | Needs intent-based modes, consequence copy, and cost/privacy guidance | Understands prompting, models, and review loops | Understands agents, tools, autonomy, traces, and orchestration |

Do not assume advanced computer skill implies AI familiarity, or the reverse.

## Flow coverage

Cover the applicable journey stages:

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

Use deterministic state setup to reach rare states. Do not wait through long natural progression when a safe fixture or app API can establish the same state.

## Severity

- **P0:** Core path crashes, loses data, shows materially wrong context, or makes required controls unreachable.
- **P1:** Major task is misleading, blocked, or dependent on hidden expert knowledge; trust or recovery is impaired.
- **P2:** Noticeable friction, density, discoverability, copy, or consistency gap with a workaround.
- **P3:** Minor polish issue with little task impact.

Raise severity when the issue crosses persona groups, affects destructive/paid actions, or presents evidence for the wrong entity.

## Evidence rules

- Screenshot every evaluated state and inspect each image.
- Record viewport, persona, actions, dialogs, visible text, controls, unlabeled controls, document overflow, internal overflow candidates, and console/log entries.
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
