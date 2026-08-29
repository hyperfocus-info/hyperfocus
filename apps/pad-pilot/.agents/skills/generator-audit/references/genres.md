# Genres And Groove Dialects

Use this lane when auditing genre options, era/style conflation, groove tags, instrument palettes, BPM inference, or cultural/style specificity.

## Genre Matrix

Every genre needs a concrete matrix. Avoid single "profile preset" answers for mature labels.

```md
Genre:
Tempo range:
Meter/grid:
Swing/microtiming:
Kick/snare grammar:
Hat/percussion grammar:
Bass role:
Chord rhythm:
Harmony density:
Melody/riff grammar:
Form arc:
Instrument palette:
Production cues:
Avoid:
Close neighbors:
Must not collapse into:
```

## High-Risk Clusters

- House/techno/garage/trance: shared club grid, but different bass, chord stab, swing, sound design, and form rules.
- Hip-hop/trap/drill/phonk/pluggnb/cloud rap: 808 behavior, sample feel, swing, melodic density, and harmony differ sharply.
- Soul/R&B/gospel/jazz: guide tones, passing diminished, rootless voicing, call-response, and human timing matter more than generic "warm chords".
- Latin/Afro/Amapiano/Dancehall/Reggaeton/Baile Funk: clave, dembow, log drum, percussion interlock, and regional production are not interchangeable.
- Cinematic/orchestral/trailer/ambient/drone: form arc, register, sustain, impact design, and sparse harmony need separate handling.
- Experimental/IDM/glitch/hyperpop/industrial: rule-breaking must still have recurrence and intentional event grammar.
- Raga/maqam/world scale labels: equal-tempered MIDI scale approximations need disclosure or constrained use.

## Naive Signals

- A genre maps only to instrument names and not rhythm cells.
- BPM is inferred from broad text with no per-genre range.
- "Latin" or "Afro" becomes one global bucket.
- A genre has no negative examples.
- Era label overrides genre grammar.
- Long loops repeat 4 bars rather than changing phrase function.
- Same quality metrics decide gospel, drill, ambient, and techno.

## Research Method

1. Start from current inventory snapshot.
2. Select top user-facing genres and create matrix rows.
3. For each row, verify current prompt tags, style DNA, fallback generator, and quality gate.
4. Add or change primitives only where they produce testable output differences.
5. Pair every new primitive with a validation metric or fixture.

## Research Links

- Berklee contemporary style arranging overview: https://online.berklee.edu/courses/arranging-and-producing-contemporary-music-styles
- Berklee groove writing: https://online.berklee.edu/takenote/how-to-write-songs-with-groove/
- Berklee clave basics: https://pulse.berklee.edu/?id=4&lesson=14
- Open Music Theory 3-2 son clave: https://musictheory.pugetsound.edu/mt21c/ThreeTwoClave.html
