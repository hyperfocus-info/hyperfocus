# Touch of Death: audio evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Gapless music candidate and validated export (2026-09-24)

The installed Shotcut FFmpeg (`n7.1-23-g4ea558152f`, libmp3lame) produced a
standard 192 kbps MP3 with Xing gapless metadata. Both the original and candidate
decode in Chrome at 44.1 kHz to exactly 5,421,312 stereo samples (122.932245 s),
with zero measured waveform lag. No runtime trimming, music shortening or gain
correction was added. Candidate audio is 2,951,735 bytes versus 4,917,361 original.
Numerical alignment is not a listening-quality verdict or cross-browser proof.

An isolated project copy used `asset.import`, a guarded `project.patch` assigning
the music, and `asset.remove` for the superseded delivery copy. All three commands
completed and persisted; a fresh snapshot matched project hash
`2e4aeef1bf2245e72e526e4ac34cfdab7e436cbcd4a50c6adb36c6c28b1f0cce`.
All 53 unrelated assets retained their original bytes and the catalog still has
54 assets. The source project was unchanged during this isolated experiment;
promotion and its original-source backup are recorded below.

The editor's visible Build/download exported this candidate with the unchanged
1,211,206-byte runtime. HTML SHA is
`210317c3979f97c9406bc5da1dc67ba2eff81a8f1e7c280fc70dc95434386cad`.
Whole HTML decreased from 8,360,122 to 5,840,030 bytes; gzip decreased from
5,649,206 to 3,751,408 bytes, a measured 33.59% reduction. These are export-byte
measurements, not latency or JavaScript package-gate improvements.

Offline candidate playback used native Start to unlock one looping stereo music
source; movement and a real Strike produced 100/92 health, with no decode/browser
errors and only a local file request. The device context resampled normally to
48 kHz and 5,900,747 frames, within one device sample of the original duration.
The initial fixture incorrectly required a 44.1 kHz device context; its evidence
is preserved beside the corrected playback report. No audio context was forced.
Owned browsers were cleaned up. A subsequent real-time check observed the same
single source, with no ended event or restart, through 125.989 seconds of running
AudioContext time: more than three seconds past the 122.932-second loop boundary.
Analyser samples remained nonzero on both sides of the wrap (RMS 0.09924 at
122.909 seconds and 0.14296 at 123.109 seconds). No browser errors occurred and
the owned browser was cleaned up. This proves full-cycle playback, not perceptual
transparency or the absence of sample-level clicks; boundary sampling was 200 ms.

The isolated package is
`.local/touch-of-death/releases/gapless-audio-candidate-20260924/`. Payload hashes
match its manifest and its account-data directory is empty. Runtime and protocol
versions remain unchanged; authored-content identity is now
`combat-v5:6a81b71739610f0398b20e4c6bf1bde6d9ff485bf1e01497829f71787d9e17b7`,
so recordings tied to the earlier content identity remain version-specific.
Project comparison proves all non-music authored state unchanged. Five focused
combat-audio tests passed, 37 assertions, including music continuity through
rounds and Practice reset.

The extracted package subsequently passed 18 browser checks outside the checkout:
independent guest profiles/outfits, a physical 100/92 hit, recent replay review,
exact combat-state equality, takeover, saving, empty-room retention and 390px
controls. Gzip delivery decoded to the candidate SHA. An old-content recording
was visibly rejected without erasing the current replay. No browser, request or
host errors occurred. The owned host and both browsers were stopped and their
process trees verified empty. Evidence is in
`.local/touch-of-death/gapless-online-audit/`.

After acceptance, `tod-promote-gapless-music-192` completed two validated editor
commands (`project.replace` and `asset.hydrate`) and persisted the canonical
project at the candidate hash above. Fresh snapshot and portable-pair validation
passed before copying the already-tested Build artifact into the local delivery
path. A full previous project/HTML backup remains at
`.local/touch-of-death/audio-gapless-audit/source-before-promotion/`; the previous
release package is also retained. The idle shared host was refreshed without
replacing its account database. Every packaged payload matches the extracted
test installation, release account data is empty, and served HTML matches the
tested SHA. Changelog: reduced compressed demo download by 33.59% using the same
complete track with standard gapless metadata; combat and music gain unchanged.

The candidate, original audio, command handoffs, source-integrity receipt,
encoding metrics and size measurements live in
`.local/touch-of-death/audio-gapless-audit/`. Listening quality and broader audio
device/browser acceptance remain unverified. Promotion is based on the measured
timing, playback, package and gameplay checks, not a claim of perceptually
transparent encoding. Existing public-service, art and package-size release gaps
remain open.

### Smaller music encodings rejected for loop timing (2026-09-24)

The existing local `@breezystack/lamejs` 1.2.7 encoded the complete decoded music
at 160 and 192 kbps without changing the source asset. Both files decoded in the
owned headless browser at 44.1 kHz, stereo. Candidate sizes were 2,459,167 and
2,951,000 bytes respectively, compared with the original 4,917,361 bytes.

Neither candidate passed the timing boundary: both decoded to 5,422,464 samples
versus the original 5,421,312, adding 1,152 samples (26.12 ms). Sampled alignment
found 1,105 samples (25.06 ms) of added lag. The runtime loops the complete music
buffer, so these are not demonstrated drop-in replacements. Do not adopt them
solely for their byte saving, claim perceptual quality from numerical error, or
alter combat/audio timing to conceal encoder padding. A gapless-aware encoding
pipeline and listening/playback checks remain necessary.

The original MP3 and both candidates, encoding script, hashes, browser-decoded
metrics and cleanup evidence are retained in
`.local/touch-of-death/audio-encoding-audit/`. The source hash is
`5bbf8a627c5dfabfa7cfd825239fcc7a8224a74a51ba0ec84e348a97dd83e99a`.
No canonical project, preset, runtime or exported HTML changed. This experiment
falsified the simplest replacement path; it did not deliver a download reduction.

### Download payload audit and next optimization (2026-09-24)

Read-only inspection of export SHA
`ca3f70cec891f1fd7e38b7f21d9dbb65a9aa400aba4fe3dc434926dadddb8477`
measured 8,360,122 HTML bytes and 5,649,206 gzip bytes. All 54 decoded asset IDs
and digests match the canonical project. The referenced music asset contributes
4,917,361 bytes: its 4,706 MPEG audio frames encode approximately 122.93 seconds
at 44.1 kHz and 320 kbps. This is the dominant download target, not a reason to
remove music or weaken runtime validation.

Assets with no references outside the asset inventory account for only 59,223
compressed archive bytes after content deduplication. Inventory-only references
are not proof that an authoring asset should be deleted. The next bounded
experiment should compare a lower-bitrate encoding of the same complete track,
preserving duration and loop behavior, then verify listening quality, browser
decode/playback, editor save/load and a fresh validated export. A 160 kbps
candidate would roughly halve audio frame bytes; that is an estimate, not a
delivered saving or approved quality verdict. Keep the original source asset.

The separate engine distribution gate remains over budget (last completed report:
5,028,135 raw / 1,580,145 gzip bytes). Audio re-encoding will not resolve JavaScript
package ceilings. No budgets, project assets or generated HTML changed in this
audit. Reproduction and per-asset evidence are in
`.local/touch-of-death/payload-audit/{audit.ts,report.json,inventory.json,music.json}`.
