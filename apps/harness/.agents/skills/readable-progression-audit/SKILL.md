---
name: readable-progression-audit
description: Assess game progression readability from playtest observations when players cannot tell their current goal, progress, or next step. Produces an evidence report; does not run a playtest or redesign progression.
---

# Readable progression audit

Use existing observations or collect the missing evidence for the requested loop.
Assess goal visibility, prerequisites, readback, next-step guidance, and returning
after a break against the game's intended experience. An intentionally open-ended
game need not show a prescribed objective at all times.

Run the bundled helper with Bun, replacing `<skill>` with this file's directory:

```text
bun "<skill>/scripts/readable_progression_audit.ts" --template
bun "<skill>/scripts/readable_progression_audit.ts" --observations "<evidence.json>" --out "<report.md>"
```

`--template` defines the input; another playtest skill is not required. Omit `--out`
to print the report. The helper records supplied evidence and coverage gaps, which
do not by themselves establish a defect. Keep recommendations tied to observed
player difficulty, and save project findings with their source evidence.
