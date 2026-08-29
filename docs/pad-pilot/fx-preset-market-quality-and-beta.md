# FX preset market, quality, and beta plan

Updated: 2026-08-22

## Decision

PadPilot FX should compete on fast, trustworthy production outcomes, not raw preset count.

Primary preset identity follows `source | job | intensity`. Era and genre remain useful discovery metadata, but should not be the main retrieval model. Catalog now has four explicit categories:

| Category | Count | Purpose |
| --- | ---: | --- |
| System | 1 | Empty graph/reset state |
| Utility | 18 | Repeatable production jobs |
| Creative | 13 | Broad transformation and inspiration |
| Era | 31 | Historically informed genre color |

`pad_pilot_init_default` remains the startup preset ID for compatibility, but its user-facing name is `Lush Foundation`. It is classified as Creative because its EQ, compression, and 25% hall are not neutral. `Blank State` is the only system reset preset.

Bundled total is 63, leaving one entry below the current defensive 64-preset manifest limit. Do not add another bundled preset until beta evidence identifies a clear replacement or the catalog moves to paginated packs.

## Market findings

Observed competitor positioning converges on six buyer needs:

1. Fast audible result. ToneFLX sells analog character, instant chains, human curation, producer credentials, and 600+ presets.
2. Source and task context. Waves foregrounds vocal, drum, mastering, and instrument outcomes.
3. Retrieval. StudioVerse and Guitar Rig use search, tags, favorites, filters, likes, or audio-assisted recommendations.
4. Controlled depth. Infiltrator assigns expressive macros across 1,500+ categorized presets; Portal exposes a direct XY performance surface.
5. Trust. Audio demos, credible designers, clear names, and sensible initial intensity reduce audition risk.
6. Speed under deadline. Large libraries create value only when users can reach a useful result quickly.

Sources:

