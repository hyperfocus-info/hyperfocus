# Generator Audit Static Report

Generated: 2026-06-16T18:47:57.305Z

## Selector Inventory

| Group | Count | Duplicate labels | Duplicate ids |
| --- | ---: | --- | --- |
| Genres | 100 | none | none |
| Moods | 100 | none | none |
| Eras | 100 | none | none |
| Complexity | 100 | none | none |
| Scales/Modes | 100 | none | none |

Total selector labels: 500

## Rule Counts

- Selector tag regex rules: 18
- Intent tag regex rules: 21
- Magic profile presets: 12
- Genre profile mappings: 100
- Magic interaction factors: 7
- Style DNA keyword rules: 21
- Fallback instrument palettes: 12
- Fallback bucketed tags: 472 unique tags
- Fallback palette tag coverage: retro-synth-electro (54 tags: synthwave, retro-future, 80s, analog, darkwave, ...); 808-drill-trap-rap (74 tags: drill, uk-drill, brooklyn-drill, trap, modern-trap, ...); dusty-hip-hop-lofi (45 tags: lofi, lo-fi, boom-bap, jazz-hop, trip-hop, ...); soul-jazz-gospel-funk (54 tags: blues, gospel, soul, rnb, r-and-b, ...); cinematic-ambient-orchestral (40 tags: cinematic, orchestral, trailer, trailer-hybrid, hollywood, ...); breaks-dnb-garage (38 tags: liquid, liquid-drum-and-bass, drum-and-bass, dnb, jungle, ...); house-techno-club (50 tags: house, deep-house, techno, minimal, minimal-tech, ...); experimental-glitch-industrial (28 tags: glitch, glitch-hop, idm, industrial, hyperpop, ...); global-latin-afro-dancehall (41 tags: afro, afrobeat, amapiano, reggaeton, dancehall, ...); bass-festival-wave (24 tags: jersey-club, future-bass, hardwave, wave, dubstep, ...); guitar-rock-shoegaze (28 tags: post-rock, garage-rock, indie-dance, shoegaze, math-rock, ...); neutral-balanced (20 tags: general, neutral, balanced, any, dense, ...)

## Prompt Budget

- System directive chars: 2986
- System directive non-empty lines: 35
- System directive bullet rules: 29
- buildPrompt string/template entries: 20
- Duplicate/overlap hints present: Do not cap the number of tracks, No fixed track cap, Every track must contain, Every track must have notes, Use Theme/Groove tags

## Handoff Map

| Symbol | Source | Line |
| --- | --- | ---: |
| buildGeneratorSelectorPromptLines | apps/pad-pilot/ui/src/modules/generator/utils/generator-options.ts | 423 |
| buildGeneratorIntentPromptLines | apps/pad-pilot/ui/src/modules/generator/utils/generator-options.ts | 411 |
| buildMagicSuggestion | apps/pad-pilot/ui/src/modules/generator/utils/generator-options.ts | 1168 |
| SYSTEM_DIRECTIVE | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 242 |
| buildMusicianPlan | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 1034 |
| buildPrompt | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 1213 |
| requestLocalTracker | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 4249 |
| parseDeltaTickTracker | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 1285 |
| applyStyleDnaFilter | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 2666 |
| scoreGeneratorComposition | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 1523 |
| buildFallbackTracker | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 4041 |
| generateMidiTemplate | apps/pad-pilot/ui/src/modules/generator/utils/generator-client.ts | 4322 |

## First Audit Questions

- Which selector labels lack concrete genre primitives?
- Which prompt rules duplicate system/user constraints?
- Which style DNA or massage steps can override good model output?
- Which quality metrics are generic where genre-specific checks are needed?
- Which handoff artifacts should be typed instead of inferred from text?

