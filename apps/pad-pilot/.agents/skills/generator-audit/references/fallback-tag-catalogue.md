# Fallback Tag Catalogue

Use this catalogue when expanding `fallbackInstrumentPalettes`, `fallbackBpm`, or tests in `codex-client.ts`.

## Current Coverage

- Buckets: 12
- Bucketed tags: 472 unique tags
- Rule: exact user/raw tags should outrank inferred selector/style tags. Inferred tags still guide ties and compatible blends.

## Research Base

- Berklee rhythm-section arranging frames practical arrangement around drums, bass, guitar, keyboards, form, dynamics, articulation, and emotional contour: https://online.berklee.edu/courses/arranging-1-rhythm-section
- Berklee groove writing treats one- or two-bar grooves as a song backbone that influences rhythm, harmony, lyric/melodic image, and tempo feel: https://online.berklee.edu/takenote/how-to-write-songs-with-groove/
- Open Music Theory phrase study treats phrases as goal-directed musical thoughts, commonly 4, 8, or 16 measures, with repeated or varied basic ideas: https://viva.pressbooks.pub/openmusictheory/chapter/phrase-archetypes-unique-forms/
- Beatport's open-format list shows modern genre/subgenre taxonomy is broad and overlapping, so fallback logic should use reusable tags rather than custom genre branches: https://greenroomsupport.beatport.com/hc/en-us/articles/41043520429076-Beatport-Genres-Including-NEW-Open-Format-Genres
- Drill references emphasize 140-150 BPM half-time feel, sparse/syncopated drums, tresillo/triplet hats, dark minimal harmony, sliding 808s, and haunting motifs: https://edu.soundation.com/make-music/music-genres/how-to-make-drill and https://djmag.com/longreads/evolving-sound-uk-drill
- EDM tempo references put house around 115-132, techno 130-150, dubstep 138-142, drum and bass 160-180, UK garage 128-135, future bass 130-160, amapiano 108-118, and ambient/downtempo lower and wider: https://vibesdj.io/dj-tools/edm-genre-chart

## Bucket Matrix

### retro-synth-electro

- Tempo: 112 default; allow 80s/synth/city-pop slower, electro/disco faster.
- Grid: straight or sequenced pulse; medium syncopation.
- Leads: saw, square, fifths, arps, bright top-line hooks.
- Chords: Juno/analog keys, synth strings, clean triads/sevenths.
- Drums: Linn/electro/arcade kit, tight repeatable fills.
- Bass: synth root/pedal or bass-and-lead motion.
- Texture: warm/sweep/halo pads.
- Avoid: acoustic band default, overly human loose timing, dense jazz reharm.
- Repair hints: quantize to clean grid; keep motif loop identity; preserve synth names over piano/guitar defaults.

### 808-drill-trap-rap

- Tempo: 140 default; half-time perceived pulse.
- Grid: half-time, straight/triplet/tresillo details, sparse downbeat logic.
- Leads: haunted bell, koto, vocal chop, dark motif cells.
- Chords: dark bells, tense plucks, cold pads, narrow voicings.
- Drums: drill/trap kit, syncopated snares, fast hat/percussion accents.
- Bass: sliding 808, sub glide, phrase-end bass answers.
- Texture: woozy chime, cold atmosphere, dark pad.
- Avoid: busy chord comping, cheerful major gloss, generic house pulse.
- Repair hints: cap chord clusters tightly; preserve 808 lane; nudge off-grid hats, do not rewrite decent motifs.

### dusty-hip-hop-lofi

- Tempo: 88 default.
- Grid: boom-bap backbeat, laid-back/swing pocket.
- Leads: muted guitar, vibraphone, smoky sax.
- Chords: dusty electric piano, muted keys, jazz guitar.
- Drums: dusty boom-bap, cassette kit, loose breaks.
- Bass: finger, fretless, upright.
- Texture: vinyl pad, tape choir, dust.
- Avoid: glossy club kick, hyper-quantized hats, festival synth palette.
- Repair hints: keep loose timing inside tolerance; reduce over-dense support; protect sample-like phrase repetition.

### soul-jazz-gospel-funk

- Tempo: 96 default.
- Grid: human pocket, swing/laid-back when tagged, syncopated comping.
- Leads: clean guitar, harmonica, tenor sax, call-response fills.
- Chords: organ, electric piano, guitar chords, guide tones/rootless voicings.
- Drums: brush/soul/gospel kit with fills.
- Bass: electric/upright/fretless, walking or live passing motion.
- Texture: choir, rotary organ, warm brass.
- Avoid: sparse two-note trap harmony when user asks warm/dense chords.
- Repair hints: require harmonic cluster floor for dense tags; add guide tone layer before random counterlines.

