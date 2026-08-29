# FX preset catalog study

Updated: 2026-08-22

## Outcome

PadPilot ships 63 FX chain presets:

- 1 system state: Blank State.
- 18 task-oriented utility chains.
- 13 creative chains for fast sound design, including Lush Foundation (the startup preset ID retained for compatibility).
- 31 era/genre chains covering every decade from the 1950s through the 2020s.

Market findings, utility definitions, quality gates, and the beta scorecard live in [FX preset market, quality, and beta plan](fx-preset-market-quality-and-beta.md).

Era/genre presets are production starting points, not claims of circuit-perfect hardware emulation. Each chain translates a documented production practice into PadPilot's public 19-node FX graph. Unsupported techniques are not named or implied: PadPilot currently has no spring-reverb model, de-esser, flanger, sidechain compressor, or modeled console brand.

## Previous catalog audit

Original 12-chain catalog had strong creative breadth but weak production retrieval:

| Dimension | Previous coverage | Gap |
| --- | --- | --- |
| Mood | Dreamy, dark, bright, dirty, warm, rhythmic, experimental | Good |
| Era | Vintage only as broad adjective | No decade-specific intent |
| Genre | None named directly | Hard to find familiar production starting points |
| Source use | Mostly unspecified | No vocal, drum, bass, guitar, synth, send, or bus guidance |
| Historical topology | Tape, plate, rotary available independently | Few historically recognizable effect orders |
| Mono/stereo intent | Mostly wide stereo | Little 1950s/1960s mono or bass-mono discipline |
| Digital generations | Generic clean/digital | No early-rack, 12-bit sampler, 808/909, or modern hard-clip vocabulary |

Existing creative presets remain intact. New catalog adds retrieval dimensions without replacing mood-based sound design.

## Research-to-DSP rules

1. Anchor each preset to documented technique, device behavior, or genre workflow.
2. Reproduce topology and audible intent before cosmetic labels.
3. Keep values inside actual public node control contracts.
4. Avoid trademark mimicry when PadPilot lacks matching circuit architecture.
5. Use conservative gain staging; saturation and compression chains reduce output where needed.
6. Keep sub-bass mono in bass-heavy modern presets.
7. Treat insert approximations of historical send effects as starting points; users can lower node mix for source context.

Examples:

- Sun slapback uses one low-feedback 135 ms mono tape echo. Sun documents Phillips' second-recorder tape-delay method; an audio-analysis paper measured roughly 134–137 ms.
- Abbey ADT uses a 10 ms chorus voice plus small analog pitch drift. Abbey Road documents normal ADT offsets around 8–12 ms and manually varied tape speed.
- 1980s gated snare places a large digital room before a hard gate. AMS/Yamaha documentation describes nonlinear or gated programs that abruptly remove reverb tails.
- Boom-bap sampler uses 12-bit reduction, mild downsampling, filtered top end, compression, then slow tape. Rossum documents the SP-1200's 12-bit, 26.04 kHz character and aliasing artifacts.
- Dub-techno chord filters and saturates a high-feedback BBD echo before modulation and long ambience. Ableton's producer study emphasizes processed, band-limited delay and multiple modulated reverbs.

## Era coverage

| Era | Count | Main production vocabulary |
| --- | ---: | --- |
| 1950s | 2 | Mono, tape slapback, tube/transistor color, limited top end |
| 1960s | 3 | ADT, dense chamber, tape print, mono garage crunch |
| 1970s | 5 | Dub echo, plate, early digital doubling, rotary, album tape glue |
| 1980s | 5 | Gated/nonlinear room, stereo chorus, SPX rack, 808, new-wave motion |
| 1990s | 5 | 12-bit sampling, shoegaze wall, trip-hop wear, 909 bus, wide R&B vocal |
| 2000s | 4 | Bright pop vocal, French-house crunch, indie room, trance width |
| 2010s | 3 | Trap 808 harmonics, festival width, VHS/vaporwave wear |
| 2020s | 4 | Hyperpop clipping, drill low-end control, dub-techno space, intimate vocal |

## Era/genre catalog

