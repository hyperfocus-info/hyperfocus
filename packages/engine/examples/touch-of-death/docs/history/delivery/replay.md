# Touch of Death: replay evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Controller replay and seek-draft repair (2026-09-24)

The controller audit found two high-impact gaps in the immediate learning loop:
Watch and replay controls were absent from controller navigation, and moving
focus from an edited frame to Go let rendering silently replace the requested
frame. The exported browser reproduction edited frame 185 but submitted the
current early frame; takeover then correctly remained movement-locked during
countdown. This was a seek UI defect, not an exception to combat commitment.

Ranked work: (1) preserve seek drafts across focus/render changes, affecting both
keyboard and controller users; (2) expose existing replay controls to controllers,
with exclusive dialog focus; (3) consume confirmation/navigation inputs until
release, including remaps that share Drive or Pause. Each has a bounded UI/input
boundary and a concrete regression. Cosmetic controller glyphs, new replay
storage and broader online-form navigation were deferred.

Implementation lives in `scene3d/input/gamepad-menu.ts`, `scene3d/replay/panel.ts`
and `standalone-3d.ts`, with focused tests beside the first two. Replay controllers
can reach Watch, retained recordings, playback, frame adjustment, takeover and
return. During takeover, the authored controller Pause binding toggles navigation;
ordinary gameplay remains in its original mode. Drive-tap detection uses routed
inputs, so a held confirmation cannot become a jump on release. Invalid seek
drafts remain editable; successful submission or leaving playback clears them.
No new authored values, project mutations or protocol versions are required.

Manual check: record a physical online hit and leave. With a standard controller,
select Watch and the recent recording, play/pause, edit Frame with left/right,
move to Go and confirm. Verify the requested frame survives focus changes. Take
over, hold Confirm briefly without jumping, then release and move with the stick.
Use the authored Pause binding to open controls and return to local play. Repeat
frame editing with keyboard Tab. Physical-device qualification is separate from
browser Gamepad API fixtures. Browser failures and repair evidence are retained
under `.local/touch-of-death/controller-replay-audit/` and subsequent fixed runs.

Final validation: 167 input, replay and network tests passed with 1,387 assertions;
24 AI and physical-surface-contact tests passed with 1,919 assertions. Source/test
types, editor build, validated Build/download and process policy passed. Eighteen
checks on the extracted package verified the standard Gamepad API in slot 3,
controller-only replay traversal, frame 185 actually reached before takeover,
held confirmation without a jump/attack, and fresh left-stick reversal from
x=-1.25 to x=-2.65. Pause opened controls without activating Return. Desktop and
390px controls fit. The original online contact used real keyboard inputs;
physical controller hardware was not exercised.

A follow-up on the same delivered HTML passes six local AI controller checks:
D-pad/Confirm selects level 1 and starts; stick movement and Strike produce a
physical hit (opponent health 100 to 92); held Guard absorbs incoming contacts
(integrity 100 to 80, health 100 to 95.8); disconnect releases Guard. It uses the
standard Gamepad API at slot 3 with read-only snapshots and no injected damage,
stun or position changes. There were no browser errors, and the owned browser
was cleaned up. Evidence: `.local/touch-of-death/controller-local-ai-audit/`.
Repeat those actions on physical hardware before device qualification. Combat
control hints derive from authored bindings, including R1 Feint and Drive +
Strike for flurry.

The audit separated product defects from fixture assumptions: physical coasting
and settling do not imply leaked input, bounded seeks must finish before takeover,
and the authored Pause button is also a menu Confirm binding. Regressions enforce
that navigation toggles take priority over confirmation, and confirmed aliases
cannot also reach the host pause handler. Keyboard Escape retains replay pause.
The final browser report contains no runtime errors; owned browsers and temporary
host were cleaned up. Evidence is in
`.local/touch-of-death/controller-replay-final-audit/`.

