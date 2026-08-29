# Prompt Optimization

Use this lane when auditing `SYSTEM_DIRECTIVE`, `buildPrompt`, selector prompt lines, intent tags, Musician Plan, prompt length, unnecessary context, structured output, and model/postprocess balance.

## Current Prompt Surfaces

- `SYSTEM_DIRECTIVE`: tracker format, global rules, model behavior constraints.
- `buildPrompt`: selected fields, normalized selector tags, intent tags, Musician Plan, final rules.
- `musicianPlanPromptLines`: dense generated plan from local heuristics.
- `askAgent`: provider/model handoff.
- `applyStyleDnaFilter`: post-model style rewrite/massage.

## Good Prompt Contract

Separate:

1. Role: compact MIDI tracker.
2. Output format: exact tracker grammar or structured schema.
3. Selected user data: raw labels, IDs, notes, locks, advanced values.
4. Normalized plan: style DNA and genre primitives.
5. Hard constraints: loop length, PPQ, channel/program bounds.
6. Soft constraints: taste, density, humanize, novelty.
7. Validation criteria: what parser/quality gate will check.

Do not mix hard rules and style hints in one flat list.

## Red Flags

- Same rule appears in system and user prompt.
- Vague imperatives stack up: "tasteful", "musically useful", "style-correct" without examples or metrics.
- Prompt asks for all tracks in every section, then hopes for rests/space.
- Prompt demands no track cap and three bass roles even for sparse/ambient genres.
- Prompt sends local "Music Plan" as binding truth when it may be less musical than the model.
- Output uses a text metadata tag line instead of a schema, so parser cannot know confidence, intended track roles, or reasons.
- Postprocess repairs style silently, making prompt eval impossible.

## Optimization Pattern

1. Generate a prompt budget report with the audit script.
2. Classify each line: format, hard constraint, selected value, normalized primitive, soft taste, duplicate, or repair workaround.
3. Remove duplicates before adding rules.
4. Prefer one compact canonical example over many edge-case instructions.
5. Make model return intent explicitly: track role, phrase function, bass role, motif ID, and tags.
6. Validate then repair. Format/bounds repair is okay; creative rewrite needs logged reason and before/after diff.
7. Compare original model output against massaged output in dev fixtures.

## Structured Output Direction

If provider supports schema-constrained output, propose:

- Stage 1: structured `GeneratorArrangementPlan` with tracks, roles, phrase grid, scale policy, tags, avoid rules.
- Stage 2: tracker events generated from that plan, or structured events converted locally.

If tracker text remains, add explicit machine-readable headers:

```text
!PLAN:STYLE=drill;GRID=half-time;BASS=808-lead;MELODY=riff;FORM=starter-turnaround!
!TAGS:THEME=dark,minimal;GROOVE=half-time,808-slide-pocket!
```

## Research Links

- OpenAI prompt engineering best practices: https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic context engineering warning about prompt edge-case stuffing: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Google prompt structure guidance: https://ai.google.dev/gemini-api/docs/prompting-strategies
