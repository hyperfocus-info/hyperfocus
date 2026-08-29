# Evaluation And Tests

Use this lane when turning audit findings into fixtures, metrics, tests, or quality gates.

## Magic Definition

Generator feels magical when:

- User intent maps to a musically right plan.
- Output has one clear idea plus tasteful support.
- Genre dialect is specific, not generic.
- Surprise is bounded by style.
- MIDI is immediately draggable and editable.
- Repairs preserve or improve model output with evidence.

## Eval Lanes

- Validity: parse, PPQ bounds, loop end, MIDI export, channels/programs.
- Prompt obedience: selected genre, mood, era, complexity, scale, length, notes.
- Style fidelity: groove grid, bass role, harmonic density, instrument dialect, avoid list.
- Melody: motif recurrence, contour arc, phrase target, rest budget, variation.
- Groove: downbeat anchors, syncopation, microtiming, phrase fills, percussion grammar.
- Harmony: chord density, voice leading, guide tones, harmonic rhythm, outside-note policy.
- Arrangement: track roles, register separation, form arc, density budget.
- Minimal intervention: original vs massaged delta, repair reasons, quality delta.

## Fixture Matrix

Keep fixtures small and diagnostic:

- Empty Magic Suggestion.
- One common genre: House, Boom Bap, Drill, Neo Soul, Amapiano, Ambient, Cinematic.
- One hard genre pair: `Gospel + Chromatic`, `Drill + Major`, `Ambient + Dense Harmony`.
- One user-note override: explicit instrument, rhythm, or key request.
- One long loop: 16 or 32 bars with phrase evolution.
- One sparse style where "all tracks every section" would be wrong.

## Test Targets

- `generator-options.test.ts`: label normalization, slug collisions, intent aliases, Magic Suggestion locked fields.
- `codex-client.test.ts`: parser grammar, scale policy, quality reasons, repair patch behavior.
- Source-contract tests: prompt does not duplicate critical rules, output grammar version exists, repair diagnostics include before/after metrics.
- Snapshot-style tests: static inventory counts and changed labels require intentional review.

## Output Review Checklist

For each fixture, preserve:

- Input selectors and notes.
- Prompt or prompt hash.
- Raw tracker.
- Parsed composition metrics.
- Repair patch log.
- Final tracker.
- Human review notes: "right", "wrong", "boring", "over-massaged", "style drift".

## Regression Rule

Never accept a metric gain alone. A change must either:

- Preserve original model musical intent while fixing format/bounds, or
- Show a better genre-specific result in fixture output and explain why.

## Evaluator Integrity Rules

- Calibration belongs inside each named metric's evidence-to-score curve. Never add a second-stage calibration, hidden final-score penalty, contrast stretch, or raw-versus-calibrated delta.
- Every quality adjustment must be a source-specific metric (`audio.*` or `midi.*`) or an explicit safety rule. Each result emits score, confidence, validity/status, and measured evidence.
- Descriptive observations are not automatically quality votes. Key, loudness, band energy, width, and entropy need an independently justified desirability mapping before they can affect quality.
- Aggregate correlated metrics through fixed-budget facets, then dimensions. Adding a duplicate or near-duplicate metric must not increase that musical property's influence.
- Exclude unavailable, inapplicable, and unreliable evidence from the score. Reduce coverage/confidence; never silently convert missing evidence to zero.
- Confidence describes measurement reliability, not desirability. Ambiguous tonality, weak beat tracking, mono audio, or absent vocals should reduce applicability rather than manufacture a defect.
- Safety caps are reserved for evidence-backed hard faults such as invalid samples, effective silence, or severe sustained clipping. Loudness and unconventional style are not hard faults.
- Treat sub-bass as potential physical/groove support. Penalize only demonstrated translation, masking, distortion, or loss-of-definition evidence; never a fixed low-frequency energy share by itself.
- Validate metric curves on listener-labeled held-out data, metamorphic pairs, and adversarial fixtures. Evaluator-ranked labels are not ground truth, and the fitting cohort must not also be the validation cohort.
- Required metamorphic checks include gain invariance after loudness normalization, sample-rate stability, codec-quality stability, and mono applicability. Required pathologies include silence, non-finite samples, noise, static loops, random MIDI, sustained chords, graded clipping, intentional dissonance, and unusual-but-good music.
