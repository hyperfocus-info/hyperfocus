# Portable local host package

From the checkout, run:

```powershell
bun packages/engine/examples/touch-of-death/host/package/build.ts --project <canonical-project> --html <editor-export.html> --out <new-local-release-directory> --runtime-entry src/standalone/entry-3d.ts --runtime-cwd apps/engine-editor
```

The runtime entry and build directory are supplied by the exporting host; the
game package does not infer or import an editor checkout. Both flags are required
for exact current-runtime verification.

For a streaming web export, extract the complete editor ZIP and pass its
`index.html` to `--html`. The builder verifies every inventoried file and the
hashed delivery manifest, reproduces the complete Bun module graph in the supplied
working directory, and includes the output under `web/`. The host serves its
indexed assets with ranges, CORS and cache headers. Legacy embedded HTML remains
accepted. Asset hosting policy is documented in [web delivery](../../../../docs/project-delivery.md).

The builder reads the dev server's SQLite database at `../community.sqlite`
relative to the project directory and includes `policy-candidate.json`. If dev
uses a different `TOUCH_OF_DEATH_DATABASE_PATH`, pass `--policy-db <sqlite-file>`.
That explicit file must exist. Only the committed champion for the exact package
content identity is exported, with its compact evidence and source revision.
Pending candidates, player data, database files and credentials are excluded.
The database is opened read-only; a missing default database or missing champion
produces an empty nomination, recorded as `policy.nomination: false` in the manifest.
Corrupt matching policy data fails packaging instead of silently dropping weights.

Railway loads the candidate using `TOUCH_OF_DEATH_POLICY_CANDIDATE`, set by the
generated image. It atomically nominates against the current production revision
and performs fresh server evaluation before any activation. Production's existing
champion stays active during evaluation or rejection. A durable deployment receipt
prevents duplicate nomination after restart, redeploy, or rollback. Failed admission
retries every minute; queued work uses the existing lease/write recovery rules.
The artifact's checksum detects damage; the trusted release delivery path is its
authority. Copying an artifact never copies dev revision counters into production.

The builder validates both project pairs, compares the embedded project and every
asset ID, name, MIME type, digest and decoded byte, verifies the fresh standalone runtime, bundles the existing Bun
host and moderator UI, then publishes a staged directory. Existing outputs are
never replaced. Timestamp-only project differences use the same content identity
normalization as network admission. Source projects and exported HTML are read-only.
Runtime verification accepts the editor's exact current minified or debug export
and records the format in the manifest. Debug exports retain their inline source
maps; use `HYPERFOCUS_PLAYABLE_DEBUG=0` when a compact production artifact is wanted.

Streamed-music exports are also accepted. The builder restores their canonical
catalog identity, verifies each descriptor's SHA-256 and size against the source
archive, and verifies every remaining embedded asset. The host serves only those
verified songs at their exact `/audio/<sha256>.mp3` paths, on both configured game
origins. It does not expose the archive or arbitrary files. Packaging reads the
portable inventory without browser base64 hydration, so the browser editor's
24 MiB hydration limit does not reject a valid large audio library.
Archive compression and ordering may differ: an editor repack preserved all 54
assets while changing the archive from 5,240,342 to 5,238,456 bytes. The regression
uses public packing APIs with different compression, and rejects changed content.

