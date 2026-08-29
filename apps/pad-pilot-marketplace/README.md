# Marketplace Service

`apps/pad-pilot-marketplace` is the independently deployable Bun web boundary for PadPilot SaaS concerns.

It has its own workspace manifest and depends on public `@hyperfocus/pad-pilot`
exports. It does not import source from the VST host app.

## Tech Stack

- **Bun** - runtime and package manager
- **Elysia** - HTTP server and routing
- **Zod** - request validation (shared schemas from `@hyperfocus/pad-pilot/marketplace-schema`)

## Responsibilities

- Serve the sibling PadPilot browser shell and bundled assets from `../pad-pilot/ui`
- Expose `/api/*` endpoints for auth, catalog, uploads, account state, purchases, and updates
- Persist marketplace data in SQLite
- Store uploaded Module bundles under `data/module-uploads/...`
- Broadcast `ui-update` over WebSocket for `bun run dev`

## Dev Host Workflows

Browser-first dev:

- Bun serves the UI shell and API on `http://localhost:3000`
- `bun run --cwd apps/pad-pilot build:ui` writes `apps/pad-pilot/ui/dist`; it does not start an HTTP server
- The frontend uses the browser dev host simulator when JUCE is unavailable
- `padpilot://` is never used in this mode

Plugin debug dev:

- The plugin still loads embedded UI assets from `BinaryData`
- The localhost marketplace shell is for browser-first iteration only in this pass
- Native module installation is not part of the marketplace flow yet

## Storage

- SQLite DB: `data/db/padpilot-dev.sqlite` by default
- Module uploads: `data/module-uploads/<owner>/<module>/<version>/bundle.zip`
- Releases: `data/plugin-releases/...`

Runtime paths are configured from `src/env.ts`. Tests override these with temp directories and do not write into committed `data`.

Database ownership is split by domain behind the stable `src/db.ts` facade:

- `db-bootstrap.ts`: migrations and required-schema validation
- `db-account.ts`: users, sessions, access, memberships, and token ledger
- `db-billing.ts`: checkout, order, payment, refund, and webhook persistence
- `db-modules.ts`: module catalog, draft lifecycle, entitlements, and plugin releases
- `db-core.ts`: database-wide timestamp, checksum, and version primitives

`server.ts` remains the HTTP composition root because its shared service injection, admission controls, derived authentication, and cross-domain transaction scopes are app-owned. Reusable request, origin, bounded-body, and file helpers live in `server-utils.ts`; business rules stay in their domain modules.

## Current Endpoint Surface

Implemented:

