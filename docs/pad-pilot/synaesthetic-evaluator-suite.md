# Synaesthetic Evaluator

Auto-update policy: update this reference whenever an evaluator feature, score curve, aggregation rule, safety cap, persistence schema, or report contract changes.

## Why V3.1 Exists

The original audio evaluator presented 20 metric names as independent votes, although most were recombinations of the same low-end, chroma, onset, and dynamics values. On the 150-item benchmark its participation-ratio estimate was only **2.31 effective independent metrics out of 20**. The last 16 commercial references had raw scores compressed into `0.577..0.735`; a second hand-written calibration function expanded them to `0..1` and made the result correlate primarily with bass share. That layer has been removed.

V3 keeps the V2 evidence boundary and makes the scoring contract smaller. V3.1 adds honest provisional confidence, non-saturating structure evidence, passage-localized actions, and an immutable human-review loop:

- evidence extraction and quality scoring are separate
- audio and MIDI use distinct metric IDs
- audio exposes exactly one evidence-bearing score vote per dimension
- descriptive observations do not become extra votes merely because they are measurable
- dimensions form the overall score with equal default influence
- confidence controls influence, never desirability
- missing or unreliable evidence is unavailable, never zero
- hard safety faults are visible caps, not hidden penalties
- every score curve lives with the metric it calibrates; post-hoc score stretching is forbidden
- evaluator-generated labels are not ground truth
- reports lead with no more than three evidence-backed producer actions
- engineering-prior audio confidence is capped at 0.92 until held-out reviews validate each estimator
- user reviews are future-version labels; they never modify the run being reviewed

## Public Workflow

Analyze one or more audio/MIDI files:

```powershell
bun run synaesthetic:analyze -- "C:\Music\Full Filename.mp3" "C:\Music\Another.mid"
bun run synaesthetic:analyze -- --score 0.95 "C:\Music\Listener Labeled.mp3"
```

Start the persistent report library in the background:

```powershell
bun run synaesthetic:start
```

Use `bun run synaesthetic:serve` only when foreground logs are desired. The background command health-checks the loopback API and writes PID metadata plus stdout/stderr logs beside the database.

Open `http://127.0.0.1:3217`. Each CLI result prints its full filename, score, and immutable `/runs/<id>` URL. The old `report-builder.ts --track` entry is a compatibility shim that persists the evaluation and returns the same URL; it no longer creates duplicated standalone report templates.

The default Windows database is:

```text
%LOCALAPPDATA%\PadPilot\synaesthetic-evaluator\evaluations.sqlite
```

Overrides:

```text
PADPILOT_EVALUATOR_DB_PATH
PADPILOT_EVALUATOR_PORT
```

## Deep Boundary

The scientific core has two conceptual stages:

```ts
analyze media -> versioned observations and timelines
score observations -> five dimension votes, safety, actions, overall
```

The persistence caller is deliberately smaller:

```ts
const library = openEvaluationLibrary();
const reports = await library.evaluateFiles(paths);
library.close();
```

File decoding, hashing, deduplication, migrations, normalization, SQL, and dashboard URLs stay behind the library.

## Result Semantics

Metric identity is medium-specific:

```text
audio.musical.tonal-intent
audio.rhythm.pulse-coherence
audio.structure.section-development
audio.mix.translation-readiness
audio.emotion.embodied-impact

midi.harmony.tonal-center
midi.harmony.chord-progression
midi.rhythm.pulse-coherence
midi.structure.section-development
```

Every metric exposes:

```ts
{
  id,
  dimension,
  facet,
  score,
  confidence,
  valid,
  status,
  evidence,
  summary
}
```

`score` is `null` when evidence is unavailable or unreliable. Legacy compatibility adapters may retain a numeric field but cannot use it as the authoritative result. Examples:

- mono input: stereo-width is not applicable
- weak beat inference: groove evidence is unreliable/downweighted
- ambiguous tonality: conventional key-fit is unavailable, not bad
- no vocal evidence: vocal-specific metrics are not applicable

## Aggregation

V3 uses five dimensions:

| Dimension | Responsibility |
| --- | --- |
| Musicality | melody, harmony, phrase intent, recurrence |
| Groove | pulse, beat/bar placement, syncopation, timing stability |
| Structure | repetition, contrast, boundaries, transitions, development/complexity |
| Sound quality | safety, translation, masking risk, harshness, dynamics, spatial compatibility |
| Emotional impact | low-frequency drive, tension/release, arousal and dynamic arc |

Audio has one score vote per dimension:

```text
musicality       <- audio.musical.tonal-intent
groove           <- audio.rhythm.pulse-coherence
structure        <- audio.structure.section-development
sound quality    <- audio.mix.translation-readiness
emotional impact <- audio.emotion.embodied-impact
```

Each vote may combine multiple raw observations, but those observations remain evidence inside that vote. They do not independently contribute to the overall score. Dimensions aggregate once into the overall result. Missing evidence lowers coverage and report confidence instead of becoming zero.

