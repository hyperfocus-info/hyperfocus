# Creative release audits

Use when the task asks for quality acceptance of a game, film, music video,
animation, interactive story, or similarly authored release. A project edit or
successful export alone does not invoke the full campaign gate.

## Define the release bar before authoring

Ambitious or full-product requests also use [ambitious product acceptance](ambitious-product-gate.md)
for mission coverage, independent criticism, evidence and incomplete-run accounting.

Derive audience, aesthetic direction, scope, and delivery from the brief, saved
owner feedback, and approved examples. Ask about a material unresolved taste
decision before dependent authoring; continue independent technical work. Preserve
approved reusable choices with their scope and source. Do not invent a preferred
genre, pacing, or score merely because a tool can measure it.

Record concrete acceptance before judging the output. Use numeric weights and
thresholds when the requested campaign/profile uses them; otherwise use the
brief's observable criteria. Never retrospectively ease a frozen rubric.

An ambitious persona changes the authored goal, not merely the number of features.
Use the approved creative direction. Inspect available project and repository assets before accepting
placeholder primitives. A starter may supply infrastructure, but renaming or
concatenating examples is not an original release.

## Separate authoring proof from critic proof

Use two evidence passes:

1. An authoring pass proves canonical project state, command handoffs, assets,
   settings, and successful export.
2. A critic pass judges the playable or encoded artifact. Inspect screenshots and
   motion from the artifact itself; editor preview evidence cannot substitute for
   the delivered file.

Apply the selected rubric and every agreed hard gate. Preserve deductions and
residual defects even when the release passes.

## Temporal evidence

A still image cannot prove motion quality. Capture consecutive states for every
important verb or story beat.

- For action gameplay, include anticipation, active frames, consequence, recovery,
  and return-to-ready. Exercise the progression, failure, completion, and recovery
  the game promises, plus clean loading of the delivered artifact.
- For film and animation, inspect the declared action and story beats over time.
  Sample the encoded file and deliberately chosen micro-interaction windows.
- Do not count ambient rain, particles, camera scaling, or whole-sprite translation
  as character acting by themselves.

Use `scripts/review-video-motion.ts` for encoded MP4 sampling and
`scripts/verify-release-artifact.ts` for delivery checks. Automated motion deltas
can expose dead passages but never assign the artistic score; inspect the frames.
Default stills include the opening and ending with varied sampling phases, so a
beat-length animation loop is not mistaken for a held pose. Still grids remain
insufficient: review timed action windows at sub-beat intervals and watch the
complete encoded sequence. Record whether audio evidence is waveform analysis,
actual listening, or both; audibility alone cannot establish mix quality.

## Optional fast-cut music-video profile

Use this existing 100-point profile only when the brief or approved examples call
for dense, rhythm-driven editing, or an existing campaign already froze it. It is
not a universal definition of good music videos. A deliberate long-take or sparse
style needs criteria appropriate to its approved direction, selected before review.

| Criterion | Weight |
| --- | ---: |
| Composition and focal guidance | 10 |
| Timing, beat/lyric accents, and performance sync | 16 |
| Pacing and second-to-second development | 16 |
| Performance, blocking, gesture, or designed visual action | 12 |
| Continuity, color, lighting, and visual cohesion | 10 |
| Shot scale, angle, movement, and detail variety | 10 |
| Effects, compositing, typography, and purposeful transitions | 8 |
| Concept, structure, and emotional impact | 8 |
| Sound design and mixed-audio immersion | 5 |
| Encoded technical finish | 5 |

Do not let codec correctness, schema richness, concept prose, camera drift, grain,
or effect count offset weak editing. Use encoded structural fingerprints to
distinguish real composition/action changes from pixel churn and camera moves over
one still. This profile's 90-point gate also requires all of the following:

- no underdeveloped encoded passage longer than 3 seconds;
- at least 18 substantive visual events per minute, unless a longer section proves
  evolving internal performance, blocking, choreography, or compositing at the
  same level of second-to-second development;
- no editorial segment longer than 5 seconds without that internal development;
- a majority of selected visual anchors within 150 ms of a strong musical anchor,
  while also inspecting lyrics, phrases, and intentional syncopation manually;
- wide, medium, close, and detail coverage, or an equally deliberate alternative;
- effects and transitions that clarify rhythm, attention, contact, or emotion
  rather than temporarily disguising an unchanged composition;
- deliberate sound design when visible contacts, machines, environments, or other
  diegetic events make silence feel unfinished.

Apply score ceilings before adding weighted points: fewer than 10 substantive
events per minute or an underdeveloped passage over 6 seconds caps the release at
49; fewer than 18 events per minute or an underdeveloped passage over 4 seconds
caps it at 69 unless the encoded frames prove strong internal development; missing
shot-scale/focal variety, absent music/performance synchronization, or effects used
as a substitute for edits caps it at 79. Placeholder-looking effects, unreadable
focal action, accidental bars/exposure failures, or preview/export mismatches fail
the release regardless of the numeric subtotal.

## Product-gap trigger

When a normal creative action requires hidden runtime code, mass JSON surgery, or
rebuilding the same choreography by hand, record a product finding before working
around it. If fixes are requested, add the smallest reusable command, editor
control, template, or export capability with tests, then resume the same persona
mission. Examples include animation-state switching, reusable motion recipes,
screen-space UI, reliable asset packing, and delivery presets.

Do not mistake a product feature for a finished artifact. After a tooling fix,
the simulated user must use it to improve the actual release, and the critic must
reinspect new runtime or encoded evidence.

## Release checks

For a game, verify its promised visual identity, progression, feedback, release
journey, and delivery. Repeated enemy counts or separately packaged sample arenas
do not establish progression when authored progression is part of the brief.

For a music video or film, verify the selected direction through actual playback
and a playable deliverable in the requested presets. Inspect soundtrack provenance
and trimming constraints in the packed project and export. Shot variety and event
density apply only when required by the chosen creative profile.

For an audit-until-clean request, replay fixes with the original persona, then run
a fresh-seed pass against the final artifact within the original scope. Report
unmet gates rather than reducing the mission. Compile a numeric frozen rubric by
calling `compileCreativeReleaseScore` from `scripts/creative-release-score.ts`
(a library export, not a CLI). It rejects
weights that do not total 100, applies editorial ceilings before the pass decision,
and cannot return `passed: true` while any hard gate fails. Preserve the compiled
JSON beside the persona manifest and frame/audio evidence so later runs cannot
quietly reinterpret deductions.
