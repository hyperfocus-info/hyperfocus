---
name: generator-audit
description: Audit PadPilot Generator module musical intelligence, Magic Suggestion behavior, tag and selector inventory, style DNA, AI prompt contracts, model-output handoffs, MIDI validation, and postprocess massage. Use when asked to make the Generator feel more magical, research melodies or genres for Generator, optimize Generator AI prompts, find naive tags, or make module to AI to output contracts more explicit.
---

# Generator Audit

Audit Generator as a music system first, UI second. Goal: drag-ready MIDI that feels intentional, style-literate, and surprising without hidden repair code destroying good model output.

## Start

Run static scan:

```powershell
bun.cmd apps/pad-pilot/.agents/skills/generator-audit/scripts/audit-generator.ts
```

Use `--write .agents/skills/generator-audit/references/current-inventory.md` only when the user asks to refresh the snapshot.

Inspect these files before findings:

- `apps/pad-pilot/ui/src/modules/generator/utils/generator-selector-options.ts` and `generator-magic-options.ts`: selector inventories, tag rules, and Magic Suggestion graph.
- `apps/pad-pilot/ui/src/modules/generator/utils/generator-prompt.ts`, `generator-style-dna.ts`, `generator-tracker.ts`, `generator-massage-*.ts`, `generator-fallback.ts`, and `generator-client.ts`: system/user prompts, style DNA, parsing, repair, quality gates, fallback, and model handoff.
- `apps/pad-pilot/ui/src/modules/generator/components/generator-dashboard.tsx`: user-facing controls and wording.
- `apps/pad-pilot/ui/src/modules/generator/*.test.tsx` and `apps/pad-pilot/ui/src/modules/generator/utils/*.test.ts`: current behavior coverage.

## Research Lanes

Read only the needed lane files:

- Tag and selector inventory: [references/tags.md](references/tags.md)
- Fallback tag catalogue: [references/fallback-tag-catalogue.md](references/fallback-tag-catalogue.md)
- Melody fundamentals: [references/melody.md](references/melody.md)
- Genre and groove dialects: [references/genres.md](references/genres.md)
- Prompt optimization: [references/prompting.md](references/prompting.md)
- Module to AI to output handoffs: [references/handoffs.md](references/handoffs.md)
- Evaluation and tests: [references/evaluation.md](references/evaluation.md)

When auditing AI prompting, browse current official provider docs. Keep citations in findings. Prefer official OpenAI docs for OpenAI APIs; use other provider docs only when that provider is in scope.

## Audit Shape

For each finding, state:

- **Symptom**: what makes output less magical.
- **Root cause**: source path and line.
- **Musical miss**: which primitive is missing or flattened.
- **Prompt or handoff miss**: unclear input, overloaded prompt, lossy tag, hidden repair, weak validator, or missing diagnostic.
- **Fix lane**: inventory, prompt, style DNA, parser, repair, quality gate, UI wording, or tests.
- **Proof**: fixture, generated tracker/MIDI metric, source-contract test, or prompt diff.

Rank by user impact:

1. Style-literate output failure.
2. Good AI output degraded by deterministic massage.
3. Prompt contract ambiguity or redundant instruction load.
4. Naive selector/tag ontology.
5. Weak eval coverage or diagnostics.

## Principles

- Treat prompt as API contract. Separate instructions, selected values, normalized tags, style plan, output format, and validation criteria.
- Prefer explicit typed handoffs over infer-from-text. If provider supports structured output, propose schema path.
- Postprocess must repair format/bounds deterministically, but style rewrites need evidence. Future models may outperform local heuristics.
- Selector labels must map to music primitives: tempo, meter/grid, swing, groove cell, bass role, harmonic rhythm, harmonic density, voicing, melody role, form arc, instrumentation, production era, and avoid list.
- Treat genre as one tag source, not a privileged control path. Mood, era, complexity, scale, and notes can be equally valid musical buckets. Do not add one-off genre logic when a tag inventory or tag-weighted primitive can cover the behavior.
- Fallbacks must be tag-built and AI-anchored. A single normalized tag should resolve to a complete bucket for leads, chords, drums, basses, texture, tempo bias, avoid rules, and repair hints.
- Creative massage must preserve model intent. Nudge local outliers when possible; replace or regenerate only when a lane is unusable or an explicit before/after quality delta proves the rewrite helps.
- Do not add factory-module-only magic. Generator capabilities should stay module-representable through public PadPilot APIs.

## Closeout

Deliver ranked findings plus implementation plan. If making code changes, add focused tests near touched files and run relevant Generator tests plus `bun.cmd run --cwd apps/pad-pilot typecheck`.