Safety is applied only after the quality score and remains visible:

```text
overall = min(preCapOverall, applicableSafetyCaps)
```

There is no raw score, calibrated score, calibration delta, contrast stretch, or final taste penalty stack.

The current evidence-to-score curves are transparent engineering priors, not listener-validated taste models. Their confidence cannot exceed `0.92`; this prevents duration and non-silence from masquerading as perceptual certainty. Change a curve only with an adversarial fixture, metamorphic invariant, or a diverse held-out listener set. Never tune an overall correction against the same tracks used to judge it. Listener validation must report sample count, label spread, held-out error, rank correlation, and per-genre residuals before a curve can be called calibrated.

## Audio Analysis

The audio path preserves source sample rate and channel count and analyzes at full audible bandwidth rather than the old 12 kHz/6 kHz-Nyquist path. Downsampling uses a low-pass anti-alias stage. The observation layer exposes frame timelines so reporting does not have to reanalyze the file.

Current evidence families include:

- perceptual/ERB-style spectral bands and spectral slope
- separate sub-bass drive/foundation and low-frequency balance evidence
- spectral centroid, spread/entropy/flatness, flux, rolloff, per-frame motion
- chroma, key confidence, harmonic motion, tonal ambiguity
- onset/pulse confidence, tempo stability, groove evidence
- section-level features, contrast, recurrence, and self-similarity inputs
- dynamics, crest behavior, silence ratio, DC/non-finite validation
- integrated loudness descriptors and peak/clipping risk
- stereo width/correlation applicability and mono compatibility evidence

Sub-bass is not an inherent defect. In V3.1 low-frequency drive contributes once, inside embodied/emotional impact; it does not receive a second groove vote. Sound quality falls only when evidence demonstrates translation risk, excessive temporal occupancy, distortion, unstable dynamics, or low-end masking risk. A mixture-only analysis must say “overlap risk”; it cannot claim that kick masks bass or vocals are masked without stems/source evidence.

Structure scoring separates adjacent similarity from distant recurrence. A static loop with uniformly high self-similarity no longer looks like developed A–B–A form. Distant recurrence is rewarded only alongside contrast/novelty, and the provisional structure metric retains score headroom instead of saturating at 1.0.

Harshness is not high-frequency energy alone. It combines full-band high-frequency behavior with noise/flatness, transient density/crest, sustained resonant prominence, and distortion evidence. Bright cymbals are not automatically treated as aliasing.

Loudness is descriptive and safety-related, not a quality reward. BS.1770/R128 is the conformance target. The current in-process baseline reports an integrated-loudness estimate, loudness variation, decoded/sample peak, DC, silence, non-finite samples, and sustained flat-top evidence. Peak/loudness advisories do not cap ordinary mastered music; only high-confidence severe faults do. Before these fields are advertised as standards-conformant LUFS/true peak, the implementation still needs K-weighted gating, oversampled intersample peak measurement, and validation against official test signals.

## MIDI Analysis

MIDI V2 respects the file PPQ, tempo meta-events, and time-signature meta-events. It reports four applicable dimensions (sound quality is audio-only) through source-specific `midi.*` metrics.

Harmony evidence includes:

- key confidence without forced-key punishment
- scale fit when conventional tonality is applicable
- chord/root progression and recurrence
- harmonic rhythm
- cadence strength
- voice-leading distance

Rhythm evidence includes:

- beat/bar/downbeat consistency
- onset-to-grid placement
- syncopation and swing ratio
- inter-onset interval distribution
- tempo stability
- rhythmic recurrence

Melody and structure evidence includes:

- range, contour, interval distribution, leap resolution, rests, motif recurrence, climax location
- pitch/rhythm/velocity section vectors
- self-similarity, repetition, contrast, phrase boundaries, and dynamic/tension arc

Empty/random/static inputs are handled explicitly. Intentional chromatic, modal, blues, or dissonant material lowers conventional-tonality confidence instead of automatically lowering musical quality.

## Persistence

SQLite uses WAL, foreign keys, bounded series, and immutable evaluator runs. Media deduplicates by content SHA-256; a file moved to another path becomes another source location for the same media. A changed evaluator fingerprint creates a new run. Failed analyses persist as failed runs with `overall = NULL`, not fake zero scores.

The database stores:

- media metadata and source locations
- evaluator fingerprint/status/result JSON
- normalized dimension and metric results
- evidence/diagnoses
- Float32 time-series BLOBs with timing metadata
- run history
- listener-score history attached to content-deduplicated media
- immutable structured review revisions with action verdicts, intent/style tags, optional dimension targets, confidence, and calibration consent

