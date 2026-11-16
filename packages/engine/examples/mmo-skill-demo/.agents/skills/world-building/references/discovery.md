# World discovery helpers

Run from `packages/engine/examples/mmo-skill-demo`. Select the helper matching the
question; no full scan is required for a known local change.

| Need | Helper under `.agents/skills/world-building/scripts/` |
| --- | --- |
| Density triage | `heat-map.ts --format actions --sort priority` |
| One sparse zone | `heat-map.ts --band sparse --zone void-rift --top 3 --format actions` |
| Existing chunk evidence | `heat-map.ts --chunk 0 --format markdown` |
| Read-only review packets | `plan-world-pass.ts --band sparse --zone void-rift --top 2` |
| Landmark implementation packets | `plan-world-pass.ts --scope landmarks --chunk 5` |
| Quest implementation packets | `plan-world-pass.ts --scope quests --chunk 5` |
| Existing image keys and asset search terms | `asset-needs.ts --chunk 5` |
| Candidate TypeScript placement entries | `landmark-snippets.ts --chunk 5 --format ts` |
| Quest seed preview | `quest-seed.ts --chunk 5 --dry-run` |

Prefix commands with `bun.cmd`. Use JSON output when another tool needs structured
evidence. `world-analysis.ts` owns shared scoring; reuse it when extending these
helpers instead of copying the scoring model.

The planner defaults to `--scope review`, with no edit ownership or build/test
assignment. Select implementation scope from the requested task, not the presence
of a potential quest hook. Packets separate discovery commands from conditional
verification: affected render or quest tests, an example build for runtime changes,
and changed-area screenshots when readability changes. Gameplay proof still
belongs to the actual landmark or quest behavior; this planner is not a release gate.

Review quest previews before `--write`, which appends to future-quest notes.
Inspect generated placement snippets and their visual result before committing.
For delegated work, a planner packet can carry objective, evidence, owned paths
and acceptance checks; it does not require delegation or authorize extra edits.

After planner changes, run
`bun.cmd test ./.agents/skills/world-building/scripts/plan-world-pass.test.ts`
and inspect a real CLI packet in the affected scope.
