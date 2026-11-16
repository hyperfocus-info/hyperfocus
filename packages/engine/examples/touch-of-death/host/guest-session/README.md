# Hosted demo accounts

The app-owned guest service uses the engine's signed session authority and replay
store interface. SQLite retains hashed cookies and connection leases, the signing
key and consumed token nonces. Combat, ratings and profiles still use authenticated
user IDs; neither request bodies nor cookies can choose those IDs.

`POST /tod-guest-session` accepts `{}` to create a connection lease, or `{lease}`
to refresh it. It returns `{token, lease}`. The HttpOnly, SameSite=Strict account
cookie lasts 30 days; HTTPS also requires Secure. Clearing or losing it requires
an activated recovery key to restore the identity. Without one, access is lost.
A lease lasts one day and stays in browser memory.
Each 30-second socket token is single use. Refresh retains the lease's session ID
so a live connection can recover; invalid or expired refresh fails explicitly.

Rejected identity credentials return HTTP 401 with code
`guest-identity-unavailable`; rejected leases return `guest-lease-expired`.
The game explains that rejoining replaces an expired lease, while an unavailable
identity cannot be restored by retrying. Clearing the site's cookie starts a new
guest and does not transfer the old profile or rating. Failures never clear or
replace a cookie automatically. Unknown or older-host rejection bodies receive
generic verification guidance, not a promise that rejoining will recover access.

Only the configured origin may POST, with JSON, matching Host and same-origin
fetch metadata when supplied. Bodies are capped at 512 bytes and two seconds.
There is no credential CORS or development-token fallback. Local demo hosting
binds only 127.0.0.1; this does not provision public hosting.

Bounds: 10 new accounts and 120 issuance attempts per minute globally, 20
successful issuances per account per minute, 10,000 unexpired accounts, 20,000
leases, eight recent leases per account and 10,000 unexpired replay records.
New joins evict older leases rather than permanently exhausting an account.
Expired records are reclaimed. Invalid refresh attempts consume the global
budget. Allocation writes are transactional; storage or replay failures deny
credentials. These local-demo limits are not a distributed abuse service.

Run `HARNESS_TEST_SKIP_UI_PRELOAD=1 bun test
packages/engine/examples/touch-of-death/host/guest-session/service.test.ts` with the environment variable
set using your shell's syntax. Tests use real SQLite, native Request, restart,
one-use replay, injected storage failures, origin checks and request limits.


`POST /tod-guest-recovery` accepts exactly `{operation, key}`: operation is
`prepare`, `confirm` or `restore`; key is32 random bytes encoded as64 lowercase
hex characters. The client generates the key and downloads a host-bound file.
Prepare and confirm require a valid guest cookie. Prepare retains any active key
and stages one replacement for10 minutes; confirm activates it only after the
player says the file is saved. Both operations are retryable. Success is
`{ok:true}`; no response exposes a user ID or echoes the key.

Restore accepts a confirmed key even after the cookie expired. Its separate
`tod_guest_recovery` row retains identity independently of cookie cleanup. Only
SHA256 verifiers are stored, with one active and one pending key per account,
at most10,000 recovery accounts. Recovery requests have a30/minute global and
10/minute account limit. The existing same-origin, no-store,512-byte and2-second
request bounds apply. Keys are bearer credentials: anyone holding the file can
restore that identity on its original host.

Restore first atomically expires the old cookie and deletes its leases, then
awaits the host's `onRestore(userId)` connection eviction before publishing a new
30-day cookie. No credential is published if eviction or storage fails. Retry the
same recovery key after a failed or lost response; the active key is not consumed.
Concurrent restores serialize, so only the last resulting cookie remains valid.
The optional engine `auth.isCurrent` hook rechecks lease/account validity at
admission boundaries, including joins already awaiting room callbacks. The host
must wire eviction to close existing sessions; deleting leases alone cannot do so.
The demo relay uses the existing duplicate-login departure policy, including
concession for an active rated fight. Restore authenticates solely with the key,
so malformed or duplicate old cookies cannot prevent recovery. Prepare/confirm
still require a valid current cookie.

Replacing a key requires another prepare/download/confirm cycle. Confirmation
revokes the previous recovery key, not an active game session. Restore changes
only authentication: profile, rating, pictures and social records remain keyed
by the same user ID. Nothing writes recovery credentials into project or replay
payloads. Error codes distinguish invalid key, expired pending key, unavailable
identity and retryable restoration; raw storage errors are never returned.