Delivered HTML SHA is
`9fa1a167c6ed89deeed4b2757c9be46504ee24e95bdea6da9f2b88b026d1db2f`;
runtime SHA is
`8b708e2d4e86467584a271e7a445a831a07b7a5af2e250c48a1232f79a3dd76d`.
The clean package `.local/touch-of-death/releases/controller-replay-final-20260924/`
matches every payload in the tested external installation and has no account data.
The refreshed shared host serves that HTML. Project hash, asset bytes, content
identity and protocol versions are unchanged. Changelog: added controller replay
navigation, retained edited seek frames across focus changes, and prevented
overlapping confirmation/Drive/Pause inputs from triggering extra actions.

### Fresh combat-v5 replay acceptance (2026-09-24)

The current `ff5287e92faba31d0a0e84be4baefbf6e8d516887adbd7653d25af8acd258346`
HTML passes 17 new browser checks using a fresh online recording. Two browsers
move and strike through native keys, then download confirmed inputs through
**Save replay**. A third, clean browser loads the HTML offline and imports that
unchanged file. Seeking to the dynamically captured hit frame reproduces the
entire live gameplay snapshot exactly. Attacker takeover can decline the opening
or land a real jab; defender takeover can guard and change the exchange. Wrong
content rejects without changing local play. Native keyboard Return passes, and
the narrow layout is captured for review; no browser errors or leftover owned
processes/windows.

Evidence: `.local/touch-of-death/replay-v5/result.json`, `recording.json` and
`takeover-narrow.png`. Opening frame 244 and comparison frame 293 were observations
from this run, not imposed simulation state or fixture constants. This closes the
stale replay-file acceptance gap recorded in the preceding export audit. It does
not qualify other browsers, physical controllers, or cosmetic replay recording.

### Exported replay candidate (2026-09-24)

HTML SHA-256: `5771f51cfef777460b837cfc8ee7710fafef78511f0b49641db7554263f8b24f`.
Canonical project hash remains unchanged. The editor's validated Build/download
workflow produced this artifact after rebuilding the engine's packaged runtime;
source files alone do not update the runtime embedded by export.

Online **Save replay** downloads both fighters' server-confirmed inputs without
tokens. **Watch a replay** reads that file locally, starts paused, offers Play/Pause,
frame seek and takeover of either fighter, and returns to normal local play.
Recorded opponent inputs continue during takeover, then become neutral at the end.
Wrong-version files preserve prior local state. Ordinary local saves are protected
while replay is active; cancellation invalidates pending reads. Long seeks yield
between bounded batches rather than replaying every frame in one blocking task.

This exact export passes 29 online/contact/download/recovery browser checks,
18 full-set/rematch checks, and 18 replay checks. Replay comparison matches the
complete saved physical-hit snapshot at frame 259. Actual J input lands a hit
during attacker takeover; holding L during defender takeover changes the outcome.
Space activates Play/Pause, Enter activates Return, and local AI play still starts
afterward. Desktop/390px screenshots were inspected; owned browser cleanup and
current managed-server error checks are clean. Focused host/recording/replay tests
pass 29 cases / 193 assertions; the physical transport regression additionally
proves both clients export exactly the relay's recording. Engine/editor typechecks,
build and installed-consumer checks pass. Size gates still fail.

Evidence: `.local/touch-of-death/replay-ui/verify.json`, desktop/narrow screenshots,
`network-demo/two-browser.json`, its `downloaded-replay.json`, and
`network-set/two-browser.json`. A browser failure caught Space key-up being consumed
by the game; the host now preserves native replay-control key events. An initial
rerun still contained the old packaged runtime; rebuilding before export resolved
that artifact mismatch. A separate parallel-run admission failure is preserved in
`replay-ui/parallel-identity-failure.json`: shared development tokens invoke the
server's global single-login eviction even across different rooms. Fixtures now
use unique identities. This exposed a real-user gap: superseding a login removed
old replication without notifying/closing its socket. The session-recovery
candidate above closes that gap and preserves a deliberate retry path.

Manual verification: join a private fight, earn a hit/block with real controls,
click Save replay, leave, and choose Watch a replay. Load the downloaded file,
play/pause, seek before the hit, and try each takeover button. Use ordinary Strike
and Guard to change the exchange, then Return to local play and start an AI match.
Repeat with a mismatched recording and a cancelled file read; neither may mutate
the current match. Input-remapping/controller acceptance, contact bookmarks and
friendlier time scrubbing remain useful follow-up work.