| Preset | Genres | Suggested source | Chain intent |
| --- | --- | --- | --- |
| 1950s · Sun Slapback | Rockabilly, early rock, country | Vocal, guitar | 135 ms mono tape echo → tube console → mono print |
| 1950s · Tube Radio Rhythm | R&B, blues, early rock | Rhythm bus, mix | Band-limited EQ → valve push → leveling → mono |
| 1960s · Abbey ADT Vocal | Psychedelic/British pop, rock | Vocal, guitar, organ | 10 ms tape double → vari-speed drift → 30 IPS tape |
| 1960s · Soul Chamber | Soul, R&B, pop | Vocal, rhythm section | Presence EQ → leveler → dense short chamber → tape |
| 1960s · Garage Mono Crunch | Garage, proto-punk | Guitar/drum bus, mix | Mid bite → transistor overload → fast clamp → mono |
| 1970s · Dub Tape Echo | Dub, reggae | Send, guitar, organ, vocal throw | Filtered high-feedback tape echo → room color → desk overload |
| 1970s · Disco Plate Shine | Disco, Philly soul, funk | Strings, vocal, drums | Glue → bright plate → high-band exciter → tape finish |
| 1970s · Eventide Studio Double | Art/glam/prog rock | Vocal, guitar, synth | Short digital double → micro-pitch motion → early digital grit |
| 1970s · Funk Rotary Cab | Funk, soul, fusion | Organ, EP, guitar | Tube preamp → fast horn/drum rotary → cabinet EQ |
| 1970s · Analog Album Glue | Rock, soul, singer-songwriter | Mix/instrument bus | 15 IPS tape → broad tone → slow 2:1 glue |
| 1980s · Gated Arena Snare | Pop/arena rock, new wave | Snare, toms, drums | Large nonlinear room → abrupt gate → punch compressor |
| 1980s · Juno Wide Pad | Synth-pop, new wave, dream pop | Pad, EP, clean guitar | Deep ensemble chorus → plate → controlled stereo spread |
| 1980s · SPX Vocal Rack | Pop, adult contemporary | Vocal | 12 kHz rack curve → symphonic width → digital plate → clean echo |
| 1980s · 808 Electro Knock | Electro, early hip-hop, Miami bass | Drum machine | Sub weight → transient snap → circuit push → mono lows |
| 1980s · New Wave Motion | New wave, post-punk | Guitar, synth, drums | Angular chorus → rhythmic pan → bright digital room |
| 1990s · Boom Bap Sampler | Boom bap, golden-age hip-hop | Samples, drums | 12-bit sampler → roll-off → drum compression → 7.5 IPS print |
| 1990s · Shoegaze Wall | Shoegaze, dream pop | Guitar, synth, vocal texture | Fold fuzz → chorus → long tape trail → huge modulated hall |
| 1990s · Trip-Hop Dust | Trip-hop, downtempo | Samples, loops, keys | Worn tape → pitch wear → dark EQ → lazy compression |
| 1990s · 909 Warehouse Bus | Techno, house, industrial dance | Drum/percussion bus | Transient punch → mixer drive → fast bus clamp → concrete room |
| 1990s · R&B Wide Vocal | R&B, new jack swing, ballad | Vocal stacks | Smooth leveler → presence/air → wide double → long plate |
| 2000s · Pop Vocal Polish | Pop, dance-pop | Lead vocal | Bright shape → firm compression → tube sheen → slap → plate |
| 2000s · French House Crunch | French/filter house, nu-disco | Disco sample, drum/mix bus | Sample EQ → mild bit reduction → console clip → heavy bus compression |
| 2000s · Indie Dance Room | Dance-punk, electroclash | Drums, synth, mix | Tight transient → cheap desk drive → live room → clamp |
| 2000s · Trance Supersaw | Trance, euphoric dance | Supersaw, lead, pad | Unison chorus → bass-safe width → clean echo → festival hall |
| 2010s · Trap 808 Drive | Trap, hip-hop, UK bass | 808/kick/bass | Sub focus → audible tube harmonics → bass control → mono sub |
| 2010s · Festival EDM Lift | EDM, big room | Lead, supersaw, drums | Peak control → bright clip → exciter → width → hall |
| 2010s · Vaporwave VHS | Vaporwave, chillwave | Sample, pad, mix | 7.5 IPS wear → tracking drift → faded spectrum → memory chorus |
| 2020s · Hyperpop Hard Clip | Hyperpop, digicore | Lead, drums, vocal effect | Wavefold clip → digital fracture → chrome air → extreme width |
| 2020s · Drill Dark 808 | UK/Brooklyn drill, dark trap | 808, drums, melody | Dark EQ → transistor harmonics → hard transient → mono sub |
| 2020s · Dub Techno Chord | Dub/minimal/ambient techno | Chord or send | Band-limited BBD echo → phase motion → saturated hall → restrained width |
| 2020s · Intimate Pop Vocal | Bedroom/alt/contemporary pop | Close vocal | Subtle EQ → transparent compression → light tube → short plate → hidden slap |

## Core sources

- [Sun Records: Sam Phillips and tape delay](https://sunrecords.com/sam-phillips/)
- [Sam Phillips slapback measurement paper](https://www.diva-portal.org/smash/get/diva2%3A1320422/FULLTEXT01.pdf)
- [Abbey Road: Artificial Double Tracking](https://www.abbeyroad.com/news/inside-abbey-road-artificial-double-tracking-2530)
- [Abbey Road: Plate and Chamber Reverb](https://www.abbeyroad.com/news/how-to-use-abbey-roads-plate-and-chamber-reverb-effectively-in-your-music-2585)
- [Eventide H910 history](https://www.eventideaudio.com/rackmount/h910-harmonizer/)
- [AMS Neve RMX16 manual](https://www.ams-neve.com/wp-content/uploads/2021/08/rmx-16-500-series-user-manual-issue-2.pdf)
- [Roland Jazz Chorus history](https://www.roland.com/us/promos/jc_40_years)
- [Roland TR-808 story](https://www.roland.com/global/promos/roland_tr-808/)
- [Roland TR-909 history](https://www.roland.com/us/products/rc_tr-909/)
- [Yamaha SPX90 history](https://www.yamaha.com/en/about/experience/innovation-road/collection/detail/8006/)
- [Rossum SP-1200 specifications and character](https://www.rossum-electro.com/products/sp-1200)
- [Native Instruments: Shoegaze production](https://blog.native-instruments.com/shoegaze-music/)
- [Ableton: Dub-techno effects workflow](https://www.ableton.com/en/blog/designing-dub-chords-in-ableton-live-with-el-chooppizza-hotline/)
- [iZotope: Vocal chain](https://www.izotope.com/community/blog/crafting-a-basic-vocal-chain)
- [iZotope: Trap/808 tuning](https://www.izotope.com/community/blog/how-to-tune-drum-samples-for-better-tracks)

Complete source-ID map lives in `apps/pad-pilot/ui/src/modules/fx/fx-preset-research.ts`. Recipe metadata and source IDs live in `apps/pad-pilot/ui/src/modules/fx/fx-era-genre-presets.ts`; generation rejects drift through colocated contract tests.