The package requires Bun and contains its own runnable instructions, file hashes,
content identity and protocol versions. It includes no database, guest identities
or moderator credentials. It defaults to loopback binding and guest admission; its generated Railway Dockerfile enables public binding and supports Clerk admission.
It does not deploy or provision public services. An optional TLS proxy configuration is
described in the [host README](../README.md#https-reverse-proxy). Repository browser acceptance starts the
packaged host through the managed combat-relay surface. Native compilation and
cross-platform portability require separate verification.

The host negotiates gzip for the static game document, computed once on startup.
The package retains the original `game.html` and its manifest digest. For configured
Clerk hosting, the host adds the exact frontend HTTPS origin decoded from the
publishable key to the served document's `script-src` and `connect-src`. Runtime,
project and asset bytes are unchanged; only the in-memory CSP differs. Compare
the served digest against `createDemoDocument(...).servedSha256`, not the source
HTML digest. Unconfigured hosts remain byte-identical. Identity-only clients
remain supported. Neither guest
credentials nor dynamic account responses are included in the compressed payload.

Run `bun test packages/engine/examples/touch-of-death/host/package` with
`HARNESS_TEST_SKIP_UI_PRELOAD=1` for native Request/runtime behavior.


## Railway

### Current production release: October 13, 2026

[Touch of Death](https://tod.hyperfocus.info/) is running deployment
`88683713-b443-4a3a-8f9a-8f531a43e38d` from
`.local/touch-of-death/releases/production-defaults-20261013`.
Railway reports `SUCCESS`, one replica and `/tod-health`; public HTTP verifies
the exact served HTML digest
`52f0ebc8470f218a86491ed6b8879d97964578fcc95f1318b10b7df844116136`,
`combat-v39` identity, database readiness, streamed music bytes and anonymous/private
route rejection. Primary-domain DNS/TLS now works; older access failures below
are historical. Existing PostgreSQL and Clerk configuration is retained.

The owner requested best-guess defaults: local `post-first` HUD ordering, rAF
pacing and telemetry off, with full visuals and normal simulation. Explicit saved
preferences remain respected. Suspended modes retain original HUD ordering. See
[playable performance](../../../../../../apps/engine-editor/docs/playable-performance.md)
for the controls and the unresolved exact image-repeatability qualification.
This deployment does not claim 165 Hz or new benchmark acceptance.

Evidence is `.local/touch-of-death/production-defaults-20261013`: `release.json`,
`live-http.json`, `extracted-browser/results.json`, `live-browser/results.json`,
and Railway build/runtime/status receipts. Three real extracted-host matches with
rematches and one live-domain match complete, including pause/title/reload and
default checks, with no browser errors or failed requests. The editor and game
typechecks pass; 246 focused/host/delivery tests pass, with seven PostgreSQL
integration tests skipped without a disposable database. Production OAuth and
two-player online acceptance were not rerun. Owned browser/server cleanup passes.

The full upload received HTTP 413. Private bucket `release-assets`
(`372d97eb-c493-4e5a-9fcf-b32291a46795`, US East) now stores the verified archive;
the small build context uses the delivery path below. The final runtime retains
the complete original asset archive and no bucket credentials. No AI policy was
nominated. Rollback reference: `03875315-b1b0-4ca4-9687-9572ee34fc2e`; its retained
package is `.local/touch-of-death/releases/railway-lessons-noise-20260929`.

### Large asset delivery

When the CLI rejects a music-heavy package with HTTP 413, keep the portable
package intact and use `railway-assets.ts` to prepare a separate, small build
context. It uploads the checksum-addressed archive to a private bucket in the
same Railway project. The CLI must already be linked to that project/environment
in the supplied directory; credentials are read in memory and never printed.

```text
bun packages/engine/examples/touch-of-death/host/package/railway-assets.ts --package <release> --out <new-delivery-directory> --cli <railway-executable> --linked-directory <linked-directory> --bucket <bucket-id> --environment <environment-id>
railway up <new-delivery-directory> --path-as-root --no-gitignore --project <project-id> --environment <environment-id> --service <service-id> --detach --json
```

The isolated download stage checks size and SHA-256 before copying the archive
into the final image. Runtime files and content identity remain identical to the
portable package. The delivery context contains a read-only signed download that
expires after 24 hours; regenerate it for later source rebuilds. Neither the URL,
bucket credentials, nor download helper enters the final image. Keep the private
bucket object for repeatable releases; each distinct archive uses its own digest.
This affects build delivery only: the running host still serves its packaged audio
and needs no bucket credentials. The bucket's ongoing storage is a deployment
resource, separate from the game's PostgreSQL data.

### Deployment history

The September 29 preview fix is
`.local/touch-of-death/releases/railway-preview-20260929`, deployed as
`45342ab0-4599-4315-a54e-44b8536f167b`. Railway reports `SUCCESS` with one replica
and `/tod-health`. `TOUCH_OF_DEATH_PREVIEW_ORIGIN` is
`https://touch-of-death-production.up.railway.app`, which now serves the packaged
game for local play and browser AI training. Production authentication retains
`https://tod.hyperfocus.info`; the preview cannot issue sessions, access shared
weights, or join online rooms. The source HTML is unchanged from the contextual
training release below. Its served SHA-256 after the Clerk CSP amendment is
`4684c46ae90e9eedecdbe468ee241df3d11988ed3e99c0b84ea44ff67226e780`.
Live HTTP verifies the matching game response, database readiness, and rejection
of session/policy/admin requests; 24 targeted host/auth/package tests and host
types pass. Evidence is `.local/touch-of-death/railway/preview-*`.
The live browser completes the guide skip, a local fight with keyboard movement,
two training sets and one informative stopped fragment, saved lesson revision 3,
reload with retained lessons, and the training dialog at 390 pixels without
horizontal overflow. It reports no page errors; all owned browser processes close.
Local packaged-server smoke was blocked by automatic approval review, so browser
acceptance uses the live deployed preview. The previous release
`517013f6-0e20-4944-96da-a58c7f663cb5` is the rollback reference for this host fix.

The September 29, 2026 release is
`.local/touch-of-death/releases/contextual-training-20260929`, deployed to the
existing production service as `517013f6-0e20-4944-96da-a58c7f663cb5`.
Railway reports `SUCCESS`, one replica, and resolved readiness path `/tod-health`;
the container reports the relay ready. Its source HTML SHA-256 is
`8e8ef7849445ff1fe8bc47412562c02c39d100d1a6fb1d2d05e27d864d817b71`.
The package verifies the exact current standalone runtime and canonical assets.
It adds persistent browser training lessons; it contains an empty policy
nomination and does not claim improved win rate or promote unapproved weights.
The targeted host/package/policy checks pass 54 tests. The broader editor gate
passes types and security but fails its test step (1,476 pass, 53 fail); later
browser/package steps are skipped. Local artifact and training browser evidence
remain separate from production acceptance.

Access at the primary custom domain remains blocked: Railway reports the `tod` CNAME missing,
requires `x5p5c4uv.up.railway.app`, and has not verified domain ownership or issued
its certificate. Public lookup returns `ENOTFOUND`. Public browser, OAuth, and
training/reload acceptance cannot be claimed for this deployment. Do not replace
production authentication with guest mode to work around DNS. Current release
evidence is `.local/touch-of-death/railway/adaptation-*`; the prior successful
deployment `5e72af04-bb07-4ee8-a4ad-60b22ebd7bf1` remains the rollback reference.

Production game address: [Touch of Death](https://tod.hyperfocus.info).
The previous September 27, 2026 deployment used service `941e4a41-c72e-4387-9cf2-67befd91a57c`
in the owner's `touch-of-death` project, using its existing `Postgres` service.
The release is `.local/touch-of-death/releases/clerk-production-20260927`; its source HTML
SHA-256 is `e89d84847f47d799fd8a4e7b7ff66a0e06ceb5d1ebdd15005ca6c99bfb6b9588`.
The served HTML digest with `https://clerk.hyperfocus.info` added to CSP is
`ae4a48538bbd40eec5a8e85aedbeadcb0aba22e73baee0a90cd3377fb66e025d`.
Deployment `7fe344a3-60c7-463c-9265-97766ea578ca` serves that response and the
owner's production public key. PostgreSQL readiness passes and anonymous
admission/private routes reject. The production secret passes Clerk verification.

The owner selected `tod.hyperfocus.info` and reports its CNAME/TXT records saved.
Railway has that custom domain attached to this service and expects CNAME host
`tod` to `x5p5c4uv.up.railway.app` in the `hyperfocus.info` zone. The app's
`TOUCH_OF_DEATH_PUBLIC_ORIGIN` is now `https://tod.hyperfocus.info`; DNS/TLS
validation and the final public OAuth journey remain pending. The earlier
`touch-of-death.hyperfocus.info` hostname is not the chosen game address.
Origin-cutover deployment `5e72af04-bb07-4ee8-a4ad-60b22ebd7bf1` reached
`SUCCESS` with `/tod-health` enabled. Public lookup still returned `ENOTFOUND`
at verification; this is not public-browser or OAuth acceptance.
Clerk rejects the
generated Railway domain with `origin_invalid`; same-zone test origins return
200. Evidence: `production-clerk-origin-evidence.json` and
`live-http-production.json` under the local Railway evidence folder. The earlier
development-instance browser acceptance is historical; it does not prove
production OAuth completion.

Validation evidence is under `.local/touch-of-death/railway`: 171 host tests pass,
including real PostgreSQL transaction/recovery tests; two independent browser
accounts retain isolated rewards and identities across a packaged-host restart.
The external installed engine consumer passes. The wider editor release gate
still fails in Website tests, engine bundle budgets remain exceeded, and the
repository source-structure gate reports the existing PadPilot directory overage.
These broader gates are not represented as passing by the deployment.

The generated package includes `Dockerfile`, `railway.json` and `.dockerignore`.
Deploy the package directory and retain one replica. Set `DATABASE_URL` to the
Railway PostgreSQL service reference (`${{Postgres.DATABASE_URL}}`). The image
requires PostgreSQL; it never silently falls back to an ephemeral SQLite file.
Set `TOUCH_OF_DEATH_PUBLIC_ORIGIN` to the exact HTTPS domain and set
`PUBLIC_CLERK_PUBLISHABLE_KEY` plus `CLERK_SECRET_KEY` in Railway service variables.
Configure OAuth providers and the domain in Clerk. Production Clerk keys require
the game on the configured production domain or a subdomain; the generated
`*.up.railway.app` URL cannot use the `hyperfocus.info` production instance.
No credential belongs in the
package. Railway supplies `PORT`; the image binds `0.0.0.0` and checks `/tod-health`.

Verify the deployed service's `healthcheckPath` is `/tod-health`; the file in the
package alone does not prove Railway enabled its readiness gate. During Railway
acceptance, the legacy `serviceInstanceUpdate` API rejected this valid path. The
environment configuration API accepted a patch setting only
`services.<service-id>.deploy.healthcheckPath`, with `skipDeploys: true`; service
readback confirmed `/tod-health` without replacing the running deployment. The
next deployment must also show that path in its resolved deploy settings.
The 2026-09-27 PostgreSQL/Clerk deployment
`84f773d5-9688-455b-9d08-4fe1e3179e34` reached `SUCCESS` with resolved
`serviceManifest.deploy.healthcheckPath: /tod-health`; the sanitized local
readback is `.local/touch-of-death/railway/health-config.json`.

On Windows, send secret values as UTF-8 bytes without a BOM to the native Railway
executable. A PowerShell shim pipeline inserted U+FEFF into a secret during the
September 27 deployment; byte comparison caught it and the corrected credential
passed Clerk's instance endpoint. Validate configuration without printing values.

All durable application data uses PostgreSQL: accounts, signing keys, session
leases/nonces, recovery keys, profiles, ratings, rewards/receipts, social records,
room records and uploads. The game service needs no persistent volume. Back up
the PostgreSQL service. Live combat/room membership remains in memory, so retain
one game replica. Schema creation is additive and idempotent; startup waits for
it, and `/tod-health` checks database connectivity. See the
[adapter and live test route](../postgres/README.md).

Managed dev relays explicitly select SQLite and ignore inherited `DATABASE_URL`.
The packaged local command also sets `TOUCH_OF_DEATH_STORAGE=sqlite`. Railway
requires `TOUCH_OF_DEATH_STORAGE=postgres` and its runtime `DATABASE_URL`; missing
credentials or a SQLite override fail startup. An explicit managed
`TOUCH_OF_DEATH_STORAGE=postgres` is reserved for PostgreSQL acceptance tests.
Neither the package nor deployment imports local test profiles or merges guests
into Clerk accounts. Preserve the local database and its sidecars independently.
Public binding rejects backend stats/moderation routes even when callers forge a
loopback Host header. Use local moderator tooling against an operator-controlled
copy/mount; public moderator UI hosting is not provided by this image.

Public OAuth requires a valid Clerk secret and configured providers. Authentication
fails closed when the secret is rejected; do not switch production to guest mode
to bypass a configuration failure.

Railway readiness permits its documented `healthcheck.railway.app` Host only for
`GET /tod-health`; it grants no other route access. See
[Railway healthchecks](https://docs.railway.com/deployments/healthchecks).
