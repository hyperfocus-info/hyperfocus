# Website host

Privileged HTTP and Hyperfocus Clerk OIDC primitives shared by Books, Trade Bot
and PadPilot/marketplace. No browser framework, app data, or provider credentials
are stored here. Import the explicit `/http`, `/oidc`, `/oidc-provider`, and
`/oidc-session` exports.

Hosts supply the canonical HTTPS origin, confidential client credentials, stable
session secret and a unique `sessionNamespace`. Authorization uses S256 PKCE,
state, nonce and issuer-bound RS256 verification. Encrypted host-only cookies
persist across restarts; pending logins intentionally do not. Only a verified
ID-token email claim sets `emailVerified`.

Books keeps its existing namespace and session format through compatibility
adapters. Trade Bot uses `trade`. Neither app accepts the other's cookie.
Hosts retain canonical-host routing, authorization, persistence and cleanup.

`/development-auth` supplies the local account used by Books, Trade Bot and
PadPilot/marketplace. With `NODE_ENV=development` and an exact loopback origin,
these apps open as **Local developer** without Clerk credentials or login. The
identity is stable across restarts and scoped to each app's development database;
it issues no cookies or tokens. Hosts bind to loopback and retain origin checks,
validation and entitlements. Production, public origins and Railway environments
never enable it. Set `HYPERFOCUS_DEV_AUTH=0` before starting/restarting a managed
server to test normal authentication. Provider and broker credentials remain
separate from application sign-in.

`/approval-policy` and `/mute` expose owner-scoped approval routing and deterministic
time parsing. `/text-channel` defines send/receive/delivery contracts and unique
recipient-to-owner mapping with multiple domain scopes. `/twilio` is a replaceable
host adapter with signed callbacks, provider-record checks and bounded requests.
Only its signature validator is imported from the Twilio SDK. Hosts own verified
phone bindings, encrypted persistence, outbox recovery and exact-action approval;
these are not repository preferences or engine dependencies. Trade Bot is the
first messaging consumer; Books does not inherit its trading approval policy.

Verify the real consumers with:

```powershell
bun test apps/engine-editor/website/examples/books/src/server/oidc.test.ts
bun test packages/website-host
bun run --cwd apps/engine-editor/website/examples/trade-bot test
bun run --cwd apps/engine-editor/website/examples/trade-bot build
```

The [package testing guide](../../docs/package-testing.md) owns public-contract
coverage requirements.

[Delivery receipts](src/delivery/README.md) own artifact validation, explicit Railway uploads and artifact-bound acceptance.
