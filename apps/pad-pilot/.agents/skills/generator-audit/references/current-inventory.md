# Generator Audit Static Report

Generated: 2026-08-29T22:08:19.828Z

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

- Selector tag regex rules: 34
- Intent tag regex rules: 35
- Magic profile presets: 31
- Genre profile mappings: 129
- Magic interaction factors: 9
- Style DNA keyword rules: 25
- Fallback instrument palettes: 19
- Fallback bucketed tags: 486 unique tags
- Fallback palette tag coverage: retro-synth-electro (54 tags: synthwave, retro-future, 80s, analog, darkwave, ...); 808-drill-trap-rap (74 tags: drill, uk-drill, brooklyn-drill, trap, modern-trap, ...); amapiano-log-drum (12 tags: amapiano, log-drum, durban, durban-2020, amapiano-2021, ...); dembow-dancehall-reggaeton (10 tags: reggaeton, dembow, moombahton, syncopated, offbeat-stabs, ...); dancehall-one-drop (7 tags: dancehall, one-drop, one-drop-skank-space, island-skank, offbeat-skank, ...); baile-funk-tamborzao (12 tags: baile, baile-funk, funk-carioca, tamborzao, tamborzão, ...); latin-acoustic-clave (11 tags: latin, bossa, bossa-nova, salsa, samba, ...); afrobeat-afro-house (10 tags: afro, afrobeat, afro-house, afro-tech, lagos-2022, ...); dusty-hip-hop-lofi (45 tags: lofi, lo-fi, boom-bap, jazz-hop, trip-hop, ...); bright-pop-neutral (12 tags: happy, joyful, uplifting, bright, optimistic, ...); soul-jazz-gospel-funk (50 tags: blues, gospel, soul, rnb, r-and-b, ...); cinematic-ambient-orchestral (40 tags: cinematic, orchestral, trailer, trailer-hybrid, hollywood, ...); breaks-dnb-garage (38 tags: liquid, liquid-drum-and-bass, drum-and-bass, dnb, jungle, ...); house-techno-club (50 tags: house, deep-house, techno, minimal, minimal-tech, ...); experimental-glitch-industrial (28 tags: glitch, glitch-hop, idm, industrial, hyperpop, ...); global-latin-afro-dancehall (13 tags: afro, latin, clave, global, three-three-two, ...); bass-festival-wave (24 tags: jersey-club, future-bass, hardwave, wave, dubstep, ...); guitar-rock-shoegaze (31 tags: post-rock, garage-rock, indie-dance, dance-punk, folk, ...); neutral-balanced (20 tags: general, neutral, balanced, any, dense, ...)

## Prompt Budget

- System directive chars: 3519
- System directive non-empty lines: 39
- System directive bullet rules: 28
- buildPrompt string/template entries: 24
- Duplicate/overlap hints present: Intent Tags:

## Handoff Map

| Symbol | Source | Line |
| --- | --- | ---: |
| buildGeneratorSelectorPromptLines | ui/src/modules/generator/utils/generator-selector-options.ts | 322 |
| buildGeneratorIntentPromptLines | ui/src/modules/generator/utils/generator-selector-options.ts | 310 |
| buildMagicSuggestion | ui/src/modules/generator/utils/generator-magic-options.ts | 340 |
| SYSTEM_DIRECTIVE | ui/src/modules/generator/utils/generator-prompt.ts | 8 |
| buildMusicianPlan | ui/src/modules/generator/utils/generator-style-dna.ts | 676 |
| buildPrompt | ui/src/modules/generator/utils/generator-prompt.ts | 189 |
| requestLocalTracker | ui/src/modules/generator/utils/generator-client.ts | 16 |
| parseDeltaTickTracker | ui/src/modules/generator/utils/generator-tracker.ts | 65 |
| applyStyleDnaFilter | ui/src/modules/generator/utils/generator-massage-orchestrator.ts | 12 |
| scoreGeneratorComposition | ui/src/modules/generator/utils/generator-tracker.ts | 670 |
| buildFallbackTracker | ui/src/modules/generator/utils/generator-fallback.ts | 514 |
| generateMidiTemplate | ui/src/modules/generator/utils/generator-client.ts | 174 |

## First Audit Questions

- Which selector labels lack concrete genre primitives?
- Which prompt rules duplicate system/user constraints?
- Which style DNA or massage steps can override good model output?
- Which quality metrics are generic where genre-specific checks are needed?
- Which handoff artifacts should be typed instead of inferred from text?