- [ToneFLX product and preset positioning](https://toneflx.com/)
- [Waves StudioVerse library](https://www.waves.com/studioverse)
- [Waves StudioVerse filtering and audio search](https://www.waves.com/support/how-to-filter-studioverse-search-results)
- [Waves chain-authoring guidance](https://www.waves.com/support/how-to-get-started-with-studioverse)
- [Native Instruments Guitar Rig browser](https://www.native-instruments.com/ni-tech-manuals/guitar-rig-manual/en/browser.html)
- [Devious Machines Infiltrator](https://deviousmachines.com/product/infiltrator/)
- [Output Portal](https://shop.output.com/products/portal)

These pages prove current product supply and positioning, not PadPilot demand. PMF must come from observed PadPilot use and payment behavior.

## Product wedge

Avoid positioning PadPilot as another giant multi-FX library. Stronger wedge:

> One insert that finds a production-ready chain quickly, remains editable, and becomes playable through PadPilot control workflows.

Two core jobs:

- Utility: fix or finish a known production problem quickly.
- Creative: transform an uninspiring source into useful musical material.

## Utility catalog

| Preset | Intended job | Main sources |
| --- | --- | --- |
| Mix · Mud Control · Light | Reduce rumble and low-mid buildup | Full mix, instrument bus |
| Mix · Harsh Edge Softener · Light | Smooth brittle upper mids/top | Mix, bus, vocal |
| Recorded Audio · Noise Gate Clean · Medium | Reduce room noise between phrases | Vocal, guitar, recordings |
| Bus · Peak Tamer · Medium | Round sharp peaks while retaining body | Drum/instrument bus, mix |
| Mix Bus · Gentle Glue · Light | Add subtle cohesion | Mix/instrument bus |
| Drums · Punch · Medium | Increase attack and tighten body | Drums, loops, percussion |
| Drums · Sustain Lift · Medium | Add drum body and sustain | Drums, loops, percussion |
| Bus · Parallel Density · Medium | Add density while retaining dry attack | Drum/instrument/vocal bus |
| Bass · Mono Safe · Light | Center low frequencies | Bass, 808, bass bus |
| Mix · Wide Highs Only · Light | Add width while protecting low center | Mix, synth/instrument bus |
| Mix · Center Focus · Light | Strengthen center image | Mix, instrument bus |
| Mix · Narrow and Stable · Medium | Control excessive width | Mix, sample/synth bus |
| Vocal · Clean Start · Light | Clarify and control vocal | Lead/backing vocal |
| 808 · Translation · Medium | Add audible harmonics and mono safety | 808, bass, bass bus |
| Drum Loop · Tightener · Medium | Shorten tails and tighten groove | Loops, drums, percussion |
| Synth · Polish · Light | Smooth tone and add restrained width | Synths, leads, pads |
| Guitar · Double · Medium | Create double-track width | Electric, clean, acoustic guitar |
| Sample · Resuscitator · Medium | Restore body, presence, and movement | Samples, loops |

## Quality gate

### Contract gate

Every bundled preset requires:

- Source, job, intensity, category, and searchable tags.
- Every authored value mapped to a real native-backed public control.
- No unsupported processor or hardware-emulation claim.
- Stable ID and decodable protobuf state.
- Intended insert/send context documented when relevant.

### Technical gate

Test against mono and stereo fixtures at quiet, nominal, and hot levels:

- 44.1, 48, 88.2, 96, 176.4, and 192 kHz.
- Representative small and large host block sizes.
- No NaN, infinity, unexpected silence, or unbounded output.
- No load/bypass discontinuity beyond the graph's existing smoothing contract.
- Deterministic generation and serialization.
- Claimed mono-safe presets keep low-frequency content centered.
- Audio-thread path remains allocation-free, lock-free, non-blocking, and JS-free.

### Listening gate

Use at least eight independent clips per claimed source family. Evaluate in solo and full-mix context at three input levels.

1. Match perceived loudness before judging. Peak Match is only a fast starting point; final QA uses short-term LUFS/RMS plus ears.
2. Blind A/B candidate against dry and nearest sibling.
3. Use at least three evaluators; preset passes only when two agree it solves the named job without a new blocking defect.
4. Reject one-clip wonders, misleading names, immediate gain-fix requirements, poor mono translation, and redundant siblings.

Level matching prevents loudness bias; see [iZotope gain-matched A/B guidance](https://www.izotope.com/community/blog/how-to-eq-your-master).

## Implemented evaluation support

- Search matches names, descriptions, sources, jobs, tags, and intensity.
- Category filters: All, Utility, Creative, Eras, User.
- Favorites-only filter uses existing local UI preference storage.
- Dry A/B uses the public transient `fx-graph` preview-bypass command and never mutates or persists canonical FX state.
- Peak Match adjusts existing master output gain from current input/output peaks.

Peak Match is not LUFS matching. Do not describe it as loudness matching in product copy.

## Beta protocol

### Recruit

Start with 12-20 tightly matched producers for qualitative iteration. Expand to at least 30 active respondents before treating survey percentages as directional PMF evidence.

Preferred first segment: electronic, hip-hop, and pop producers who regularly process 808s, drum loops, vocals, synths, and samples. They match current utility coverage and existing era catalog strengths.

### Session task

Each participant uses personal project audio, not supplied showcase clips:

1. Name source and desired outcome before browsing.
2. Record first preset auditioned, preset kept, time to useful result, edits, and whether it survived project reopen.
3. Repeat across at least three real sessions over two weeks.
4. Ask what existing chain/plugin PadPilot replaced.

### Scorecard

| Field | Record |
| --- | --- |
| User segment | Genre, experience, DAW |
| Source/job | User's own words |
| First useful preset | ID/name or none |
| Time to useful result | Seconds |
| Auditions before keep | Count |
| Kept 10+ minutes | Yes/no |
| Saved/favorited | Yes/no |
| Survived project reopen | Yes/no |
| Reused within seven days | Yes/no |
| Immediate bypass/undo | Yes/no and reason |
| Replaced tool/chain | Name or none |
| Would pay today | Price/offer or no |

North-star event: preset survives in a retained project. Preset load count alone is a vanity metric.

### PMF survey

Survey only participants who used core value at least twice recently:

> How would you feel if you could no longer use PadPilot FX?

Answers: very disappointed, somewhat disappointed, not disappointed, or no longer using it. Treat 40% `very disappointed` as a directional threshold, then verify with retention, reuse, and payment. Segment the users who answer `very disappointed`; their shared job and profile define the beachhead market.

Framework source: [Rahul Vohra, How Superhuman Built an Engine to Find Product Market Fit](https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/).

## Decision rules after beta

- Promote presets repeatedly kept and reopened.
- Revise presets with a clear repeated objection from target users.
- Delete or replace presets with low retrieval, low keep, and no clear interview demand.
- Compare Utility versus Era keep/reuse rates; do not infer value from browse impressions.
- Do not expand beyond 64 bundled entries until retained-use evidence justifies catalog packaging or pagination.
