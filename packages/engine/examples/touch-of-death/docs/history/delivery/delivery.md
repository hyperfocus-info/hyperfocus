# Touch of Death: delivery evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### HTTPS origin readiness (2026-09-24)

The local host previously advertised loopback sockets and bound guest credentials
to its backend HTTP origin. A TLS reverse proxy alone could not make that a valid
public demo. The host now accepts one explicit HTTPS origin, advertises WSS,
issues Secure cookies, and keeps account recovery bound to that origin. An
optional engine request guard runs before all HTTP routing and WebSocket upgrades.
Public routes and upgrade origins are restricted; health, stats and moderation
remain on the loopback backend. Forwarded headers cannot select account identity.

The smallest fix is deployment configuration plus the engine admission boundary;
combat, editor commands, canonical project data and exported runtime are unchanged.
26 focused origin, recovery, package and request-guard tests pass (417 assertions),
as do all 173 engine server tests (39,944 assertions) and host typechecking.
Engine build and installed-consumer checks pass; existing bundle ceilings remain
exceeded without increasing limits. Process policy reports zero violations. The package
builder verifies the complete fresh runtime and every embedded project asset.
The resulting package is `.local/touch-of-death/releases/https-origin-final-20260924/`;
host SHA-256 is `83b7972492b12c0e631d2b199af626be853b0c47eaf0b3aeccb4236c8c08cd20`.
Its game HTML and runtime hashes match the [recovery-key candidate](recovery.md#recovery-keys-implementation-and-acceptance-2026-09-24).

The packaged host passes 12 real local TLS-proxy checks: HTTPS guest issuance,
Secure cookies, WSS discovery, accepted exact-Origin upgrade, rejected foreign
Origin, private operational routes and reachable backend health. Evidence is in
`.local/touch-of-death/public-tls-audit/`. The disposable self-signed fixture proves
transport handling, not authenticated gameplay over TLS or public certificates.
Its managed host was stopped; no owned processes or visible windows remain.
The existing shared local demo was left running unchanged.

A subsequent extracted-package browser run closes the authenticated TLS journey:
19 checks pass using native guest admission, Secure/HttpOnly cookies and WSS,
cross-browser key restore, old-session eviction, profile preservation and key
replacement. Two guests join through the UI; keyboard approach and jab produce
a physical hit (100/92 health), without injecting damage or combat state. The
downloaded replay and game snapshot contain no recovery key. The package outside
the checkout matches every manifest payload; its release data directory is empty.
Evidence is `public-tls-audit/browser/result.json` and `public-tls-audit/receipt.json`
under `.local/touch-of-death/`. All owned browser and host processes were cleaned
up. One expected aborted request exercises cancellation; no page errors occurred.
The disposable self-signed certificate remains a fixture, not public-certificate
or real-internet qualification.

This is hosting readiness, not a deployed public service. Domain/certificate
provisioning, internet latency, TURN and real-device acceptance remain open.
See the [host setup](../../../host/README.md#https-reverse-proxy).
Changelog: add explicit HTTPS-origin configuration, secure discovery/cookies and
request filtering before WebSocket upgrades while preserving loopback defaults.

### Review the last online match after leaving (2026-09-24)

Leaving online previously discarded the recording unless the player downloaded it
first. This interrupted the loss-to-learning loop. The smallest fix keeps one
detached confirmed recording in the page session: Watch offers Review last online
match and Save last replay. Playback and takeover preserve recorded names and
catalog outfits. Leaving playback retains the original recording; reloading clears
it. A departure with no confirmed recording does not replace it. This ranked above
a persistent replay library because it repairs the immediate learning journey
without adding storage migrations or new combat rules.

The change is confined to the editor standalone departure adapter and replay
controller/panel, with focused regression tests and nearby documentation. No
authored project data, simulation rules or protocol versions changed. Uploaded
images remain excluded from replays pending offline hide/revocation semantics.

Validation: 156 focused replay, appearance and network tests passed with 1,328
assertions. Editor source/test types, build, validated Build/download and process
policy passed. Twelve native browser checks on the extracted host package covered
a physical hit, leaving, keyboard review without import, recorded identity,
takeover movement, repeated review, saving after leaving and clearing on reload.
The replay combat state matched exactly at tick 57; browsers reported no errors
or failed requests and were cleaned up. A subsequent 15-check browser run visited
and left a new empty private room, confirmed it had no new recording, then reviewed
and saved the prior 235-frame match with its names, outfits and 100/92 health intact.
Combat snapshots again matched exactly. At 390px, native review, seek, takeover
and saving worked; inspected screenshots show wrapped controls without clipping.
The first follow-up script raced the peer-departure dialog; its failed fixture is
preserved separately, and the successful run waits for the visible return button.
Both follow-up browsers were cleaned up, with no runtime errors or failed requests.
These are mechanical checks, not human learnability evidence.

Evidence lives in `.local/touch-of-death/recent-replay-audit/` and
`.local/touch-of-death/recent-replay-followup/`. The clean package
is `.local/touch-of-death/releases/recent-replay-20260924/`; every payload digest
matches the tested external installation, the release data directory is empty,
and the refreshed shared host serves the same HTML. HTML SHA is
`ca3f70cec891f1fd7e38b7f21d9dbb65a9aa400aba4fe3dc434926dadddb8477`.
Existing bundle-size gates, public-service qualification, hardware and finished
art remain release gaps.

Manual check: join with two guests, approach and land a Strike, then Leave bout.
Open Watch and activate Review last online match with Enter. Seek to the hit,
take over either fighter and move. Leave playback, review again, save the replay,
then reload and confirm the recent action disappears while the saved file imports.
Changelog: added immediate review and saving of the last online recording after
leaving, retaining fighter identity and the original recording through takeover.

### Compressed demo delivery (2026-09-24)

The current host sent the entire 8,356,690-byte game document even to browsers
requesting gzip. This frequent first-visit cost was selected over speculative
runtime pruning: the contributor audit found required physics and validation,
while static response compression offered a bounded, measurable improvement.

The host now compresses the static export once at startup and negotiates gzip or
identity using Accept-Encoding weights, explicit exclusions and wildcard fallback.
Unavailable representations return 406. Responses retain no-store/nosniff and add
Vary plus the actual encoded Content-Length. Negotiation follows
[RFC 9110 section 12.5.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3).
Account responses, combat, authored data and the offline HTML are unchanged;
no export regeneration or editor mutation was needed.

The external package transferred 5,648,049 gzip bytes, 32.41% fewer than identity.
Serial identity/gzip/gzip/identity requests passed 22 checks including exact
decoded SHA, lengths, refusal and unchanged discovery. Fifteen browser checks
confirmed native gzip navigation, exact decoded export, two guest profiles,
physical contact, replacement and reload persistence, with no page errors or
failed requests. Seventeen focused tests passed with 337 assertions; scoped
strict types and process policy pass. Owned browsers and isolated host were
cleaned up, and the idle shared host was refreshed without replacing its database.

The clean candidate is `.local/touch-of-death/releases/compressed-host-20260924/`.
Its payload matches the tested installation outside the checkout; its data folder
is empty. Host SHA is `d717832bfc650d909ddee04e510720b2d7070af84ae0e901f780276fe4be2d78`;
HTML remains `818b73f20e5111b801192e6afafcf2421794e8b9367598247a457f6a6127e72a`.
Evidence lives in `.local/touch-of-death/compressed-host-audit/` and the
`bundle-audit/transfer-*.json` reports. This is a transfer-byte reduction, not a
measured latency win or resolution of JavaScript bundle ceilings. Public hosting,
account recovery, device acceptance and finished art remain unresolved.

Manual check: open the packaged game in a browser and inspect the main document's
gzip response, then join a friend and land a real hit. Fetch with identity-only
encoding and compare the HTML digest; refuse both encodings and expect 406.
Changelog: reduced the hosted demo download by 32.41% with startup gzip and an
exact uncompressed fallback, preserving the exported artifact and gameplay.

### Portable local host package (2026-09-24)

The local online journey already worked, but host startup required the source
checkout to compile its moderator page. This pass selected that concrete delivery
gap over a new server architecture or an unprovisioned public deployment. The
artifact is a Bun host folder for a demo operator; it remains loopback-only.

`packages/engine/examples/touch-of-death/host/package/build.ts` validates the canonical editor pair,
the HTML's embedded project/assets and current standalone runtime, bundles the
existing host plus moderator UI, and publishes a new directory atomically. It
refuses existing output. The host accepts an explicit prebuilt moderator script;
the managed launcher can run the extracted bundle with its working directory
outside the checkout. No combat/editor rules, project data or exported HTML were
changed. Missing/empty moderator scripts fail before database/socket startup.

The initial exact-ZIP check rejected the valid export. Both validated archives
contain the same 54 assets and normalized project, but their sizes differ by
1,886 bytes. Validation now compares every decoded ID, name, MIME type, digest and
byte; a regression accepts repacking and rejects changed or missing content.

The external installation passed eight browser checks: two native guest clients,
private invitation, shared hosted profiles and a real hit confirmed by both
simulations, with no page errors or failed requests. Nine service checks before
restart and ten afterward prove guest issuance, one-use token rejection, foreign
origin rejection, private replay archive denial, moderator authorization and the
same authenticated guest account after refreshing its saved cookie/lease. This
does not claim a live fight survives a server restart. Both isolated hosts and
owned browsers were cleaned up with no visible windows.

Validation: 14 focused package/relay/guest/moderation tests, 237 assertions; five
managed-launcher tests, 24 assertions; scoped strict TypeScript; process policy;
skill validation and CLI help. Evidence lives in
`.local/touch-of-death/portable-host-audit/`. The clean distribution is
`.local/touch-of-death/releases/local-host-20260924/`; its manifest and payload
hashes match the tested external installation, and its data directory is empty.
Host SHA-256 is `86fcd38c8bb92b652f37dc539dc1fae4785c0700c599732d21819a49168f938e`;
the HTML remains `8fdad3b6e064c19bfbe4f1ad185fe0a6492b9dd6749399355fd2ab7df98e1766`.

Follow-up finding: a locally saved fighter name did not automatically become the
hosted guest name; both clients displayed the authenticated Guest profile. The
failed expectation is retained in `local-profile-assumption.json`. Clarify and
verify the local-to-hosted appearance journey next. Public hosting, account
recovery, hardware/device qualification and native compiled host targets remain
unproven; the package is not a public service or a Steam-quality art verdict.

Manual check: build into a new folder, follow its README from outside the
checkout, join with two guest browsers, approach and hit using real controls,
then stop/restart with the same database. Confirm the same guest identity and
moderator access rules. Keep account data and moderator credentials out of copies
shared with other operators.

Changelog: added a validated portable local host folder, prebuilt moderator UI
support and external-directory startup through the existing managed launcher.

### Exported-file acceptance and release gate (2026-09-24)

The unchanged `8fdad3b6e064c19bfbe4f1ad185fe0a6492b9dd6749399355fd2ab7df98e1766`
HTML passed 14 mechanical acceptance checks from a temporary directory outside
the checkout. Native movement, guard, physical contact against difficulty-1 AI,
and a Practice launcher worked without HTTP or WebSocket requests or browser
errors. Fighter name, outfit and settings survived closing and reopening the
file. Owned browser processes were cleaned up. Evidence lives in
`.local/touch-of-death/offline-release-audit/result.json`.

A blank wardrobe screenshot was traced to the fixture pausing animation frames
before the first preview render. A bounded native-dialog recheck with rendering
enabled shows the fighter correctly; `wardrobe-after-render.png` and
`preview-recheck.json` preserve the result. No production fix was necessary.

This is not newcomer learnability evidence: the bounded default difficulty-5
attack attempt did not land a hit; the successful run selected Easier through
the native menu. Combat checkpoint controls are not exposed by the fight UI,
so this run verifies appearance/preferences persistence, not combat save/load.

The engine release gate passed source, test, tooling, example and editor types,
compatibility tests, process policy and engine build. It then failed existing
bundle-size ceilings; subsequent example/editor builds, installed-consumer
smoke and full tests were skipped by that gate. No budgets were raised.
The HTML is 8,355,179 bytes; its embedded 3D runtime is 1,206,263 bytes.
See [bundle evidence](../../../../../docs/bundle-size-evidence.md) and the preserved
`offline-release-audit/package-gate.json`. Local exported acceptance does not
qualify public hosting, account recovery, physical controllers/audio or internet
play across devices.

### Export entry separation: locally verified (2026-09-24)

Audit: the browser export embedded both the complete 2D startup and 3D startup,
regardless of the authored project. The prior combat/net import deduplication is
already present, so it cannot supply another saving. Physical-performance and
video validation are genuinely reachable 3D features and cannot simply be removed.

Ranked candidates: (1) separate 2D/3D entry graphs, high frequency for every
download and moderate compatibility risk; (2) further source/dist deduplication,
low risk but no remaining instance demonstrated; (3) optional physical-performance
extraction, potentially larger but substantially higher architecture and validation
risk. Select only the first. No authored feature, project format, control, combat
rule, or editor setting changes. The engine remains framework-neutral.

The control is the previous exported runtime SHA `d32c04...`, 1,285,536 raw /
391,500 gzip / 317,620 Brotli bytes. A source-only entry probe preserves migration,
portable asset checks and all 3D boot features while eliminating the 2D boot graph.
Final dedicated entry measurements are 1,195,079 / 364,315 / 296,244 for 3D and
223,757 / 67,785 / 57,363 for 2D. The editor embeds both, increasing its combined
runtime payload by 133,300 raw bytes; an exported game embeds only its dimension.
This is a byte reduction, not a measured startup-time or network-latency claim.

Application `src/standalone/entry-shared.ts` owns canonical opening, migration,
hooks and errors; `runtime-2d.ts` retains the existing 2D boot. Dedicated entries
reject mismatched project dimensions. The existing generic entry keeps its public
start/boot exports, auto-boot flag, custom behavior and save-migration support.
`apps/engine-editor/build.ts` bundles both entries and watches their combined
dependency graph. Engine `project/standalone-playable.ts` selects by the existing
3D declaration, retaining explicit runtime overrides and the generic host fallback.
No canonical project files or generated HTML are manually edited.

The actual editor Build/download produced HTML SHA-256
`05c68304c9ae95ad8489e0b335c4883842f1f58ca6261c7c92c3e9d0dd569916`,
with full fresh-runtime verification and unchanged project hash. App/export tests
pass 213 cases / 1,651 assertions; engine source-selection and CSP tests pass
3 cases / 19 assertions. Types, engine build and installed-consumer creation,
custom build, preview and recovery pass. Browser play/persistence/replay acceptance
now passes for both dimensions. AI decisions and actual surface-contact tests
also pass 24 cases / 1,919 assertions. Package generic-runtime ceilings still
fail; this change does not claim to close the entire bundle gate.

Browser evidence: `.local/touch-of-death/quick-block-ui/result.json` passes
25 checks on this artifact, including actual jab contacts, native Enter/Space,
durable blocking, simultaneous prints/emblems and revocation. The first run
observed the owner's temporary cache invalidation before its authorized image
reload completed; `owner-reload-timing.json` preserves that failure. Waiting for
the authorized reload resolved the fixture timing without a production change.
The viewer's forbidden pixels must still clear immediately.
`.local/touch-of-death/replay-v5/result.json` passes 17 fresh checks: two clients
agree on complete confirmed state, Save replay records 293 frames, clean offline
import reproduces that state exactly, and attacker/defender takeover changes the
exchange through ordinary attacks and guard. Invalid recordings preserve local
play. These checks use real contacts, not injected damage or stun.

The 2D editor-command starter and visible Build/download journey passes six
checks in `.local/touch-of-death/entry-split-ui/result.json`: fresh 223,757-byte
runtime, offline ArrowRight movement, save/restore, reload persistence and
unchanged canonical fighter. Its emitted graph retains a 92-byte dimension
predicate but no 3D boot, renderer or physics. Both dimensions have zero browser
errors; owned browsers and the isolated host leave no processes or visible windows.

Manual checklist: export the canonical fighter through Build, join two browsers,
earn a jab, save its replay and import it offline. Seek before the hit, take over
each side and change the exchange with attack/guard inputs. Check uploaded image
block/unblock and persistence. Separately create a 2D starter through editor
commands, Build/download, move with its real keys, save, move away, restore, reload
and restore again. Both exports must remain self-contained and report startup
errors for malformed or mismatched payloads.

Changelog: browser exports automatically include only their 2D or 3D startup
path. Touch of Death sheds 90,457 runtime bytes (7.04%) while retaining the full
3D rules, assets, online controls, saves and replay path. Generic package consumers
remain compatible; no author setting or project schema changes.

### Hosted guest entry: locally verified (2026-09-24)

Follow-up: fresh guest profiles now receive a stable short name such as
`Guest 224178B6`. The guest browser screenshot exposed repeated `Player` names
expanding into full account IDs in room lists. The host derives the default from
the guest UUID; all rooms receive the same name through existing profile metadata.
Saved names and authenticated identity remain unchanged. This is host profile
policy, not authored project data or a new engine primitive. Ten profile tests
(81 assertions) cover defaults, persistence, edits, invalid data and room metadata.
The same exported HTML passes 20 browser checks with the updated host, including
visible short room names, stable guest names after reload, explicit saved-name
persistence and physical Quick Play contact. Evidence remains
`.local/touch-of-death/guest-ui/before-membership-cleanup.json`
(2026-09-24 12:50 UTC run).

Audit: the current game can play real online sets, rotate rooms, retain ratings
and replay an exchange, but a newcomer must obtain a server address and access
token. The relay's development tokens are not player authentication. This blocks
the first social interaction regardless of combat skill. The engine already
supports signed single-use admission and asynchronous token renewal; the missing
pieces belong in the demo host and exported application's connection UI.

| Rank | Candidate | Impact / frequency / shared benefit | Risk / verification |
| --- | --- | --- | --- |
| 1 | Same-host guest entry for rooms and Quick Play | High / every online visit / both audiences | Medium; native first-join, cancellation, invitations, errors |
| 2 | Durable guest identity and fresh admission tokens | High / every online visit and recovery / both audiences | Medium; restart, replay rejection, origin checks, reconnect |
| 3 | Account linking and recovery | High / occasional / both audiences | High; needs account-provider and recovery policy |
| 4 | Public deployment and TURN | High / every remote session / both audiences | External provisioning and real internet/device acceptance |
| 5 | Large visual lobby | Medium / room visits / primarily social | More UI/art work; existing room rotation already works |

Selected work is 1–2 together: serve the existing editor-exported HTML from an
opt-in loopback demo host, discover that same host, create or return to a guest
identity, and join through native controls without manually handling credentials.
Downloaded/offline exports retain explicit host configuration. Invitations for
other hosts must not receive the current host's credentials. Cookie loss does not
imply recoverable accounts; the interface must explain that limitation.

The host owns cookies, leases, admission, persistence and deployment configuration.
The exported app owns discovery, guest controls, cancellation and per-attempt token
acquisition. The engine retains generic signing, transport and combat rules. These
are deployment/session values, not authored game data; no project-command changes
or canonical project edits are needed. Public deployment remains unverified.

Implemented: same-origin discovery and Play as guest, SQLite-backed guest cookies,
short-lived single-use admission tokens, and fresh credentials on recovery. Guest
identity and published profile survive reload. Cancelled credential requests cannot
join later; stale asynchronous credentials cannot replace a newer connection.
Invitations preserve their room and match when returning from Quick Play. Foreign
destinations retain manual review and never receive the current host's credentials.
The export CSP permits same-origin discovery without opening cross-origin HTTP.

Evidence: `.local/touch-of-death/guest-ui/result.json` records 17 passing browser
checks against HTML SHA-256
`4ae3fb70a8578ade0a5c3e9517dd279b8eb59ffc6b3deb181664b059e644ccac`.
Two independent guests searched, accepted and caused a physical hit through native
controls. Recovery retained identity, frame history and earned damage; reload
retained the published profile. An invitation admitted three same-room members.
Cancellation produced only the expected aborted request; no uncaught errors.
Owned browsers and the isolated host were cleaned up with no remaining processes
or visible windows. Recovery used a synthetic visibility-handler trigger followed
by a real socket close and authenticated handshake; native tab visibility and
cross-device behavior are not established by this test.

Focused verification: 112 application tests / 959 assertions, 33 transport and
recovery tests / 149 assertions, 6 native guest-service tests / 187 assertions,
and 2 CSP tests / 13 assertions pass. Guest tests cover replay rejection, restart,
origin and body validation, expiry, limits and storage failure. Run application
tests from the repository root with `--conditions=browser` for the DOM preload;
run guest-service tests using its README's native-runtime command. Engine build,
type checks, compatibility and process policy pass. The full engine ship gate
still stops at unchanged bundle-size ceilings; later chained checks are not claimed.
The canonical project was unchanged and the editor Build/download path generated
the HTML with a verified current runtime.

Manual acceptance checklist:

1. Open the opt-in guest host in two browser profiles; choose Quick Play, Search
   and Accept. Move into range and jab: damage must come from physical contact.
2. Interrupt and resume within the recovery window. Check identity and damage;
   reconnecting must not heal or reset the fight.
3. Publish a profile name, reload, then reconnect. Check the same public name.
4. Create a room, copy its invitation, and import it after leaving Quick Play.
   Join with a third browser as a watcher; all three must share the same room.
5. Cancel while guest admission is pending. Wait for the response; no late join.
6. Open a downloaded export and a foreign-host invitation. Verify explicit host
   configuration remains available and current-host credentials are not forwarded.

Changelog: added guest entry without manual tokens, durable browser guest identity,
fresh authenticated reconnects, cancellation protection and reliable invitations.
Remaining high-impact gaps are public hosting/account recovery, real internet and
device qualification, bundle reduction and finished character art. Guest access
is lost if its cookie is cleared or expires; it is not a recoverable account.

### Contributor package compatibility repair (2026-09-24)

The release-blocking create-project retarget is resolved without editing the
compatibility baseline. `@hyperfocus/engine/tooling/create-project` again exposes
its original `tooling/create-project.ts` runtime/type target. A named facade uses
a private package import to reach bundled implementation/declarations when
installed; repository tooling resolves current source. Internal authoring callers
use the private implementation directly, so clean builds do not depend on stale
compiled output. No game project or combat rules changed.

Validation: 26 focused authoring/compatibility/readiness tests (203 assertions)
pass, including refusal to overwrite, corrupt-directory rejection and recovery
from invalid authored source. An isolated copy with no old dist passes declaration
emission and public-facade runtime creation. Packed external Bundler and NodeNext
consumers pass public API typing/execution, create, custom build, preview, recovery
and cleanup. Engine build and all five type-check stages pass.

`ship-check engine` now passes release discovery, process policy and compatibility,
then fails unchanged bundle ceilings. Later chained checks are not claimed to have
run. The unrelated PadPilot source-directory cap remains the only source-structure
failure. Current HTML remains `ff5287...`; full runtime verification still matches
`053cea94...`. The [fresh replay acceptance](replay.md#fresh-combat-v5-replay-acceptance-2026-09-24) applies to this same artifact.

Changelog: restored the patch-stable project-creation entrypoint while retaining
self-contained installed tooling; verified current offline replay takeover through
real attacker and defender inputs. Next delivery work remains package-size
reduction, public service setup, broader device evidence and character art.

### Export dependency and release-gate audit (2026-09-24)

Current HTML SHA-256:
`ff5287e92faba31d0a0e84be4baefbf6e8d516887adbd7653d25af8acd258346`.
Runtime SHA-256:
`053cea94fd1b588ef1d2d23408106519489fd75e203c2f03a0b4c124e19ae8e4`
(1,270,749 bytes). The canonical project hash and combat-v5 content are unchanged.
This candidate supersedes the [background-session artifact](recovery.md#background-sessions-and-terminal-close-policy-2026-09-24).

Ranked work: (1) remove the proven duplicate protocol dependency, (2) repair the
release check's hidden-directory crash, (3) classify existing unlisted public
exports, (4) resolve broader package-size growth, (5) investigate content-specific
export splitting. The first three are bounded, directly testable delivery fixes.
Splitting or stripping migration/video validation was not justified by the audit.

The editor source alias now resolves combat/net to its public source entry rather
than loading a second packaged copy. The exported runtime saves 8,317 raw / 2,529
gzip / 535 Brotli bytes. A build-graph regression rejects packaged engine imports
inside this source-built export. Workspace release discovery excludes hidden cache
directories but still rejects hidden links and missing real package manifests.
The compatibility review classifies three existing experimental exports without
changing earlier commitments; it exposes a separate create-project retargeting
failure that remains unresolved.

Validation: 103 networking/replay tests (883 assertions), 11 release-discovery and
export-graph tests (26 assertions), editor source/test type checks, engine build,
and external installed-consumer create/build/preview/recovery smoke pass. The
editor command load and Build/download preserve the canonical project and match
the fresh complete runtime. Sixteen three-browser checks pass on this exact HTML:
physical keyboard movement/jab contact, spectator catch-up, same-seat recovery,
terminal concession and timeout rotation. No browser errors or leftover owned
processes; managed editor/relay window inspection finds no visible windows.
Evidence: `.local/touch-of-death/visibility-ui/result.json` and
`.local/touch-of-death/bundle-audit/`.

The full release gate still fails: compatibility finds create-project's source
entry retargeted to compiled output; independently measured package sizes exceed
unchanged ceilings. The unrelated PadPilot source-directory cap also still fails.
Standalone replay-file browser acceptance was not repeated because its fixture is
from an older content version; focused replay tests pass. Native tab visibility,
public hosting/authentication/TURN, devices and character art remain open.

Manual checks for this export: join a three-person room, move into range and jab;
confirm spectator damage matches; interrupt one fighter's transport and return
within ten seconds, then move and attack again; leave during a played bout and
confirm one result and one rotation. Save a fresh combat-v5 replay and verify
playback/takeover before claiming current replay-file browser acceptance.

Changelog: smaller standalone networking dependency graph; hidden working folders
no longer crash release discovery; explicit compatibility coverage for combat
networking and installed build/preview tools. No combat tuning changed.
