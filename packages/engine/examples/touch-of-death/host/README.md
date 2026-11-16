# Local combat relay

For the bounded external-player acceptance slice, see
[playtest instructions](../docs/touch-of-death-playtests.md#october-7-2026-bounded-single-player-test)
and [candidate status](../docs/touch-of-death-demo.md#october-7-test-candidate).
With the extracted host running through the supervisor, run:

```text
bun packages/engine/examples/touch-of-death/host/verify-test-build.ts <returned-game-url> <evidence-directory>
```

This opens an owned fresh headless browser and uses ordinary menu/keyboard input
for three first-to-three AI sets, rematches, pause, title and reload. It records
screenshots, state/resource observations, document digest, errors and frame timing,
then closes its browser. It never manufactures combat outcomes. A functional
pass is not performance, physical-controller, audible-mix or public-deployment
certification; slow measured frame intervals are reported explicitly.

Use `--sets 1` for a bounded live deployment smoke after the full extracted-host
run (`--sets` accepts 1 through 3). Add `--production-defaults` to require fresh
and reloaded rAF pacing, telemetry off, full rendering/simulation at 100% resolution,
and the local `post-first` HUD preference with the original suspended fallback.
These settings are captured in the result independently of frame timing.

Add `--menus-only` to verify seven title routes and Back navigation at desktop and
390px widths. Run it against the packaged game host, which provides the expected
local policy/demo endpoints. The music review server alone does not provide those
services. This mode captures navigation evidence and does not claim match acceptance.

For the game's original SFX, variation banks and calibrated character voices,
use the [audio installation workflow](../../../../../apps/engine-editor/scripts/touch-of-death-audio/README.md). It operates the canonical
project through editor commands; re-export after changing assets or runtime.

The local/package relay reads its trusted portable pair directly, bounded to
512 MiB packed and unpacked bytes and 5,000 assets. It retains asset hash checks
and passes original byte arrays to simulation without a base64 hydration copy.
Browser editor command hydration keeps its 24 MiB default and 256 MiB ceiling.
The October 1 arena inventory reached 266.7 MiB and exposed the old host's use
of that browser ceiling. `relay.test.ts` verifies exact catalog/byte preservation
and rejects an oversized archive header before allocating its declared payload.

Hosted deployments use PostgreSQL through `DATABASE_URL`; local runs without it
retain SQLite. All durable accounts, profiles, ratings, rewards, social records
and uploads follow that selection. The Railway image requires PostgreSQL and
uses one shared pool, closed after rooms drain. Live rooms still require one
replica. See [Railway setup](package/README.md#railway) and
[database verification](postgres/README.md). Local databases are never imported
or deleted automatically.

The managed dev relay explicitly chooses `TOUCH_OF_DEATH_STORAGE=sqlite`, even
when the shell inherited a database URL. Its SQLite path defaults to
`../community.sqlite` relative to the project, with `TOUCH_OF_DEATH_DATABASE_PATH`
as an override. Stop/start an already-running managed relay to apply a storage
change; healthy server reuse does not change its environment. Railway requires
PostgreSQL and runtime credentials. Packaging carries only the approved dev policy
as a nomination for fresh Railway evaluation; see [weight promotion](package/README.md).

Hosted games share one canonical AI policy through the same database. Computers
train locally and nominate compact candidates in one-minute upload batches;
only independent server evaluation can promote shared weights. Reads cache for
30 minutes, and new revisions apply at the client's next match after refresh.
See [shared learning](policy-learning/README.md) for evaluation, concurrency,
rollback, recovery, retention and remaining strength limits.

Runtime identity is now `combat-v39:`. Version 39 adds 30 post-KO simulation ticks, doubles minimum round-recovery separation and initializes the title with the queued match spawn/layout. The recovery rig also preserves shared limb joints. Version 38 preserves contact observations and warm-start memory in new portable saves, avoiding stale grounded state after a load or reconnect. Legacy saves without contact history start with an empty contact cache. Version 37 saves cosmetic wheel travel with vehicle stops so wrecks and restored checkpoints retain the exact wheel phase. Version 36 adds continuous forward traffic circuits, rotating collision shapes and impact-heading wreck persistence. Re-export clients and restart the relay together; incompatible restore behavior cannot share deterministic sessions. Version 33 adds cumulative contextual learning, stable personality scoring and explicit training exploration. Local general-model updates activate without offset approval; only prior contextual observations have an explicit migration path. Version 32 prevents already touching fighters from crossing thin walls or floors into a far-side overlap. Version 31 adds environmental out-of-bounds KOs and safe next-round recovery after falls. Version 30 adds velocity-sensitive impact and revised hitstun, launch, recovery, DI and single-hit wheel tuning. Version 29 uses contextual adaptation by default; browser search sets also retain a separate local lesson bank, while held-out and trusted offset evaluations start fresh models. Version 28 bounds wall-run AI inputs on sloped walls, preventing long training runs from failing input validation. Old policy evidence remains in its original content namespace and is not silently reused with the changed simulation. Version 18 adds late analog DI, longer pauses/hitstun and destructible hit-volume contact. Version 17 adds charged Drive travel, revised hitstun/parry timing and observable weapon AI. Version 16 adds the wider held-jump range, heavy-crushable kick armor and glancing-contact CCD correction. Version 15 removed privileged AI input reads and added seeded fast traffic contacts. Version 14 added collision-aware round recovery; version 13 added seeded match layouts,
prop placements, object-end pickup reach, grapple-break recovery and stronger
material-dependent held weapons. It retains finishing-hit stop, the live post-KO
window, separate jump and movement, held jump height, wall-run
air-dash recovery, direct structure strikes, persistent rounds and
rotating match starting locations. Older exports and recordings require
their original runtime. Re-export the canonical project and restart its relay
after updating; protocol version alone does not migrate a fight's state.

The browser sender, private/training relay, community room, Quick Play room and
trusted judge all admit `interact` alongside move commands. Grab, pickup and
throw are shared simulation inputs even though they are not authored move IDs.
All hosts and portable fighter/rollback/replay adapters derive that list through
`combatInputActions3D`. Held-weapon templates and synthesized variants resolve
from ordinary `jab`/`heavy` intent inside simulation; their internal commands must
not become network actions. Custom ordinary moves remain admitted, and set versus
training mode controls `match:rematch`. The relay retains its 24-action/32-byte
limits. The full-city catalogue regression in
`apps/engine-editor/src/scene3d/game-integration/city/traffic.test.ts` creates all sixty
pooled weapons and a real relay room, checks those bounds, and excludes internal
weapon commands. This prevents inventory growth from breaking host startup.
`community/judge.test.ts` covers judge admission, and the two-client browser
check in `.local/touch-of-death/flow-polish/` covers real exported input delivery.

## HTTPS reverse proxy

Guest-enabled hosts accept `TOUCH_OF_DEATH_PUBLIC_ORIGIN=https://game.example`
(an exact HTTPS origin, without a trailing slash). Set it together with
`TOUCH_OF_DEATH_DEMO_HTML` before starting. The backend defaults to loopback. Railway packages set `TOUCH_OF_DEATH_BIND_ADDRESS=0.0.0.0`; this requires the public HTTPS origin and disables backend-only routes.
An independently provisioned TLS proxy must preserve the configured public Host
and support WebSocket upgrades. Public routes are `/`, `/tod-demo.json`,
`/tod-guest-session`, `/tod-guest-recovery`, `/tod-ai-policy` and
`/tod-ai-candidates`; upgrades require `/` and the exact
configured browser Origin. The engine request guard runs before HTTP routing and
WebSocket admission. Forwarded headers never select the trusted account origin.
Discovery advertises `wss:` and guest cookies are Secure and HttpOnly.

An optional `TOUCH_OF_DEATH_PREVIEW_ORIGIN=https://preview.example` names one
additional exact HTTPS address for local play and browser AI training. It requires
a distinct configured public origin. The preview accepts `GET`/`HEAD /` and
`GET /tod-health`; its `GET /tod-demo.json` returns 404 so the client does not start
hosted sign-in there. Sessions, recovery, shared policy reads/uploads, WebSockets,
and operational routes remain unavailable at that address. This does not change
the primary sign-in origin or grant guest access when Clerk is configured.

`/tod-health` exposes only database-backed readiness. Detailed health, stats and moderation remain available only through a loopback-bound backend;
moderation retains its token checks. Anonymous replay archives remain unavailable.
Choose the stable origin before distributing recovery files: they are bound to it.
Without this setting, existing loopback demo behavior is unchanged. This setting
does not provision hosting, DNS, certificates, TURN or public moderation operations.

Validate with `bun test ../../packages/engine/examples/touch-of-death/host/public-origin.test.ts
src/server/runtime/request-guard.test.ts` from `packages/engine`.

For a runnable folder outside the checkout, use the
[portable local host builder](package/README.md). It packages the existing game
and host; it does not provision a public service. During repository acceptance,
set `TOUCH_OF_DEATH_HOST_ARTIFACT` to the extracted `host.js` and use the managed
`combat-relay` surface with its extracted project directory. Set explicit HTML,
database and prebuilt moderator-script paths as described in the package README.

The demo host precompresses the static exported HTML once at startup. Browsers
that accept gzip receive the compressed bytes; other clients receive the original
UTF-8 document. `Accept-Encoding` preferences and exclusions are respected, with
`Vary: Accept-Encoding` and exact response lengths. This changes transfer size,
not the exported file, runtime identity, project data or account responses.

Run from the repository root in PowerShell:

```powershell
$env:TOUCH_OF_DEATH_PROJECT_DIR = (Resolve-Path '.local/touch-of-death/project').Path
bun.cmd .agents/skills/dev-server/scripts/dev.ts start combat-relay --json
```

Use the returned URL, then fetch `/combat-config.json` for the endpoint, room and
match identity. Defaults are room `arena`, room type `combat-relay`, match
`local-bout`, seed `7`. Use distinct explicit local development tokens such as
`dev:local-a` and `dev:local-b`. These are not public authentication credentials.
The relay binds only `127.0.0.1`; the supervisor owns its hidden process tree.
It opts into `reconnectGraceMs: 10000` (the engine default is zero). Unexpected
transport loss reserves the original seat and room capacity; matching fresh
authentication may reattach the same player ID. Explicit leave and grace expiry
are terminal. Playing Quick Play/KOTH departures use durable concessions; already
judged results take precedence, while unfinished host shutdown aborts unrated.
This preserves a running client's world, not page-reload or server-restart state.
Production one-use access tokens require the client's fresh `getToken` adapter;
reusing the local development token is not a production authentication design.
Each independent player/test run needs a distinct token. Reusing one across rooms
replaces the old session, which now shows a clear sign-in-elsewhere recovery message.
Parallel test journeys also need distinct room IDs: use a scenario prefix and UUID,
not only a timestamp. Two export checks started in the same millisecond and joined
each other's room; the preserved reproduction is
`.local/touch-of-death/spectator-ui/parallel-room-collision-*.json`.

The entry reads and validates the project through `readHyperfocusProjectPair`.
It never writes canonical data or exported HTML. Content identity is
the shared `combatContentPrefix` (`combat-v39:`) plus SHA-256 of `combatContentSource(project)` in
`packages/engine/examples/touch-of-death/src/network/identity.ts`. It migrates and stably serializes
the complete project while normalizing only `createdAt` and `updatedAt`; validated
editor export changes authoring timestamps without changing game content. Rules,
scenes, schema fields and asset digests remain in the identity. The client
must independently calculate the same identity from its loaded project. Restart
the relay after canonical project changes; it reads configuration once at startup.
The prefix versions runtime semantics as well as wire compatibility. Bump it when
simulation or set-lifecycle changes would make otherwise identical projects play
differently. Version 2 adds complete sets and mutual rematch; older single-bout
exports must fail admission even when their project bytes match. Version 3 uses
portable simulation arithmetic so tested Chrome and Bun contact states agree
exactly; native-math version 2 recordings and peers are incompatible.
Version 4 adds reserved-seat recovery and durable departure concessions. Older
exports cannot interpret the recovery phase and must not join these rooms. The
simulation is unchanged, but old version-3 recordings still require their matching
export; this pass does not migrate replay identities.
Version 5 reserves browser-safe close code 4002 for temporary transport suspension
and treats other terminal client close codes as scored departures. This lets a
fighter briefly switch tabs without losing the live world; the existing ten-second
host deadline still applies. Hidden lobbies/viewers retain their socket. Earlier
hosts do not understand suspension, so matching version-5 exports are required.
Re-export the game through the validated editor workflow separately.

Community protocol 11 and Quick Play protocol 10 retain immediate sharing and
equipping of unreviewed player images, with hide/block/report and later moderator
removal. Older clients enforce approval-only display and are rejected at admission.
Profile protocol 5 and training protocol 5 include explicit room image capability
and block/error metadata for private fights and shared training. These versions
also require the expanded account reward state for bounded friend-play coins;
see [rewards](progression/README.md). Older clients must reload the matching export.
Community version 10 also retains durable voice incident reporting. Both room
versions require delivery-probe responses for corroborated quality recovery;
older exports must use their matching host. See [quality policy](quick-play/README.md).
The relay
stores metadata-only reports through its existing persistence adapter; no audio
or signaling is recorded. Older community clients must use their matching host.
An optional validated initial profile durably initializes revision zero before
admission. Existing host profiles are preserved; explicit publication replaces
them. Unsaved defaults and wardrobe drafts are never offered automatically.
These appearance changes do not change combat identity or replay simulation.

After runtime edits, wait for the managed editor's successful rebuild before
loading it for Build/download. Verify the downloaded file with
`bun packages/engine/examples/touch-of-death/host/export-runtime.ts .local/touch-of-death/touch-of-death.html`.
This builds the current standalone source and compares its complete escaped script
with the artifact. It never patches generated HTML. Loading the editor before its
rebuild finished reproduced stale keyboard handling in Quick Play; evidence is
`.local/touch-of-death/quick-play-ui/native-accept-failure.json`. Runtime/editor
owners must keep this freshness check in the export verification path.

```powershell
bun.cmd .agents/skills/dev-server/scripts/dev.ts errors combat-relay --json
bun.cmd .agents/skills/dev-server/scripts/dev.ts stop combat-relay --json
```

Private bouts support two fighters, six spectators, first-to-three sets and mutual
rematches. A fighter departure interrupts the room; spectator departures do not.
Use a new room ID or restart the service for a fresh local test.
Community rooms below add durable membership and rotation. The packaged Railway configuration and Clerk OAuth support public hosting; external service configuration and live acceptance remain operator work. No paid services or public ports are
provisioned by this command.

## Confirmed input recordings

Account rewards are available through the exported Rewards dialog on supporting
rooms. See [progression](progression/README.md) for daily/streak/wheel/box tuning,
trusted set grants, device/account separation and retry guarantees.

The private-bout relay retains up to eight room recordings, each with at most 36,000
confirmed frame pairs (ten minutes at 60 Hz). `GET /combat-recordings.json` lists
retained rooms; `GET /combat-recording.pb?roomId=<encoded-room-id>` downloads a
[protobuf archive](../src/replay/README.md) and any stopped reason. The existing
`.json` route remains an explicit human-readable/legacy export. Both downloads
stay local-development-only. Storage is process memory: download
before restarting. Reaching a recording limit stops recording, never the fight;
additional rooms beyond capacity continue playing without being recorded.

These records contain accepted inputs, content identity, seed and transient seat
IDs, not access tokens or authoritative damage/results. They use the engine's
validated combat recording format. Players can also save their own accepted-input
recording through the exported game's Save replay control and open it with Watch
a replay. Community Save replay captures the current battle; the HTTP archive
currently records private bouts only. Production recording storage,
authenticated download policy and retention controls remain host work.

## Spectator transport

Join with `role: 'spectator'` in the ordinary combat join request. The relay sends
up to 120 confirmed input pairs from frame zero, then responds to authenticated
`combat-spectator-cursor` events as playback consumes each window. Fighter inputs
and spectator windows use the existing bounded binary schema; viewers never send
fighter input or occupy combat seats. Cursor progression cannot change the fight.
History ends after 36,000 pairs: new spectators receive an explicit admission
failure and existing viewers receive `archive-ended`, while fighters continue.
This process-memory history is separate from the optional HTTP download archive;
it does not itself persist membership or decide rotation.

## Two-player training

`GET /training-config.json` advertises room type `tod-training`. In Play with
friends, choose Two-player training and share the room invitation; each person
uses their own access token. The second human starts an unscored training attempt.
Both fighters use ordinary movement, committed attacks, damage, stamina and
defense. A KO remains until the partners agree to reset; there is no automatic
health refill or training-only defensive permission.

Either person can propose Reset or Swap sides. The partner must accept within
15 seconds. Declining or timing out preserves the exchange. Acceptance creates a
fresh attempt at the authored starting positions; swapping also reverses control
seats. Both remain on their original connections, and old-attempt inputs cannot
enter the new attempt. A disconnect interrupts training and cancels proposals.
These are resets to the authored start, not arbitrary position bookmarks.

Save replay downloads the current confirmed attempt with its explicit training
mode; replay playback and takeover retain those rules. Training is separate from
MMR and community winner rotation. Live attempts are not durable across a host
restart. See [training host policy](training/README.md) for authority and tests.

## Uploaded pictures

Supported community, Quick Play, private and training rooms expose
[uploaded pictures](uploads/README.md): bounded PNG/JPEG preparation, private
local previews and explicit immediate sharing through the authenticated socket.
Shared unreviewed images may display and equip; hide, block and host revocation
clear cached views. Players can report shared images; an opt-in
[local moderator screen](uploads/moderation.md) handles preview, approval,
rejection and report resolution using separate host credentials. Shared owned
pictures can be equipped as durable Top prints and profile emblems; the
catalog supplies permitted targets. Both fighters render the print, tinted by
their chosen clothing color. Community/Quick Play equipment changes are limited
to waiting or idle/results; private fights and training permit continuous cosmetic
changes and warn that combat continues. Cosmetic replays and public moderator
operations remain unfinished.

## Room voice

Winner stays rooms offer **Join voice** for up to eight people. Admission to the
game never requests microphone permission. Voice starts muted; **Unmute mic**
waits for host acknowledgement. A persistent mic button remains available during
fights. **Deafen** mutes incoming audio and the local microphone; undeafening
does not automatically unmute. **Leave voice** stops capture and closes peers.
Room mute applies to playback; blocking removes both participants' connection
to one another while preserving everyone else's call. Voice survives normal
fighter/spectator rotation and stays outside saved combat replays.

The local default has no external connection servers. For a configured host,
pass `voice: { iceServers, iceTransportPolicy }` to `startLocalCombatRelay`, or set
`TOUCH_OF_DEATH_VOICE_CONFIG` to the equivalent JSON before starting its managed
process. Restart an existing host to change this configuration. Each ICE server
contains `urls`, optional `username` and optional `credential`; policy is `all`
or `relay`. Relay-only requires a TURN server. Configuration is validated before
opening storage and is sent only to opted-in clients, not written into the game
export or public config endpoint. No public STUN/TURN service is provisioned by
this local workflow. See [voice authority and limits](voice/README.md).

## Community and Quick Play admission

For same-origin guest onboarding, pass `demo: { artifactPath }` to
`startLocalCombatRelay`, or set `TOUCH_OF_DEATH_DEMO_HTML` to an already exported
HTML file before starting the managed relay. Set `TOUCH_OF_DEATH_DATABASE_PATH`
to isolate its SQLite state. The host serves that unmodified export at `/` and
advertises its content identity, endpoint and supported rooms at `/tod-demo.json`.
The demo HTML is read once at startup. After exporting a new build, restart this
host and compare the served response hash with the artifact before browser QA.
Reusing a healthy host does not reload its HTML. The preserved mismatch in
`.local/touch-of-death/live-image-report-ui/` caught this during live-report QA;
the existing browser artifact-hash check must remain in that workflow.
The configured address is `http://127.0.0.1:<port>`; localhost aliases are rejected.
The guest endpoint issues an HttpOnly account cookie and fresh single-use socket
credentials, so this mode does not accept development tokens. Anonymous combat
archive routes are disabled. See [guest identity and bounds](guest-session/README.md).
The default relay mode below remains available for explicit local development.

Online Quick Play uses `/quick-play-config.json`, room type `tod-quick-play` and
fixed room ID `quick-play`. Choose **Online Quick Play** in the export, enter this
host's endpoint and a distinct development token, then Search. Two compatible
players must both Accept before fighting. The host measures connection round trips
and reads its stored ratings; queue commands cannot supply a rating or a winner.
Results and Play again retain the connection. See [Quick Play host policy](quick-play/README.md)
for shared outfit visibility: only the current opponent can fetch equipped
pictures, and equipment changes are available while idle or after a saved result.
The same policy document covers tuning, interrupted-match limitations and the test boundary. This local setup
requires connection details in default development mode; the optional hosted
demo supplies same-origin guest admission without deploying a public account service.

`GET /community-config.json` advertises room type `tod-community`, default room
`friends`, and the same loopback endpoint and content identity. In the exported
game, select a community room and join as Fight to queue or Watch to spectate.
Use a distinct local development token for each person. These tokens are only for
loopback testing; this host does not provide deployed public authentication.

The lobby, fighting and spectating share one authenticated socket. Two queued
players have 15 seconds to ready up. Each battle is first to three; the winner
stays until three consecutive set wins, then rotates. Unready players leave the
queue until they rejoin it. Disconnected membership retains its queue reservation
for 30 seconds. This queue reservation is separate from the ten-second live
transport grace: terminal fighter leave, duplicate login, recovery expiry or
nonrecoverable close during play concedes through durable rotation. Already
judged results take precedence; ready-phase departure and unfinished host shutdown
remain unrated interruptions. See [community policy](community/README.md).

A host simulation judges accepted inputs. The result remains visible for three
seconds before the room persists rotation. Quitting after the result is earned
cannot erase the loss; a failed save freezes the battle and retries before the
next pairing appears. Readiness and result deadlines use epoch milliseconds,
independently of the server's simulation clock.

The host stores community state in `community.sqlite` beside the project directory
by default. Programmatic hosts can pass `databasePath` to `startLocalCombatRelay`.
Restart preserves membership and queue policy, interrupts unfinished battles and
requires fresh readiness. See the [community implementation](community/README.md)
for persistence ownership and tests.

For manual verification, join three distinct users, ready the first two, earn a
set and check that the waiting user becomes a fighter without reconnecting.
Then check queue withdrawal, ready timeout, fighter departure and host restart.
Browser acceptance is recorded separately in the delivery ledger; this README
does not substitute component tests for the complete exported-game journey.

## Local AI review receipts

The fixed loopback-only `GET /tod-cpu-usage` route supplies system-wide CPU usage
from OS counter deltas, cached for one second, to the bulk-training screen. It
exposes no process list, accepts only same-origin requests, and is unavailable
on public-bound hosts. Offline builds show that usage is unavailable. Native
route tests run with `HARNESS_TEST_SKIP_UI_PRELOAD=1` so the DOM test shim cannot
strip the security headers under test.

Optionally set `TOUCH_OF_DEATH_AI_RECEIPTS` to a reviewed receipt JSON manifest
before starting the managed relay. The fixed `/tod-ai-ingestion-receipts` GET
route serves at most 64 validated receipts (64 KiB), without CORS or caching. It
accepts only the backend's exact loopback origin and never serves receipts on a
public-bound host. Query-string file selection is rejected. The file is loaded
once at startup; restart the managed host when publishing another review.

The local game checks this route at launch and marks only exact evidence digests
already present in its own browser history. It does not upload logs or alter AI
policy. Offline/public builds use AI insights ? Import review receipt.
