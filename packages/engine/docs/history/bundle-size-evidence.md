# Bundle-size measurement history

Archived measurements through 2026-10-07. These values describe their named
candidates, not current acceptance or budget waivers. Use the
[current measurement contract](../bundle-size-evidence.md) for validation.


The October 7 Touch of Death extraction gives shared GLB generation a separate
`assets/model-cooking` entry so read-only glTF consumers do not acquire a writer.
Its initial raw entry ceiling is 10,000 bytes. No existing entry or aggregate
ceiling was increased. The full budget gate still rejects the existing runtime
and authoring-tool distribution overages; extraction is not a release waiver.

Owner: engine package maintainers. Run `bun run check:bundle-size` from
`packages/engine` after building. The executable ceilings live in
`scripts/bundle-size/policy.ts`; `.local/engine-release/bundle-sizes.json` records
the current result. This page explains the 2026-09-10 migration, not a permanent
waiver for future growth.

## Measurement boundary

### Persistent simulation mailbox, 2026-10-06

The opt-in mailbox has its own small `experimental/simulation-mailbox` entry,
with a new 1,500-byte raw ceiling and no dependencies. It does not expand the
existing experimental barrel or its ceiling. Native and rebundled graphs pass
the new entry's raw/compressed limits; the full package retains its existing
runtime and distribution overruns. The [worker audit](../../examples/touch-of-death/docs/history/performance/persistent-world-worker-iteration.md#persistent-world-worker-iteration)
records the measurements and installed-consumer evidence. This change does not
waive or raise any existing budget.

### Bounded play and spatial particles, 2026-10-06

The installed-package consumer now exercises spatial particle emit/save/restore.
Build and external consumer smoke pass. The whole dirty tree still fails the size
gate: effects measures 29,997 raw bytes against 24,000; render-3d-scene 36,704
against 33,000; render-3d-webgl2 49,234 against 43,000; runtime-3d 1,071,786 against
605,000. These affected entries include new particle/play behavior and concurrent
work; no clean pre-change measurement isolates their contributions. Budgets were
not raised. The [delivery audit (temporary; prune after findings are promoted)](../../../../.local/repository-audit/reports/playable-pipelines-2026-10-06.tmp.md)
links functional and rendered evidence without claiming release-size acceptance.

### Contextual combat policy and city spatial work, 2026-09-29

The advanced 3D runtime now exposes validated contextual evidence, tuning and
optional stage profiling. Contextual adaptation is now the default; the original
tactical mode remains an explicit evaluation control. A
complete engine build and installed-package consumer smoke pass. The complete
bundle gate continues to fail the existing runtime/physics/distribution ceilings;
no budget was raised. After stronger styles, compact saves and city spatial work,
runtime-3d measured 951,251 raw / 302,921 gzip / 246,456 Brotli bytes against
605,000 / 187,000 / 153,000. All 60 outputs totaled 5,756,229 raw bytes against
4,086,000; core remains 44,999 against 45,000. These are whole dirty-worktree
measurements including prior features, not bytes attributed solely to this policy.
The latest regenerated `.local/engine-release/bundle-sizes.json` is authoritative.
Runtime/editor owners must close size acceptance before a release claim.

### Seeded headless simulation batches, 2026-09-29

The new `createSimulationBatch` export in the existing core entry supports the
browser bulk-fight worker and reproducible headless combat validation. After the
final core build, `dist/core.js` is 44,999 raw bytes against the unchanged
45,000-byte ceiling. Consolidating boundary validation closed an intermediate
58-byte overrun without changing accepted inputs or raising the budget.
The earlier complete bundle check also reports
the broader standalone, physics, combat and distribution overruns. Build and the
installed-package consumer smoke pass; package size acceptance remains blocked.
No SIMD performance claim is attached to this portable fixed-step orchestration.

### Demo document transfer, 2026-09-24

The local host previously ignored `Accept-Encoding: gzip` and transferred the
entire 8,356,690-byte exported HTML. Startup gzip now yields 5,648,049 wire bytes,
32.41% fewer, while decompression preserves SHA-256
`818b73f20e5111b801192e6afafcf2421794e8b9367598247a457f6a6127e72a`.
An external packaged host passed serial identity/gzip/gzip/identity checks with
these same sizes, exact response lengths and decoded bytes. This measures transfer
size only, not latency, startup execution or a JavaScript bundle-size reduction.
The original offline HTML and project are unchanged. All package ceilings remain.

The preceding contributor audit measured the complete esbuild 3D source bundle
at 1,191,507 raw / 366,504 gzip / 298,792 Brotli bytes. Its largest contributors
are ragdoll/physical-performance physics, frame capabilities and the 3D runtime.
Project and timeline validation are reachable through portable project opening;
their editor-oriented filenames do not establish that they are removable.
No validation or game feature was stripped. The host transfer change was selected
over speculative dependency surgery because it had a measured benefit and a
small, testable compatibility boundary. Raw evidence is in
`.local/touch-of-death/bundle-audit/{contributors,transfer-before,transfer-after}.json`.

### Private/training images and current release gate, 2026-09-24

The current package build measures 1,280,697 / 392,346 / 319,429 raw/gzip/Brotli
bytes for generic standalone (1,280,512 raw rebundled). Total distribution is
5,028,135 / 1,580,145 / 1,323,151. The selected Touch of Death 3D export runtime
is 1,206,263 raw bytes; its complete HTML is 8,355,179 bytes, SHA-256
`8fdad3b6e064c19bfbe4f1ad185fe0a6492b9dd6749399355fd2ab7df98e1766`.

`bun run ship-check engine --json` passed release layout, process policy, source/
test/tooling/example/editor types, compatibility tests and build, then stopped
at bundle ceilings. Later example/editor builds, package smoke and all-tests
did not run through that gate. Existing violations include standalone, server,
physics, project/combat and total distribution. No limits were raised; this is
an unresolved package-release blocker, not a claim that the exported game failed
to load. The complete report was generated at 2026-09-24T15:23:35Z and preserved
in `.local/touch-of-death/offline-release-audit/bundle-sizes.json`.

### Dimension-specific browser exports, 2026-09-24

The editor now selects complete 2D/3D startup entries while retaining the generic
package entry. The previous Touch of Death runtime measured 1,285,536 / 391,500 /
317,620 raw/gzip/Brotli bytes. Its 3D entry measures 1,195,079 / 364,315 / 296,244:
90,457 fewer raw bytes (7.04%). The 2D entry is 223,757 / 67,785 / 57,363. Both
preserve migration, asset validation and their dimension's existing features.
The editor carries both bundles, adding 133,300 raw bytes to its combined embedded
runtime payload. These whole-bundle compression measurements use the same Bun
options and zlib defaults; no startup or latency improvement is claimed.

Generic package standalone: 1,269,589 / 389,220 / 317,132 (1,269,386 raw rebundled).
Total distribution: 5,016,836 / 1,576,926 / 1,320,946. Generic raw distribution
therefore grows by 1,111 bytes; it is not being presented as a package-size win.
The native create-project graph is 639,505 / 198,157 / 162,844. Build and installed
consumer creation/custom-build/preview/recovery pass; existing ceilings still fail
and were not raised. Raw reports: `.local/touch-of-death/bundle-audit/current.json`,
`profiles.json`, and `.local/engine-release/bundle-sizes.json`.

### Quick Play opponent image controls, 2026-09-24

Visible block/unblock, native keyboard activation and the emblem-only gallery fix
measure 1,269,048 / 390,106 / 316,889 raw/gzip/Brotli bytes in the package standalone
(1,268,862 raw rebundled). Total distribution is 5,015,725 / 1,577,739 /
1,320,537. The editor-exported runtime is 1,285,536 raw bytes, SHA-256
`d32c04a9f05d3b08571dbd400ee8332f058af5c60a48eb43543e9a66d33b1a0e`.
Build and installed-consumer creation/build/preview/recovery pass. The size
gate still fails existing ceilings; no budget was raised or check removed.

### Profile emblems, 2026-09-24

The capability-gated account emblem and nameplate canvas measure
1,266,312 / 389,230 / 316,288 raw/gzip/Brotli bytes in the package standalone
(1,266,131 raw rebundled). Total distribution is 5,012,989 / 1,576,863 /
1,319,936. The editor-exported runtime is 1,282,788 raw bytes, SHA-256
`12d877152afb93281b0a3c08f0c963f707562bfcc4e29789ec27978f3051a3f6`.
Engine build and installed-consumer creation/build/preview/recovery pass.
Existing size ceilings still fail and were not raised.

### Quick Play uploaded outfits, 2026-09-24

The capability-gated Quick Play gallery and renderer integration measures
1,264,413 / 388,677 / 315,816 raw/gzip/Brotli bytes in the package standalone
(1,264,232 raw rebundled). Total distribution is 5,011,090 / 1,576,310 /
1,319,464. The editor-exported Bun runtime is 1,280,895 raw bytes, SHA-256
`dedf4bdbd82d50da20974766c5b50e65c43bb4a4f68cb9054ce4f0057304cdac`.
Installed package creation, custom build, preview and recovery pass. Existing
size ceilings still fail; this feature does not resolve or waive that blocker.

### Hosted guest entry, 2026-09-24

The final guest-entry build measures 1,262,593 / 388,172 / 315,458 raw/gzip/Brotli
bytes for the package standalone (1,262,433 raw rebundled). Total distribution is
5,009,270 / 1,575,805 / 1,319,106. Net is 70,058 / 21,159 / 18,618;
the compiled create-project graph is 639,220 / 198,126 / 162,682.
The actual editor-exported Bun runtime is 1,279,082 raw bytes, SHA-256
`f9f1b8678772211a1832baa651624b366a8337c43f28dc3d07bfe6f99a345ac6`.
These are separate build artifacts. Guest admission, async credential fencing
and invitation handling are included. The complete engine ship gate still fails
existing size ceilings; no ceiling was raised and no waiver is implied.

### Project-creation compatibility facade, 2026-09-24

Restoring the public `tooling/create-project.ts` entry leaves the compiled
create-project graph unchanged: 639,213 / 198,125 / 162,558 raw/gzip/Brotli bytes.
The complete native public consumer additionally includes the 413 / 243 / 184
byte TypeScript facade, totaling 639,626 / 198,368 / 162,742. Rebundled output is
634,498 / 195,642 / 159,991. The existing delivered-JavaScript report excludes
the TypeScript facade; these figures state that extra cost explicitly.

The audit disables repository TypeScript paths and asserts that private import
resolution reaches only the facade and delivered tooling chunks. Node builtins,
external esbuild and declarations are outside this runtime measurement. Evidence:
`.local/touch-of-death/recovery-ui/starter-facade-bytes.json`. No ceilings changed.

### Standalone protocol deduplication, 2026-09-24

The editor explicitly resolves the public combat/net subpath to its source entry.
Its wildcard previously fell back to the packaged bundle, duplicating protocol
dependencies. The actual Bun HTML runtime drops from 1,279,066 / 389,631 / 314,660
raw/gzip/Brotli bytes to 1,270,749 / 387,102 / 314,125. No runtime features or
validation paths were removed. Metafiles and options are retained under
`.local/touch-of-death/bundle-audit/`.

The separate esbuild package standalone is 1,254,257 / 385,747 / 313,583 bytes
(1,254,097 raw rebundled). Total distribution is 5,000,584 / 1,573,264 / 1,316,987.
Installed-consumer smoke passes. Existing ceilings still fail and remain unchanged;
this small deduplication does not resolve the release size blocker.

### Background sessions and close policy, 2026-09-24

Standalone measures 1,262,484 raw / 388,171 gzip / 313,831 Brotli bytes
(1,262,320 raw rebundled). Total distribution is 5,008,811 / 1,575,688 /
1,317,235 bytes. Net is 69,890 / 21,105 / 18,586 bytes; server is
209,051 / 63,871 / 54,677. This adds explicit bounded client suspension,
background session policy and event-time keyboard release handling. Build and
installed-consumer verification pass. Existing bundle ceilings still fail and
were not raised.

### Live connection recovery, 2026-09-24

Standalone measures 1,261,665 raw / 387,916 gzip / 313,716 Brotli bytes
(1,261,501 raw rebundled). Total distribution is 5,007,714 / 1,575,329 /
1,317,077 bytes. Server is 209,025 / 63,856 / 54,700 bytes. Recovery retains
bounded transport reservations, sampled inputs and spectator cursors, and clears
media resources across interruptions. Build passes; existing package ceilings
still fail and were not raised. Public release still requires bundle reduction.

### Approved clothing prints, 2026-09-24

Standalone measures 1,258,511 raw / 386,871 gzip / 312,971 Brotli bytes
(1,258,347 raw rebundled). Total distribution is 5,001,299 / 1,573,257 /
1,315,298 bytes. This adds declared texture replacement/reset, authored texture
targets, equipped-image loading and player controls. Player pixels remain outside
the bundle and combat snapshots. Build and installed-consumer verification pass;
existing size ceilings still fail and were not raised.

### Image review and player reports, 2026-09-24

Standalone measures 1,247,432 raw / 383,487 gzip / 310,164 Brotli bytes
(1,247,229 raw rebundled). Total distribution is 4,985,298 / 1,568,515 /
1,311,162 bytes. Player reporting adds 1,183 raw standalone bytes over upload
storage; the separate 25,603-byte moderator bundle is served only by the local
host review page and is absent from game HTML. Engine primitives are unchanged.
Build and installed-consumer verification pass; existing ceilings fail and were
not raised. Operator/browser acceptance does not waive package size budgets.

### Uploaded picture storage and room controls, 2026-09-24

Standalone measures 1,246,249 raw / 383,161 gzip / 309,785 Brotli bytes
(1,246,046 raw rebundled). Total distribution is 4,984,115 / 1,568,189 /
1,310,783 bytes. This adds 15,695 raw standalone bytes over opt-in voice;
engine server/runtime primitives are unchanged. The image payload travels only
on explicit low-rate requests and is absent from combat snapshots. Existing
bundle ceilings still fail and were not raised; build and installed-consumer
verification pass. Cosmetic equipping and moderator UI remain separate work.

### Opt-in room voice, 2026-09-24

Standalone measures 1,230,554 raw / 378,527 gzip / 306,408 Brotli bytes
(1,230,348 raw rebundled). Total distribution is 4,968,420 / 1,563,555 /
1,307,406 bytes. Recipient-scoped delivery measures server at 206,762 raw /
63,193 gzip / 54,146 Brotli bytes. Voice adds 16,435 raw standalone bytes over
the shared-training candidate. Engine build and installed-consumer verification
pass; existing ceilings fail and were not raised. Browser acceptance does not
waive bundle reduction or establish public network/device performance.

### Shared training, 2026-09-24

Standalone measures 1,214,119 raw / 373,266 gzip / 301,871 Brotli bytes
(1,213,919 raw rebundled). Runtime-3D measures 749,423 / 235,669 / 192,760.
The total distribution is 4,951,541 / 1,558,139 / 1,302,850 bytes.
Training adds explicit session/replay mode, bounded room metadata and native
consent controls; steady combat deltas add no unchanged training metadata bytes.
The existing ceilings still fail and were not increased. Reducing the delivered
runtime remains release work; local browser acceptance does not waive that gate.

### Wardrobe and durable profiles, 2026-09-24

The final candidate measures standalone at 1,203,689 raw / 370,988 gzip /
299,574 Brotli bytes (1,203,510 raw rebundled). Runtime-3D is
748,352 / 235,451 / 192,720, including portable appearance validation/composition.
Total delivered JavaScript is 4,939,778 / 1,555,568 / 1,300,438 bytes.
Compared with the Quick Play candidate below, this adds 28,823 raw standalone
bytes and 5,593 raw runtime-3D bytes. The eight wardrobe GLBs are embedded game
assets and are not included in these package JavaScript measurements.

Engine build and installed-consumer verification pass. Existing bundle ceilings
still fail; none were raised. Runtime and standalone owners retain reduction
work as a demo release blocker. Browser wardrobe/profile acceptance does not
waive these package budgets or prove internet/device performance.

### Quick Play integration and completed replay retention, 2026-09-24

Standalone measures 1,174,866 raw / 362,170 gzip / 292,876 Brotli bytes
(1,174,687 raw when rebundled). The 60 delivered JavaScript files total
4,905,362 / 1,545,024 / 1,292,279 bytes. Server remains
206,318 / 63,038 / 54,127; runtime-3D remains 742,759 / 233,722 / 191,247.
Installed-consumer validation passes. Existing bundle ceilings still fail and
were not raised; engine runtime and editor standalone owners retain this release
blocker. These package measurements are separate from the full embedded export.

### Matchmaking lifecycle, 2026-09-24

Atomic group selection, assignment inspection and ticket release measure server
at 206,318 raw / 63,038 gzip / 54,127 Brotli bytes. Total delivered JavaScript is
4,895,305 / 1,542,789 / 1,290,585 bytes. Standalone remains unchanged from the
social candidate below. Installed-consumer validation passes; existing bundle
ceilings still fail and were not raised.

### Room communication integration, 2026-09-24

The social candidate measures standalone at 1,164,809 raw / 359,935 gzip /
291,182 Brotli bytes: 8,187 raw and 2,206 gzip bytes above the room candidate
below. Total delivered JavaScript is 4,892,488 / 1,541,993 / 1,289,839 bytes.
Existing ceilings still fail; none were raised. Installed-consumer validation
passes. Unchanged social metadata adds zero bytes to the binary delta fixture;
a full 32-message Unicode history measures 17,515 bytes in its schema fixture.

### Community room integration, 2026-09-24

The 08:09:20 UTC report measures standalone at 1,156,622 raw / 357,729 gzip /
288,990 Brotli bytes. Room state, connection handoff and visible queue controls
add 11,891 raw / 3,408 gzip bytes over the portable-math candidate below. Total
delivered JavaScript is 4,884,301 / 1,539,787 / 1,287,647 bytes. Existing size
ceilings still fail; none were raised. Installed-consumer validation passes.
The unchanged-lobby binary delta fixture adds zero bytes over its ordinary combat
delta (131 bytes); this is a wire-fixture measurement, not an internet latency claim.

### Portable simulation arithmetic, 2026-09-24

The portable-math report (`.local/engine-release/bundle-sizes.json`, generated at
07:42:47 UTC) measures standalone at 1,144,731 raw / 354,321 gzip / 286,198 Brotli
bytes, runtime-3D at 742,759 / 233,722 / 191,247, and total delivered JavaScript at
4,872,410 / 1,536,379 / 1,284,855. Compared with the spectator candidate below,
standalone grows 31,460 raw bytes and runtime-3D 30,372 raw bytes. Portable math
and retained third-party notices also affect the other importing package graphs;
the total distribution increase is 315,489 raw bytes, not a single-game download.

This replaces the earlier 07:37 measurement, whose Bun-built standalone artifact
had stripped `@license`-only comments. The final sources use retained `/*!`
headers and carry one complete Apache-2.0 license copy. The generated HTML with
SHA-256 `737d8b39a79cc22a875f9852963a0042da45f6756a0d19591f5417e5219abbfe`
contains Sun, Go, Stdlib and Cephes notices plus the full Apache terms; source
markdown notices alone were insufficient proof of standalone redistribution.

Installed-consumer validation passes. Bundle-size validation still fails existing
ceilings; none were raised. Runtime/editor/package owners retain the reduction
work before release. Exact Chrome/Bun source checkpoint comparisons pass the
2,562-frame full-set/rematch fixture and 1,065 physical-scenario frames. Exported
browser verification is separate and is not claimed by this size measurement.
The simulation-only benchmark's +1.704% median time change is noisy shared-machine
evidence, not an FPS or end-user load-time claim; see
[combat rollback](../combat-rollback.md#cross-runtime-arithmetic-boundary).

### Bounded late spectator playback, 2026-09-24

Standalone now measures 1,113,271 raw / 343,596 gzip / 277,697 Brotli bytes;
runtime-3D is 712,387 / 223,679 / 183,084; server is
202,086 / 61,495 / 52,834. Combat-net remains 12,972 / 4,187 / 3,764.
Total delivered JavaScript is 4,556,921 / 1,436,041 / 1,204,310.
Compared with the superseded-session candidate below, spectator admission,
bounded history windows and playback add 5,617 standalone raw bytes, 3,103
runtime-3D raw bytes and 1,351 server raw bytes. The existing binary snapshot
schema and combat-net graph are unchanged.

Installed-consumer validation passes. Unchanged bundle ceilings still fail,
including standalone, runtime-3D, server, combat-net and aggregate distribution
budgets; this feature does not grant extra headroom. Runtime/editor/server owners
retain the reduction work before release. The repository source-structure gate
reports only the unrelated PadPilot evaluator directory (38 files versus its
36-file baseline); touched spectator modules introduce no structure violation.

### Explicit superseded-session recovery, 2026-09-24

Current standalone is 1,107,654 raw / 342,075 gzip / 276,595 Brotli bytes;
server is 200,735 / 61,115 / 52,514. Total distribution is
4,546,850 / 1,433,334 / 1,202,239. Terminal connection recovery adds 159
standalone raw bytes and 416 server raw bytes over the replay-controls candidate.
Source/test typechecks, build and installed-consumer checks pass; unchanged size
ceilings continue to fail. The owning runtime/server maintainers retain reduction work.

### Delivered replay controls and client recording, 2026-09-24

The current exported-host graph measures 1,107,495 raw / 342,028 gzip / 276,579
Brotli bytes. Runtime-3D is 709,284 / 222,871 / 182,448; combat-net remains
12,972 / 4,187 / 3,764. Total distribution is 4,546,215 / 1,433,087 / 1,202,149.
The replay controls and client recording add 13,757 standalone raw bytes and
819 runtime-3D raw bytes over the preceding playback-core measurement. Build,
typechecks and installed-consumer checks pass; unchanged size ceilings fail.
Engine runtime/combat and standalone-host owners retain the reduction work.

### Confirmed input recording API, 2026-09-24

Subsequent playback/seek/takeover export adds 3,773 raw / 992 gzip / 867 Brotli
bytes to runtime-3D: now 708,465 / 222,593 / 182,121. Standalone is
1,093,738 / 338,374 / 273,340; total distribution 4,531,639 / 1,429,155 /
1,198,583. Build, source/test typechecks and installed consumer pass, while
existing size ceilings remain unchanged and failing.

The optional combat-net graph grows from 10,946 raw / 3,526 gzip / 3,195 Brotli
to 12,972 / 4,187 / 3,764 bytes after versioned recording validation and capture.
Its raw ceiling remains 11,500: this adds a new 1,472-byte budget violation.
Compression ceilings still pass. No existing ceiling was raised. Engine combat
maintainers own reduction or an explicitly reviewed budget migration.

Current standalone is 1,093,715 / 900,000 raw, runtime-3D 704,692 / 605,000,
and total distribution 4,527,843 / 4,086,000. Prior graph failures remain.
Build, source/test typechecks and installed-consumer smoke pass; size does not.

### Exported private combat sets, 2026-09-24

The complete-set measurement (before the admission-generation race repair) has
a standalone graph of 1,090,718 raw bytes against its unchanged
900,000-byte ceiling. Runtime-3D is 704,692 / 605,000; project is 115,355 / 70,000;
server is 200,319 / 200,000. The project growth includes combat eligibility
validation for the explicit export connection policy. Total distribution is
4,522,560 / 4,086,000 bytes. Compression and several prior entry ceilings also
fail; see the generated measurement report for all dimensions. Engine build and
installed-consumer checks pass, but this candidate does not pass the size gate.
Engine project/runtime and editor export owners retain these blockers; no existing
ceiling was raised to accommodate the browser connection flow.

### Optional combat network protocol, 2026-09-24

Owner: engine combat/project maintainers. `@hyperfocus/engine/combat/net` exposes
the binary fighter input and room-history codecs separately from offline combat.
Its first build is 10,946 raw bytes; its new entry ceiling is 11,500 bytes, with
the standard compression budgets. Removal target: ratchet the small headroom
when next changing the protocol. Existing artifact and distribution ceilings are
unchanged. Exporting these codecs from the offline combat entry measured 39,884
bytes; separating them leaves that entry at 28,828 bytes. That remaining offline
combat overrun and larger project/tooling/distribution overruns stay unresolved.
This is an optional-feature boundary, not a claim that release-size gates pass.

### Touch of Death playability repair, 2026-09-22

The fixed match viewport, menus, buffered launch chase and dynamic-pair CCD repair
produce a 917,840-byte standalone graph. The complete package remains above its
existing runtime, tooling and total limits; no ceilings were raised. Engine build,
installed consumer and local/offline browser checks pass. Physics regressions and
54,000 seeded combat ticks validate the concrete floor-escape fix, independently
of the unresolved release-size gate. The final local HTML is 7,903,069 bytes,
including the previously embedded music and sound assets.

### Directional combat expansion, 2026-09-22

Owner: engine combat/project maintainers. Direction/Drive selectors, authored
ordinary strings, stamina accounting, launch influence and strict replay state
grow the complete combat graph from 18,525 to 24,715 raw bytes (7,611 gzip,
6,891 Brotli; rebundled 24,715 / 7,608 / 6,879). Its feature ceiling becomes
25,500 / 8,000 / 7,300. This accepts the requested behavior, not an optimization.
Removal target: ratchet this headroom toward measured bytes when next changing
the combat owner; preserve selector validation and replay guarantees.

The integrated movement/HUD candidate measures runtime-3d 602,499 raw / 185,782
gzip / 152,050 Brotli; standalone 888,676 / 269,953 / 220,100. Both retain their
existing limits. Complete distribution is 4,174,920 / 1,308,948 / 1,102,605.
The report records later small presentation edits. Project/timeline and aggregate
ceilings remain unchanged and failing; aggregate excess includes this expansion.
Installed package-consumer acceptance passes. This remains a local game prototype.

### Touch of Death candidate, 2026-09-22

Owner: engine combat/project maintainers. The rebuilt candidate retains guard
break, chip, collision tech, armor, multi-strike/parry follow-ups and movement
state in the same portable combat and 3D runtime graphs. Compared with the fighter
primitive candidate below, combat grows from 10,012 to 18,523 raw bytes; the 3D
runtime grows from 578,530 to 592,396; standalone grows from 861,120 to 875,004.
These are feature-growth measurements, not optimization claims.

| Artifact | Native raw | Rebundled raw | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: |
| combat | 18,523 | 18,523 | 5,782 | 5,238 |
| project-runtime-3d | 592,396 | 592,233 | 182,370 | 149,301 |
| standalone-runtime | 875,004 | 874,838 | 265,282 | 216,014 |
| complete distribution | 4,142,962 | — | 1,298,465 | 1,093,762 |

The final integration adds airborne attack travel, demo framing, held-action
controls and the resting-contact CCD regression fix. The subsequent full graphs
measure combat 18,525 raw / 5,786 gzip / 5,233 Brotli, runtime-3d approximately
595 KB raw, and standalone approximately 880 KB raw. The complete distribution
measures 4,150,830 / 1,301,045 / 1,096,023 bytes before the final control-label edit.
The generated report remains authoritative for the final candidate.

This feature migration gives combat a 19,000 / 6,000 / 5,500-byte ceiling,
runtime-3d 605,000 / 187,000 / 153,000, and standalone
900,000 / 274,000 / 224,000. These are complete native and rebundled graph limits.
Keeping the adapter outside those graphs would remove ordinary editor Play and
offline Build support. Removal target: combat/project maintainers should ratchet
the headroom toward the measured graphs on their next change.

The size gate still fails on untouched project/timeline entries and aggregate
limits, which were not increased here. Aggregate growth includes this feature;
it is not all preexisting debt. Build and installed package-consumer acceptance
pass. This local prototype is not an engine package release acceptance.

### Fighter primitives, 2026-09-22

Owner: engine combat/project maintainers. The fighter addition retains focused
`combat` and `progression` entries; the ordinary browser root stays unchanged.
Editor Play and standalone delivery consume the same combat adapter, so the 3D
runtime and authoring-tool graphs necessarily include its validator and simulation.
Keeping combat only in project source was rejected: it would remove the novice
no-source Play/Build path. Rollback composes existing checkpoints; geometry queries
reuse the existing physics types without importing the rigid solver.

The first rebuilt candidate measured these complete native graphs (raw/gzip/Brotli):

| Artifact | Bytes |
| --- | --- |
| combat | 10,012 / 3,436 / 3,125 |
| progression | 2,287 / 933 / 814 |
| net | 69,446 / 20,926 / 18,448 |
| physics-3d | 23,068 / 7,837 / 6,875 |
| project-runtime-3d | 578,530 / 177,693 / 145,416 |
| create-project | 594,072 / 183,256 / 150,758 |
| build-project | 595,904 / 183,345 / 150,986 |
| dev-project | 603,474 / 186,842 / 154,074 |
| standalone-runtime | 861,120 / 260,616 / 212,338 |

These are feature-growth measurements, not a performance improvement claim.
The corresponding entry ceilings now cover the feature with bounded headroom;
combat and progression receive 12 KB and 3 KB raw ceilings. Aggregate allowances
increase by 42 KB runtime and 24 KB tooling (14/12 KB and 8/6 KB gzip/Brotli).
Removal target: ratchet entry headroom toward the measured complete graphs when
these owners change, preserving novice Play/Build and packed-consumer acceptance.

The rebuilt dirty workspace also exposes older budget drift in **untouched**
`project.js` (102,895 raw against 70,000) and `project-runtime-timeline-2d.js`
(18,319 against 18,000). Their budgets are not raised here; they and remaining
aggregate overruns still make the broad size gate fail. Use the generated report
for the final candidate rather than treating these initial measurements as a pass.

Every JavaScript file in `browser/` and `dist/` contributes to the aggregate,
including unnamed or unreachable chunks. Every JavaScript package export must
have an entry budget. Entry bytes, the full native import graph, and a minified
rebundled consumer are checked separately in raw, gzip, and Brotli bytes. A small
entry facade cannot conceal a large dependency graph. Compression totals sum
separately compressed delivered files, as independent network responses would.

The root browser distribution retains its original 160,000/60,000/52,000-byte
raw/gzip/Brotli limits, and minimal browser consumers retain their 8,000 and
18,000-byte gzip limits. Both source imports and delivered browser imports are
checked. External Three.js and WASM assets remain outside these JavaScript
ceilings; package-consumer and WASM asset/hosting gates cover those boundaries.

## Control and candidate

Windows x64, Bun 1.4.2, the locked esbuild version, identical minification and
compression settings. The control is the previously built candidate; the final
candidate includes the source extractions and direct Meshopt simplifier import.
No runtime APIs or features were removed.

| All 51 delivered JavaScript files | Control | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Raw | 2,581,567 | 2,547,872 | 33,695 |
| Gzip | 815,206 | 807,699 | 7,507 |
| Brotli | 697,734 | 690,132 | 7,602 |

The old total omitted the 8,717-byte material-preset artifact. Comparing its
2,572,850-byte result directly with the new complete total would be misleading.
The actual optimization removes unused Meshopt encoder and decoder startup code:
`render/three/geometry-simplification.ts` now imports the supplied simplifier
module directly. The render-3D artifact shrank from 85,255 to 50,146 raw bytes.
Source extraction changed minifier layout elsewhere, so the net package reduction
is smaller than that artifact's 35,109-byte improvement.

Rejected alternatives were measured before changing the production build:

- One shared focused distribution reduced those artifacts to 1,519,755 bytes,
  but increased the native 3D-runtime graph from about 563 KB to 627 KB. Shared
  modules retained unused rig compilation, name mapping, and inspection exports.
- Isolating rigid material coefficients removed an accidental solver dependency
  in the split ragdoll candidate: about 148 KB became 74 KB. The useful source
  boundary remains, with named consumers in rigid-world setup, humanoid-ragdoll
  generation, and breakable-assembly generation.
- A hybrid that retained standalone entries with material native-load regressions
  saved only 6,788 bytes and worsened several compressed entry graphs. It was not
  adopted.
- A second Terser pass saved about 16 KB on the shared candidate. That result did
  not justify another build dependency or repair the native-load regression.

Focused production artifacts remain standalone. Do not adopt shared chunks until
both the aggregate and actual importing consumers improve.

## Explicit feature-growth migration

The old limits predated the retained physical-performance and editor capabilities.
For example, ragdoll's own minified source was 64,957 bytes before dependencies,
already exceeding its old 12,000-byte whole-entry limit. This migration accepts
that existing feature scope; it does **not** claim optimization met the old limits.
Changed compressed ceilings track the measured candidate with approximately 1%
headroom rounded to 100 bytes. Unaffected entry limits remain unchanged.

| Artifact / owning source | Prior raw limit | New raw limit | Candidate raw | Retained feature scope |
| --- | ---: | ---: | ---: | --- |
| `render-3d-scene` / `render/3d-scene.ts` | 30,000 | 33,000 | 32,407 | Material variants, skinning and scene commands |
| `render-3d-webgl2` / `render/webgl2/` | 36,000 | 43,000 | 41,877 | Material uniforms, passes and impact frames |
| `physics-rigid-3d` / `physics/rigid-*` | 38,000 | 77,000 | 75,273 | Contact/inertia, motors, constraints and checkpoints |
| `physics-ragdoll-3d` / `physics/ragdoll*` | 12,000 | 75,000 | 73,839 | Articulated drives, support, stepping and recovery |
| `physics-physical-performance-3d` / `physics/performance/` | 56,000 | 257,000 | 252,969 | Solver, articulation, cue lifecycle, baking and inspection |
| `motion` / `motion/` | 120,000 | 172,000 | 169,993 | Humanoid gait, contact, jump, punch and pose solvers |
| `motion-three` / `motion/three.ts` | 95,000 | 129,000 | 127,111 | Semantic-rig mapping and full humanoid adapter |
| `project` / `project/editor*.ts` | 57,000 | 70,000 | 68,270 | Current project schema, validation and undo history |
| `project-runtime-2d` / `project/runtime2d/` | 52,000 | 55,000 | 53,645 | Portable world, transforms and action hit testing |
| `project-runtime-timeline-2d` | 16,000 | 18,000 | 17,413 | Timeline runtime and current shared project contract |
| `project-runtime-3d` / `project/3d/`, `frame/` | 102,000 | 568,000 | 562,726 | glTF, humanoid presentation, frame audits and physical compiler |
| `render-3d-material-presets` / `render/materials/` | Missing | 9,000 | 8,717 | Already exported presets now included in validation |

The aggregate raw ceiling moves from 1,600,000 to 2,560,000 bytes. Aggregate gzip
and Brotli ceilings are now independently enforced at 810,000 and 692,000 bytes.

Removal targets: when touching these owners, ratchet each ceiling toward the
candidate value above without dropping supported behavior. A later decomposition
must name an actual consumer and demonstrate its complete native and rebundled
graphs improve. In particular, separate rig semantics from rig compilation only
when a native runtime consumer needs that boundary; do not ship the measured
627 KB regression to make the aggregate look smaller. Any future feature-growth
change must provide a new control/candidate measurement and review its owner and
scope instead of silently refreshing these numbers.

## Installed authoring tooling (2026-09-11)

The previous package exposed creation source with missing imports and omitted the
custom-source build/preview implementation and standalone runtime. The new delivered
scope is those existing tools, bundled for an installed Bun consumer. Engine authoring
owns these artifacts; editor source continues to own standalone runtime presentation.
An external packed consumer proves create → custom-source build → preview → recovery.

Unminified independent tooling bundles added 4,070,137 raw bytes. Sharing the bundled
implementation and minifying it reduced the added JavaScript to 1,444,785 raw,
442,939 gzip and 363,440 Brotli bytes, including the 843,361-byte standalone runtime.
These numbers exclude the separately installed esbuild binary/dependency; they measure
delivered package JavaScript, not total installation size or application download size.

| Public tooling graph | Native raw | Rebundled raw | Native gzip | Native Brotli |
| --- | ---: | ---: | ---: | ---: |
| Creation | 575,535 | 571,384 | 177,957 | 146,644 |
| Build | 577,367 | 573,441 | 178,048 | 146,898 |
| Preview | 584,937 | 580,015 | 181,545 | 149,988 |
| Standalone runtime | 843,361 | 843,195 | 254,433 | 207,389 |

New tooling graph and aggregate ceilings allow approximately one percent headroom.
The existing runtime aggregate ceiling remains independently enforced at
2,560,000 / 810,000 / 692,000 bytes (raw/gzip/Brotli), so adding tooling cannot hide
runtime growth. Browser and minimal-consumer limits are unchanged. Total package
JavaScript is now bounded at 4,020,000 / 1,259,000 / 1,060,000 bytes.

Removal target: ratchet tooling toward the measured graph sizes when changing its
owner. Split 2D and 3D authoring only after a real consumer demonstrates a smaller
complete tool installation or startup cost; do not extract editor ownership merely
to move these bytes into another package.
## Touch of Death delivered browser runtime audit (2026-09-24)

A fresh Bun browser/IIFE/minified build of the dedicated 3D entry matches the
delivered runtime SHA-256
`8b708e2d4e86467584a271e7a445a831a07b7a5af2e250c48a1232f79a3dd76d`:
1,212,484 raw / 369,438 gzip / 300,115 Brotli bytes. The import graph contains no
delivered `dist` modules; the previous source-resolution and 2D/3D entry fixes
are already present. Evidence: `.local/touch-of-death/bundle-audit/final/`.

An audit-only probe moves the unchanged 2D timeline placement validator and its
numeric assertions into a leaf module. This avoids retaining runtime timeline
code through editor timeline validation and measures 1,199,659 raw / 366,246 gzip
bytes: only 3,192 gzip bytes (0.86%) saved. This is not a correctness-qualified
candidate. Defer the refactor: it falls below the usual performance threshold,
adds a validation boundary, and cannot resolve the existing package ceilings.
No production code, exported HTML, package artifacts or budgets changed.

These are game runtime measurements, not the generic installed authoring runtime
or complete engine distribution. The last completed package report remains
`.local/engine-release/bundle-sizes.json` (2026-09-24 15:23 UTC), with failing
budgets. A passing fresh game build does not close that release blocker.

# Touch of Death AI match candidate — 2026-09-22

The subsequent combat-audio candidate adds cue mapping, asset validation and
presentation-only spatial playback. The final runtime-3d graph is 622,448 raw
bytes and standalone is 908,675 raw bytes, both above existing limits.
The embedded local demo is 7,890,805 bytes including the user's 4.9 MB MP3 and
31 short WAV assets. Runtime and editor owners retain the same release-budget
blocker; limits are unchanged. Installed-consumer and browser audio checks pass.

Engine project-runtime and editor standalone owners added deterministic AI,
match phases, score/reset handling and portable match saves. Before this change,
runtime-3d measured 602,693 raw / 185,824 gzip / 152,158 Brotli bytes and standalone
888,870 / 270,001 / 220,038. The completed candidate measures runtime-3d
617,186 / 190,671 / 156,422 and standalone 903,448 / 274,867 / 224,299.
Combat remains 24,715 raw bytes. These are package graph measurements, not the
size of the embedded demo assets.

Existing limits are unchanged. Runtime-3d and standalone now exceed their budgets;
aggregate limits also fail, including this growth. Project and timeline graphs
already exceed their independent ceilings. Browser acceptance and engine build
pass, but this candidate does not claim release readiness. Before release, the
owning runtime/editor maintainers must reduce these graphs or review a documented
feature-budget migration; this report does not silently grant more headroom.
