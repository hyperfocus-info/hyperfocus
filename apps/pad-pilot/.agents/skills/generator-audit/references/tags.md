# Tags And Selector Inventory

Use this lane when auditing `genre`, `mood`, `era`, `complexity`, `scaleKey`, selector tags, theme/groove tags, Magic Suggestion profiles, aliases, and inventory growth.

## Current Surfaces

- Selector labels: `genreLabels`, `moodLabels`, `eraLabels`, `complexityLabels`, `scaleLabels`.
- Selector-to-prompt tags: `selectorTagRules`, `selectorFallbackTags`, `buildGeneratorSelectorPromptTags`.
- AI intent metadata: `intentTagAliases`, `intentTagRules`, `buildGeneratorIntentPromptLines`.
- Magic graph: `profilePresets`, `GENERATOR_MAGIC_GENRE_PROFILES`, `magicInteractionFactors`, `advancedProfileTargets`.
- Style DNA downstream: `dnaKeywordRules` in `codex-client.ts`.
- Fallback bucket catalogue: [fallback-tag-catalogue.md](fallback-tag-catalogue.md).

## Ontology Target

Genre is just one way to express song theme. A tag like `happy`, `haunting`, `808-slide-pocket`, `strummed-comping`, `tokyo-city-pop`, or `drill` must all flow through the same tag-first ontology. Never add bespoke `if genre === ...` behavior when a normalized tag can carry the primitive.

Each option should resolve into concrete primitives:

- Tempo envelope and loop length bias.
- Meter/grid: straight, swing, triplet, half-time, double-time, clave, 3+3+2.
- Drum grammar: kick/snare roles, hats, percussion, fills, phrase boundaries.
- Bass role: root, pedal, 808 lead, offbeat pump, walking/live, reese/sub movement.
- Harmonic rhythm: static, slow, loop, active, passing.
- Harmonic density: triads, sevenths, extended, altered, sparse/no-chord.
- Voicing: range, inversion, rootless, spread, strum/roll behavior.
- Melody role: hook, riff, counterline, call-response, texture.
- Form arc: static loop, turnaround, build/drop, cinematic arc.
- Instrument dialect and GM program families.
- Avoid list: what would make the tag sound wrong.

## Naive Signals

- One label mixes ontology layers: genre, era, mood, production process, and complexity all in one dropdown.
- Mood options encode arrangement facts (`Sparse`, `Dense`, `Swung`, `Locked In`) but are treated as emotional color.
- Era options duplicate genre labels, causing circular profile scoring.
- Scales combine Western modes, bebop scales, ragas, maqam, and microtonal traditions as if equal-tempered pitch sets.
- Broad regexes map distinct cultures into one bucket, e.g. Afro, Latin, Amapiano, Baile Funk, Dancehall.
- Magic profiles collapse many genres into a small preset set without per-genre `avoid` rules.
- Tags are only descriptive words, not binding constraints with validator coverage.
- Slugs collide or aliases normalize culturally distinct terms.
- Fallback instrument palettes are keyed by genre/regex instead of normalized tags.
- A single tag cannot supply a complete lead/chord/drum/bass bucket.

## Audit Method

1. Run static inventory script and check counts, duplicates, unmapped labels, and broad buckets.
2. Pick one overloaded cluster, then build a per-label primitive matrix.
3. Compare selector label, prompt tags, style DNA, fallback generator, and quality gate. A label is mature only when all five agree.
4. Flag missing negatives. Good tags say what not to do.
5. Propose narrow tag primitives before adding more labels or genre-specific branches.

## Per-Label Template

```md
Label:
Layer: genre | mood | era | complexity | scale
Tempo:
Grid/microtiming:
Drum grammar:
Bass role:
Harmony:
Melody:
Form:
Instrumentation:
Production era:
Avoid:
Prompt tags:
Validator metric:
Fallback behavior:
```

## Fallback Tag Inventory Rule

Use [fallback-tag-catalogue.md](fallback-tag-catalogue.md) as the canonical bucket matrix.

Every fallback bucket must be declared as tag inventory:

```md
Tags:
Tempo:
Lead bucket:
Chord bucket:
Drum bucket:
Bass bucket:
Texture bucket:
Avoid:
Repair hints:
```

If a new selector or typed note creates a normalized tag, either it must match an existing bucket or fall back to a neutral bucket explicitly marked as neutral. Silent genre fallback is a bug.

## Research Links

- Open Music Theory phrase hierarchy: https://viva.pressbooks.pub/openmusictheory/chapter/phrase-archetypes-unique-forms/
- Berklee groove writing note: https://online.berklee.edu/takenote/how-to-write-songs-with-groove/
- Berklee clave lesson: https://pulse.berklee.edu/?id=4&lesson=14