- `POST /api/auth/clerk/exchange`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/bootstrap`
- `GET /api/modules`
- `POST /api/modules`
- `DELETE /api/modules/:moduleId`
- `POST /api/modules/:moduleId/versions`
- `POST /api/modules/:moduleId/publish`
- `GET /api/modules/:moduleId/download`
- `GET /api/account/subscription`
- `GET /api/account/modules`
- `POST /api/checkout/sessions`
- `POST /api/webhooks/stripe`
- `GET /api/updates/vst3/latest`
- `GET /api/updates/vst3/download/:releaseId`
- `GET /api/updates/vst3/manifest/:releaseId`
- `POST /api/dev/reload`
- `GET /api/dev/static-check`

## Commands

From the Hyperfocus repository root:

```bash
bun run dev:pad-pilot-marketplace
bun run --cwd apps/pad-pilot-marketplace start
bun run --cwd apps/pad-pilot-marketplace test
bun run --cwd apps/pad-pilot-marketplace test:server
bun run --cwd apps/pad-pilot-marketplace typecheck
```

Marketplace tests are colocated in `src/*.test.ts`.

## Verification

```powershell
bun.cmd run --cwd apps/pad-pilot-marketplace typecheck
bun.cmd run --cwd apps/pad-pilot-marketplace test
```

## Notes

- Marketplace admission control is process-local: request-rate buckets plus active upload, download, and generator permits live in memory. Production must run exactly one Marketplace process for each SQLite/upload root behind a single ingress until shared admission control lands. Do not scale this service to multiple Bun replicas; replicas multiply every configured limit. See [distributed admission control](../../docs/pad-pilot/tasks/marketplace-distributed-admission-control.md).
- All non-download `/api/*` routes must return JSON on success, and all `/api/*` routes must return JSON on failure. Do not let framework defaults, thrown exceptions, or API 404 fallbacks emit plain-text responses because the frontend treats marketplace API errors as a JSON contract.
- The Clerk exchange path now verifies real Clerk session tokens before minting the local `pp_session` cookie.
- Marketplace auth now bootstraps eagerly for the app shell, uses a sliding 30-day `pp_session` cookie, and invalidates older sessions when a new login succeeds.
- Stripe-backed account state is now mirrored into local SQLite tables for PadPilot lifetime access, First Class membership, billing checkouts, and Pilot Token ledger entries.
- `POST /api/checkout/sessions` accepts account purchases or `{ "checkoutKind": "module_purchase", "moduleId": "..." }`. Module prices and First Class discounts are snapshotted server-side; duplicate active checkouts reuse one Stripe session.
- Paid module downloads require an active entitlement. A successful payment grants it, a partial refund retains it, and a full refund revokes it. Stripe event, payment, refund, order, and entitlement writes are transactional and idempotent.
- `DELETE /api/modules/:moduleId` rolls back an owner-only unpublished draft and its uploaded bundles. Retrying a completed deletion returns success; published Modules return `409 module_published`.
- Unsafe requests carrying `pp_session` must send an `Origin` exactly matching `PADPILOT_PUBLIC_ORIGIN` (or the request origin in local development). The signed Stripe webhook is exempt.
- Plugin update releases are now modeled in `plugin_releases` with channel, platform, arch, patch artifact, signed manifest, checksum, and base-version compatibility metadata.
- Browser and native clients can query the latest compatible PadPilot VST3 build and download the staged patch artifact plus manifest without marketplace auth. Native verification currently trusts one embedded public key; rotation, revocation, and release provenance are tracked in [Manage Updater Signing Keys](../../docs/pad-pilot/tasks/manage-updater-signing-keys.md).
- Guest mode currently uses an intentionally temporary, client-visible audio degradation heuristic in the UI runtime. It is not a tamper-resistant entitlement boundary; replacement criteria are tracked in [Harden Guest/Demo Mode](../../docs/pad-pilot/tasks/harden-guest-demo-mode.md).
- Marketplace download currently means browser bundle download only. Native plugin module installation is a later pass that will require a real install or load pipeline.
- No marketplace or network work touches the Audio Thread.

## Env

Use the repo-root `.env.local` for local secrets. Supported Clerk keys:

- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_PUBLIC_KEY` as a temporary alias that is mapped to `CLERK_PUBLISHABLE_KEY`

Stripe and account env:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRODUCT_ID_FIRST_CLASS`
- `STRIPE_PRODUCT_ID_PADPILOT_LIFETIME`
- `PADPILOT_LIFETIME_PRICE_CENTS`
- `PADPILOT_FINANCING_MONTHLY_PRICE_CENTS`
- `FIRST_CLASS_DISCOUNT_PERCENT`
- `PADPILOT_SESSION_TTL_HOURS`
- `PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS`
- `PADPILOT_PUBLIC_ORIGIN`
- `PADPILOT_COOKIE_SECURE`
- `PADPILOT_TRUST_PROXY` (enable only behind a proxy that replaces forwarded-client-IP headers)

## Related Documentation

- [Root README](../../README.md)
- [PadPilot docs](../../docs/pad-pilot/README.md)
- [Scripts README](../pad-pilot/scripts/README.md)
- [Frontend README](../pad-pilot/ui/README.md)
