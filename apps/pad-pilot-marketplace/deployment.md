# Railway deployment

Production target: **https://pad-pilot.hyperfocus.info**, in the separate
**Hyperfocus PadPilot** Railway project. The owner manages DNS. Deploy the verified
artifact directory; do not upload the checkout or local credentials.

## Service setup

The artifact includes `Dockerfile`, `railway.json`, and a SHA-256 manifest. Its
configuration selects `/healthz`, one replica, and bounded restart/drain policies.
Keep one region and
one process because SQLite, uploads, and admission limits have one owner.

Attach a persistent volume at **`/data`** and add `pad-pilot.hyperfocus.info` as the
service's custom domain. DNS alone does not attach a Railway domain. Leave the
start command inherited from the Dockerfile. The app honors Railway's `PORT`,
binds to `0.0.0.0`, and migrates after the volume is mounted. Do not configure a
pre-deploy migration command: the database volume is required at runtime.

See Railway's [config reference](https://docs.railway.com/config-as-code/reference)
and [healthcheck contract](https://docs.railway.com/deployments/healthchecks).
Volume-backed redeploys can have brief downtime. Health checks gate deployment;
they do not provide ongoing uptime monitoring.

## Variables

Add secrets directly in Railway, never in commits or Docker build arguments.

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` (Docker default) |
| `PADPILOT_PUBLIC_ORIGIN` | `https://pad-pilot.hyperfocus.info` (Docker default) |
| `PADPILOT_DATA_ROOT` | `/data` (Docker default) |
| `PADPILOT_OIDC_CLIENT_ID`, `PADPILOT_OIDC_CLIENT_SECRET` | Confidential PadPilot OAuth app under the existing Hyperfocus Clerk instance |
| `PADPILOT_COMMERCE_ENABLED` | `false` for the public launch; checkout returns unavailable until billing is configured |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Required when commerce is enabled; matching live Stripe account and webhook |
| `STRIPE_PRODUCT_ID_FIRST_CLASS`, `STRIPE_PRODUCT_ID_PADPILOT_LIFETIME` | Confirm existing product IDs belong to that account; override if different |
| `PADPILOT_TRUST_PROXY` | Leave `false` unless ingress demonstrably replaces trusted client-IP headers |

Hyperfocus sign-in uses the same `https://clerk.hyperfocus.info` issuer as Books,
with `openid profile email` scopes, authorization-code flow, and required S256
PKCE. Register exactly `https://pad-pilot.hyperfocus.info/auth/callback` in the
existing Clerk instance's PadPilot OAuth application. Store its client credentials
directly in Railway; the service does not need a local Clerk provider key.
`/auth/login` returns to the canonical domain and issues a host-only, Secure,
HttpOnly `pp_session`. Hosting-provider URLs redirect navigation to the canonical
domain and reject API requests. Native plugin clients use the explicit browser
approval flow described in the [README](README.md#notes).

Stripe webhook URL:
`https://pad-pilot.hyperfocus.info/api/webhooks/stripe`. Configure the event types
consumed by `src/billing/billing-webhooks.ts`. Other price/session settings remain
in the [README](README.md). Provider secrets never belong in browser assets.
Startup fails for missing enabled provider
configuration, HTTPS origin, assets, migrations, or Railway volume. Configuration
presence does not prove external credentials work.

The final image contains bundled server JavaScript, the editor-authored public
website and lazy Clerk UI, the minified PadPilot browser app, public assets,
migrations, the PadPilot license, and notices from actual bundled dependencies. It needs only Bun at runtime, without
workspace source or `node_modules`. Local AI and development routes are disabled.
Production `/` is the public website; `/app` retains the PadPilot browser app.
`/website` and `/marketplace` also open the public page. Website and app use the
same Hyperfocus identity, `pp_session` cookie, database, and entitlements.
Required website HTML/entry JavaScript participate in startup and health checks.
The editable source and build handoff are in [Website authoring](README.md#website-authoring).

## Verify and roll out

```powershell
bun run ship-check marketplace
bun run --cwd apps/pad-pilot-marketplace build:deployment
bun run --cwd apps/pad-pilot-marketplace verify:deployment
bun run --cwd apps/pad-pilot-marketplace deploy --check
# target.json names the authorized projectId, environmentId, and serviceId:
bun run --cwd apps/pad-pilot-marketplace deploy --target <target.json> --out <receipt.json> --wait
bun run --cwd apps/pad-pilot-marketplace verify:deployed --artifact-hash <receipt-artifactHash>
# Optional Linux container check; requires Docker:
docker build -t padpilot-marketplace .local/marketplace-release
bun scripts/shipping/marketplace-container.ts
```

For a fresh output directory, pass `--out <directory>` to `build:deployment`,
`--artifact <directory>` to `verify:deployment`, and set `PADPILOT_DEPLOYMENT_DIR`
for `deploy`. Set `RAILWAY_BIN` when the authenticated Railway CLI is not on PATH.
Keep target files and deployment receipts outside the artifact under `.local/`.
The uploader checks the manifest and exact Railway target before upload, records
the returned deployment ID, and waits for that deployment rather than an older
healthy service. The CLI upload includes verified media omitted from Git.

The isolated smoke copies the artifact outside the checkout, checks startup,
HTTP routes, anonymous mutation rejection, and missing-asset health failure. It
then restores a cold database/upload snapshot and restarts. Provider keys are
disposable fixtures; no external payments or authentication occur.

The [Linux artifact workflow](../../.github/workflows/marketplace-deployment.yml)
also builds the Docker image and starts it with a disposable volume and provider
fixtures. This is a container gate, separate from live Railway/provider acceptance.

`verify:deployed` makes bounded, read-only public requests and requires the health
response to identify the exact artifact manifest hash (or a full Git commit SHA)
before checking HTML, JavaScript, CSS, and bootstrap. The server also reports Railway's
[`RAILWAY_GIT_COMMIT_SHA`](https://docs.railway.com/variables/reference); an old,
missing, or unidentified deployment cannot pass. This does not validate paid
transactions, sign-in, client-IP isolation, or provider backup restoration.

After the candidate deploys, verify `/healthz`, the browser shell, real
Hyperfocus sign-in/session restore, and catalog/download behavior. Run controlled
payment/refund acceptance with the owner's Stripe configuration before opening
paid sales. Record the deployment ID, artifact hash, and results together.
The first deployment starts with an empty catalog and no plugin release; a real
publisher must upload approved bundles before those appear publicly.

Verify client-IP isolation through the real ingress before opening public traffic.
With proxy trust disabled, shared ingress peers can share an admission-limit bucket.
Do not enable forwarded-header trust until requests prove Railway replaces those
headers and direct bypass is excluded; a client-supplied header must not bypass limits.

## Backup and recovery

Enable Railway volume backups and take a manual snapshot before migration-bearing
releases. Back up database, SQLite WAL/SHM, Module uploads, and staged plugin
release assets as one volume. Store release files under `/data`; other paths are
ephemeral. Never copy only a live `.sqlite` file.

For a cold backup, stop writes and the service before copying the whole volume.
The local smoke proves that restore model. Railway's snapshot/restore still needs
one real staging drill; a local copy does not prove the provider operation.

Recover by selecting a known-good volume backup in Railway, reviewing the staged
restore, and deploying a compatible revision. Restore at the same `/data` mount:
records can contain absolute file paths. Retain the old volume until database
integrity, accounts, uploads, and signed downloads are verified. Code rollback
does not roll back schema or payments. Reconcile/replay Stripe events received
after the backup through the idempotent webhook handler before resuming commerce;
do not resend charges.

See [Railway backup and restore](https://docs.railway.com/volumes/backups). Record
backup time and recovered revision; verify `PRAGMA integrity_check` and the
critical auth/catalog/download journey after restore.