Review dataset assignment hashes the media content, not the run or review. Every render with identical bytes therefore remains in one stable `train`, `validation`, or `test` split. Exports select only the newest calibration-eligible review per media item so repeated opinions cannot silently overweight one song. Dataset readiness stays false until there are at least 100 unique media, all three split cohorts are populated, and labels have useful spread. A future evaluator may fit named evidence-to-score curves on the train split and evaluate them on held-out splits; it may not fit a post-hoc overall correction.

The HTTP server binds only to `127.0.0.1`. It exposes library, immutable run, time-series, track-history, review-dataset summary/export, and bounded review writes. Mutations reject cross-origin requests. It never accepts an arbitrary file path for web-triggered evaluation; analysis remains CLI/library-driven.

## Dashboard

The dashboard is a separate Solid browser bundle, so D3/uPlot do not enter the embedded VST UI bundle.

Reports prioritize decisions over repeated diagnostics: hard safety faults, then up to three producer actions, then the five dimensions. Detailed metrics, source metadata, and one selected timeline signal are collapsed or selected on demand. The old contributor list is omitted because it restated dimension and metric information.

Every producer action contains an observation, likely audible impact, bounded steps, a verification criterion, confidence, stable ID, and—when the supporting timeline permits it—the measured passage to inspect first. Claims stay at the evidence boundary: mixture-only evidence can recommend checking separation, but cannot assert which stem caused a problem.

The review panel captures an overall listener target, confidence, style/intent tags, optional dimension targets, notes, and a verdict for each proposed action (`helpful`, `wrong`, `intentional`, or `fixed`). Saving creates a revision; it never overwrites an earlier opinion or changes the displayed V3.1 score.

- `@dschz/solid-uplot`: measured loudness, centroid, flux, tension, dynamics, groove/pulse, and section timelines
- `d3-scale`: score positions and perceptual mappings
- `d3-shape`: overall score arc and sparse section macro curve
- `d3-interpolate`: self-similarity color scale
- custom SVG: ERB profile, section development, self-similarity matrix

Catmull-Rom smoothing is used only for sparse section summaries, never raw measurements. Missing samples render as gaps.

Metric and dimension labels share their diagnostic tooltip with the corresponding bar. The shared `FloatingLayer` renders through the Solid overlay portal with fixed positioning and viewport collision handling. Virtual anchor rectangles support chart-cursor tooltips, so no tooltip is clipped by or resizes a parent panel.

## Validation

Required adversarial fixtures:

- silence, DC, NaN/Infinity
- white/pink noise
- perfectly quantized static loop
- random MIDI
- one sustained chord
- graded severe clipping and loudness maximization
- intentionally dissonant/modal material
- unusual-but-good music
- clean but genre-mismatched audio

Required metamorphic checks:

- gain changes after analysis normalization do not change musical dimensions materially
- 44.1/48 kHz renders remain stable
- 128/320 kbps encodes remain close unless audible codec evidence changes sound quality
- mono makes stereo evidence unavailable instead of bad
- prepended silence is handled by loudness/content gates

The two Sriracha encodes are a permanent codec-invariance case: their musical dimensions should remain near-identical even though source bitrate metadata differs. Listener labels must be split into fitting and held-out validation sets; never fit thresholds and report validation on the same songs.

V3 acceptance checks also watch score spread, exact-bound saturation, unavailable-metric handling, action count, and dimension duplication. A release fails if audio emits anything other than one vote for each of the five dimensions, a hard safety fixture escapes its cap, or an unavailable metric is serialized as zero.

Optional learned embeddings remain a deferred adapter boundary and are unavailable when no model is configured. A permissively licensed/checksummed model still needs to be selected and held-out listener validation established before it may affect a score. It may later support reference/genre/mood/instrumental-vocal consistency with a fixed small facet budget, but cannot own safety or the entire score.

## Source Map

- Audio extraction: `apps/pad-pilot/scripts/synaesthetic-evaluator/audio-utils.ts`
- Audio scoring: `apps/pad-pilot/scripts/synaesthetic-evaluator/audio-skill-manager.ts`
- Shared audio aggregation: `apps/pad-pilot/scripts/synaesthetic-evaluator/evaluation-schema.ts`
- MIDI extraction: `apps/pad-pilot/scripts/synaesthetic-evaluator/midi-utils.ts`
- MIDI scoring: `apps/pad-pilot/scripts/synaesthetic-evaluator/midi-evaluator-v2.ts`
- Routing: `apps/pad-pilot/scripts/synaesthetic-evaluator/orchestrator.ts`
- Persistence/library: `apps/pad-pilot/scripts/synaesthetic-evaluator/evaluation-store.ts`, `evaluation-library.ts`
- Server/CLI: `apps/pad-pilot/scripts/synaesthetic-evaluator/evaluation-server.ts`, `evaluation-cli.ts`
- Dashboard: `apps/pad-pilot/scripts/synaesthetic-evaluator/dashboard/`
- Compatibility report entry: `apps/pad-pilot/scripts/synaesthetic-evaluator/report-builder.ts`
