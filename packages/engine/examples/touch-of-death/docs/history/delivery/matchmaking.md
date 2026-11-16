# Touch of Death: matchmaking evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Compact Quick Play results (2026-09-24)

The pose pass proved desktop celebrations but its 390-pixel screenshot showed
the expanded upload editor covering nearly the whole result screen. This was the
highest-leverage remaining issue on that surface: every set ends there, both
novices and experienced players need the next-match controls, and customization
should not hide the fighter it celebrates. A native disclosure was lower risk
than changing camera framing or adding another screen.

Quick Play now keeps Play again, Save replay and Leave visible above **Pictures
and fighter**. The disclosure contains the existing profile, upload, image block
and report controls. Children stay mounted, preserving drafts and focus through
ordinary renders; closed controls leave keyboard navigation. A new fight or
disconnect closes it, and hosts with no available content show no empty control.
Result spacing shrinks while action and summary targets remain at least 44 pixels.
Saving and interrupted-result explanations remain explicit.

Ownership is `scene3d/network/quick-play/panel.ts` and its mounting integration in
`scene3d/network/panel.ts`; no engine, project format, canonical data, asset or
combat rule changed. Twenty-two focused panel tests / 233 assertions, editor test
types, editor build and process policy pass. Native editor Build/download and
the portable package validator produced HTML SHA-256
`df07339b2fb606a9b279d569c63f95c1d667824dc84f5723c9b3aed5a46c184b`.
Combat content identity and replay compatibility are unchanged from the pose pass.

The external package passes 24 browser checks and two read-only SQLite checks.
Real controls earn the set and save its replay; Play again clears the result.
At 390×844, the collapsed panel measures 231 pixels (27.4% of viewport height),
with winner salute and defeated opponent visibly above it. Enter opens the
disclosure, Space closes it, closed file controls are invisible and excluded from
Tab, and Hide uploaded images still works. All tested action targets are at least
44 pixels. No browser or host errors remain; owned test processes are stopped.
The shared loopback demo serves the identical package with its existing account
database preserved. Evidence lives in `.local/touch-of-death/compact-result-audit/`.

Manual check: finish a real Quick Play set; inspect the result at desktop and
390-pixel width; open Pictures and fighter with Enter, use Hide, close with Space,
Tab past it, save the replay, then Play again. Narrow Game settings still overlaps
part of the top result heading; the outcome, fighters and actions remain readable.
This minor layout debt is separate from the now-closed celebration obstruction.

Changelog: compacted Quick Play results, kept primary actions visible, and moved
customization into a state-preserving native disclosure with full-size targets.

### Earlier exported Quick Play candidate (2026-09-24)

HTML SHA-256: `d8980ba67041e1a6b61ac9c7710c05ebd6a80338c1cd668ec494d045ada5a024`.
Validated editor Build/download preserves canonical project hash
`0a7a77f159775343a55e304327d623d9ec3f0cbd6de908aa217e080b4e64a63f`.
The export verifier compares the entire embedded runtime with a fresh source
build, catching a stale editor tab even when the engine package has been rebuilt.
No canonical project, authored asset or generated HTML was manually patched.

Four separate Chromium clients pass 19 checks in
`.local/touch-of-death/quick-play-ui/result.json`: search/cancel, native Enter/Space
acceptance, two isolated pairings, 39 ordinary keyboard attacks earning a complete
set, a single 1012/988 rating result, same-connection search and persistent ratings
after rejoin. Result Save replay downloads 2,522 confirmed paired frames; file
import and fighter takeover pass. The other pair remains playing and undamaged.
Narrow ready/result screens are unobstructed. No uncaught browser errors occurred;
all four owned browser process trees were cleaned up without visible windows.
Read-only SQLite inspection passes eight checks in the same directory's
`persistence.json`: exactly one completed receipt, correct participants/winner,
1000-to-1012/988 updates and no remaining rating lease for either participant.

Focused Quick Play, community and client network tests pass 104 tests with 10,042
assertions, including physical success, invalid admission, stale connections,
failed saving/retry and retained replay isolation. Editor source/test type checks
and installed-consumer verification pass. Bundle ceilings still fail; none were
raised. Source structure reports only the unrelated PadPilot evaluator baseline.
Process policy passes across 3,685 files with zero violations. Repository-wide
diff whitespace checking still reports existing issues across the dirty worktree;
this candidate does not claim a clean repository-wide gate.
The preceding `47fffd50c5407d1371e1b580a8dce3b3c3f86dde91f47686fa1b6849877618bc`
export also passed 22 community rotation checks; those are not a fresh run on this
replay-retention candidate.

Quick Play uses stored MMR, compatible content and recent host-measured latency.
Both players accept within fifteen seconds. An earned result survives departure
and waits visibly when durable saving fails. An unfinished disconnect currently
aborts without rating changes: this permits loss avoidance and blocks public
competitive release. Automatic recovery, public accounts/hosting and wider device
or internet acceptance are still missing. Local development tokens are not public
authentication.

Manual verification on this artifact:

1. Open four browser instances, choose Online Quick Play, and connect using the
   local relay's development identities. Search, cancel, then search again.
2. Accept both pairings with Enter/Space. Move and attack in one fight; verify the
   second fight remains independent. Use actual contacts to finish the set.
3. Check winner/loser ratings, save the result replay, search again, then leave
   and rejoin. Confirm the saved rating remains.
4. Return to the local menu, import the downloaded replay, seek an exchange and
   take over either fighter. Confirm ordinary inputs control that fighter.
5. Decline or let readiness expire; verify no fabricated win or rating change.
   Interrupt an unfinished fight and verify its explicit interruption message.

Changelog: added local MMR Quick Play with cancelable search, mutual ready checks,
isolated concurrent fights and durable host-judged ratings; preserved completed
replays through the result screen; fixed native keyboard acceptance and overlapping
menu controls; reject stale exported runtimes during delivery verification.

### Quick Play backend preparation (2026-09-24)

Application pairing, durable ratings and engine group/finalization tests pass
27 tests with 205 assertions. Evidence covers four-user skill pairing, reciprocal
bounded widening, absent/slow/incompatible peers, atomic SQLite rollback/reopen,
concurrent reservation, cancellation races, delayed recovery after failed rating
reservation, and result-committed/ticket-release-failed retries. These tests use
trusted synthetic result inputs to check transactions; they do not prove physical
Quick Play combat or a delivered player journey. Engine source/test/tooling type
checks and installed-consumer verification pass. Bundle ceilings remain failing;
source-structure checking reports the unrelated PadPilot evaluator directory
above its existing file-count baseline. No authored project or export changed.
See [host policy and next integration](../../../host/quick-play/README.md).
