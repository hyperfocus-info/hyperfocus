# Module To AI To Output Handoffs

Use this lane when auditing explicit contracts, state transfer, parser boundaries, repair/massage, diagnostics, and user-visible output.

## Current Chain

1. Dashboard selectors collect labels and notes.
2. `buildMagicSuggestion` fills labels and advanced controls with profile scores.
3. `generateMidiTemplate` computes selected scale and local `GeneratorMusicianPlan`.
4. `buildPrompt` sends raw fields, selector tags, intent tags, Musician Plan, and tracker rules.
5. `askAgent` returns raw tracker text.
6. `parseDeltaTickTracker` parses tracker.
7. `applyStyleDnaFilter` regenerates/sanitizes/simplifies/patches tracks using fallback material.
8. `scoreGeneratorComposition` gates quality.
9. Fallback generator replaces model path when parse/quality fails.
10. `buildTemplate` exports combined and per-track MIDI; dev mode can expose original model MIDI.

## Explicit Contract Target

Create named artifacts:

- `GeneratorSelectorState`: raw UI labels, IDs, locks, advanced controls, notes.
- `GeneratorIntentPlan`: normalized genre primitives, theme/groove tags, style DNA, avoid list.
- `GeneratorPromptEnvelope`: system, user, examples, output grammar version, selected provider/model.
- `GeneratorModelEnvelope`: raw tracker, returned plan/tags, confidence, provider/model, timing.
- `GeneratorValidationReport`: parser errors, loop bounds, scale policy, role coverage, style metrics.
- `GeneratorRepairPatch`: format fixes, style rewrites, regenerated tracks, reason, before/after metrics.
- `GeneratedMidiTemplate`: final MIDI plus audit trail.

## Handoff Weaknesses To Check

- Labels are passed as text, not stable IDs plus primitives.
- Theme/groove tags are normalized, but not a complete arrangement schema.
- Musician Plan is local heuristic truth, not returned/confirmed by the model.
- AI output has no track role metadata beyond track name.
- `applyStyleDnaFilter` can change creative content after model generation.
- Fallback can hide prompt/model weakness unless diagnostics keep original failure.
- Fallback can erase usable AI genre/tag intent when it rebuilds from a generic palette.
- Dev compare is hidden behind runtime flag; audit data is not fixture-ready.
- Quality reasons are scalar and may miss genre-specific wrongness.

## Concrete Improvement Ideas

- Version the tracker grammar and tag schema.
- Add role metadata per track: `ROLE=drums|chords|808|live-bass|lead|counterline|texture`.
- Base fallback palette selection on `GeneratorIntentPlan.tags`, not genre or raw regex matching.
- Store original model output, validation report, repair patch, and final tracker in dev fixtures.
- Split repair into `formatRepair`, `boundsRepair`, `styleRewrite`, and `creativeEnhancement`.
- Reject or log any style rewrite that reduces prompt-obedience metrics.
- Make AI handoff explicit enough that future smarter models can bypass local massage.

## Finding Template

```md
Handoff:
Current artifact:
Missing field:
Failure caused:
Suggested contract:
Parser/validator change:
Test fixture:
```