Focused tests in recovery.test.ts cover expiry/restart, lost-response retries,
replacement/foreign-key rejection, transaction rollback, callback failure,
concurrent restores, old-cookie issuance during eviction and lease revocation.


## Clerk OAuth

Set both `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on the host to
require Clerk sign-in for online play. Discovery publishes only the publishable
key. The existing entry changes to **Sign in / Play online** and loads ClerkJS
only when selected. Clerk's hosted sign-in handles enabled OAuth providers;
after returning, select Play online again. Local/offline play does not need Clerk.
Configure providers, allowed origins and production domain in the Clerk dashboard.
The secret key belongs only in host environment variables, never exported HTML.

The host verifies the signed Clerk session's expiry, issuer, authorized party,
subject and session ID using the official backend SDK. Each connection exchanges
a fresh Clerk JWT for the existing 30-second, single-use game token and in-memory
lease. Refresh must authenticate the same Clerk user; a different user's lease
is rejected. Browser cookies cannot select or bypass the Clerk identity. Accounts
use stable `clerk:user_...` IDs across browsers, retaining their profile and rating.
Guest recovery is disabled in this mode; Clerk owns account recovery. Existing
guests are not automatically merged. Local hosts without both settings retain
the existing guest flow. Supplying only one key fails startup.

Tests: `clerk.test.ts` verifies real RSA signatures, issuer/party/expiry and tamper
rejection; `service.test.ts` exercises stable identity, cross-account lease
rejection, refresh and recovery isolation. Live OAuth/provider and Railway domain
acceptance still require the configured external services.

References: [Clerk JavaScript setup](https://clerk.com/docs/js-frontend/getting-started/quickstart)
and [backend token verification](https://clerk.com/docs/reference/backend/verify-token).


## PostgreSQL host storage

`createPostgresGuestSessionService({ sql, origin, ... })` in `postgres.ts` is the
async counterpart for the host's shared Bun SQL pool. It retains accounts,
signing keys, hashed leases, replay nonces, issuance quotas and recovery keys in
PostgreSQL tables. The host owns pool shutdown; guest-service `close()` only
rejects further work. SQLite remains the unchanged local baseline.

Short allocation/replay transactions use a PostgreSQL advisory transaction lock
so caps, quotas and one-use nonces remain atomic across connections. Recovery
uses a reserved session lock across committed revocation, host connection
eviction and replacement-cookie allocation. No cookie is published when eviction
fails; the same recovery key can retry. Configure at least two pool connections
because the eviction callback can access other host stores. Live combat remains
single-host state: this storage adapter does not enable multiple game replicas.

`AuthAdapter.isCurrent` checks PostgreSQL asynchronously at admission boundaries.
Clerk mode uses the same verified-identity callback as SQLite, disables guest
recovery, and never grants anonymous fallback.

Run `postgres.test.ts` with `TEST_POSTGRES_URL` or `TEST_POSTGRES_URL_FILE` set to
a test database connection (the latter reads a private local file). Tests create
and remove a uniquely named schema; they do not alter public-schema accounts.
Real PostgreSQL coverage includes service restart, concurrent single-use token
consumption, recovery after expiry, failed eviction retry, revocation during
pending eviction, competing restores, allocation/replay rollback and Clerk lease
isolation. Credentials and raw storage errors are never included in HTTP errors.


### Export policy for Clerk

Network-enabled combat exports permit the Clerk development Frontend API under
`https://*.clerk.accounts.dev` for SDK scripts and API connections, the documented
Cloudflare/Clerk protection origins for scripts and frames, `https://img.clerk.com`
for account images, and self/blob workers. Protection connections permit Clerk's
nonstandard TLS ports. Other exports retain their closed offline policy; arbitrary
HTTPS script/connect origins and `unsafe-eval` remain disallowed. A configured
host adds the exact HTTPS Frontend API origin from its publishable key to the
served document's script/connect policy. This deployment-owned amendment changes
no exported file, project, asset or runtime bytes. Offline/ambiguous policies
reject amendment; `demo-document.test.ts` covers the boundary. Production keys
also require the game to use the Clerk production domain or a subdomain; changing
CSP does not bypass Clerk's Origin validation. A live browser exposed the missing
development SDK permission; the export regression is
`packages/engine/src/project/standalone/playable.test.ts`.

Source: [Clerk CSP requirements](https://clerk.com/docs/guides/secure/best-practices/csp-headers).