### cinematic-ambient-orchestral

- Tempo: 72 default.
- Grid: slow arc, sparse pulse, long sustain.
- Leads: French horn, oboe, violin, phrase-resolving lines.
- Chords: slow strings, ensemble strings, choir.
- Drums: orchestral/trailer/timpani accents.
- Bass: contrabass, cello, tuba.
- Texture: bowed pad, atmosphere FX, mystic choir.
- Avoid: constant four-on-floor, short arcade loops, dense non-stop melody.
- Repair hints: protect long notes; phrase-end impacts matter more than hat density.

### breaks-dnb-garage

- Tempo: 172 default.
- Grid: double-time breaks, two-step skips, syncopated kick/snare answers.
- Leads: liquid/chiff/air lead, short riff cells.
- Chords: atmospheric pad, glass keys, air chords.
- Drums: amen/jungle/garage kit.
- Bass: reese, sub, liquid movement.
- Texture: sweep atmosphere, new age pad, bowed texture.
- Avoid: straight quarter-note drum logic, slow static bass.
- Repair hints: keep breaks dense but bounded; retain phrase fills; do not quantize away syncopated identity.

### house-techno-club

- Tempo: 124 default.
- Grid: four-on-floor, offbeat pump, quantized club discipline.
- Leads: pluck, acid, mono synth.
- Chords: house piano, organ stab, chord stab.
- Drums: club/warehouse/dub-techno kit.
- Bass: deep house, picked, rubber/offbeat pulse.
- Texture: warm/poly/sweep pads.
- Avoid: missing kick pulse, non-looping chord comp, random trap hats.
- Repair hints: restore offbeat bass lane; keep chord stabs short; phrase fills every 4/8/16 bars.

### experimental-glitch-industrial

- Tempo: 150 default.
- Grid: broken grid, odd-meter feel, irregular fills.
- Leads: bitcrush, charang, alien.
- Chords: metallic pad, FM keys, glitch chords.
- Drums: glitch/broken/industrial kit.
- Bass: FM, distorted, picked.
- Texture: soundtrack/crystal/sci-fi FX.
- Avoid: random note spray without recurrence, too-clean pop progression.
- Repair hints: require motif recurrence before accepting chaos; preserve intentional stutters.

### global-latin-afro-dancehall

- Tempo: 108 default.
- Grid: clave, dembow, 3+3+2, interlocking percussion.
- Leads: flute, pan flute, koto.
- Chords: nylon guitar, marimba, kalimba.
- Drums: percussion, Afrobeat, Dancehall.
- Bass: finger, acoustic, slap.
- Texture: shakuhachi, kalimba, world pad.
- Avoid: flattening to straight hats only; collapsing Afro/Latin/Dancehall into one drum cell.
- Repair hints: preserve percussion interlock; add accents over dense chord rewrites.

### bass-festival-wave

- Tempo: 140 default.
- Grid: half-time/drop-ready, wide 140 bass music lane, wave can feel slower.
- Leads: supersaw, chiptune, wave pluck.
- Chords: supersaw, glass pad, wide stabs.
- Drums: dubstep, festival trap, riddim.
- Bass: wobble sub, festival sub, wave bass.
- Texture: noise sweep, digital choir, crystal FX.
- Avoid: acoustic soul/guitar default, tiny bass, unmarked drop structure.
- Repair hints: preserve sub/drop role; add transition hits instead of busy comping.

### guitar-rock-shoegaze

- Tempo: 116 default.
- Grid: straight or driving live pocket; math tags can imply odd grouping.
- Leads: clean guitar riff, overdriven lead, feedback lead.
- Chords: overdriven/clean/open guitar chords.
- Drums: indie, shoegaze, math-rock.
- Bass: picked, fretless, electric.
- Texture: feedback pad, guitar wash, choir pad.
- Avoid: EDM-only drum grid, piano default, no riff callback.
- Repair hints: preserve riff identity and open voicings; allow sustained texture.

### neutral-balanced

- Tempo: seeded 92-148 unless no stronger tag exists.
- Grid: balanced default; support all required lanes without strong dialect claims.
- Leads: square lead, clean guitar, vibraphone.
- Chords: grand piano, electric piano, warm keys.
- Drums: session/studio/tight kit.
- Bass: electric, synth, upright.
- Texture: warm/choir/poly pad.
- Avoid: silently using this bucket when any stronger tag exists.
- Repair hints: log neutral fallback clearly; use as last resort only.

## Expansion Rule

When adding a tag, add it to exactly one primary bucket unless two tags intentionally model a hybrid. If a direct user tag and inferred style tag conflict, direct user tag wins. Add a fixture when a new bucket prevents generic fallback.
