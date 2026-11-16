# Hyperfocus Trade Bot

The owning package exposes `/build` and `/editor-host` for the editor's build and
loopback preview composition. These APIs retain Trade Bot's own build, host and
persistence implementation.

Client features read authentication, trading state and command access from one
`SessionProvider` per mounted desk; the app creates the session once and object
replacement remounts its features. `DeskNavigationProvider` owns view and account
selection. Connection features consume their keyed `AccountProvider`; rule/inbox
drafts reset on account changes. Exit proposals key session, account and position,
preserve same-position edits and reject navigation from disposed async work.
Reusable input events and actual row editor identities stay explicit.

A persistent trading-automation example in **Editor → Website → Starters &
quickstart → Open Trade Bot example**. Its workspace is separate from the website
draft. The hosted candidate uses `https://trade.hyperfocus.info`; see the
[DNS and provider handoff](docs/deployment.md).

The desk, signal review, rules, action journal, assistant, connections, approvals, appearance
and optional guided practice each have their own screen. Shared Hyperfocus
controls, preference storage, theme tokens and tutorial primitives own their
respective behavior. Narrow screens use one page selector and retain the global
pause action. Appearance changes never change trading data.

## Execution contract

Paper mode uses owner-supplied simulated fills. Initial Tradovate and OANDA v20
adapters support authorized account discovery, protected entries, target changes
and reconciliation. Their real broker-demo acceptance is pending; live submission
is off unless the host explicitly activates it after acceptance. See
[broker capabilities and recovery](docs/brokers.md). TradingView usernames are
organizational labels. Clerk authenticates the Hyperfocus owner; the broker
separately authorizes execution. Universal broker support is not claimed.

The default $450 cap covers the combined planned take profits of currently open
positions **per trading account**, as confirmed by the user on 2026-10-25.
It does not include closed profits. A second position proportionally lowers
existing and incoming targets, rounding toward entry to valid ticks. Two $300
targets become $225 each. An impossible cap rejects the entire entry. Closing
a position does not automatically increase remaining targets. This bounds planned
gross profit; fees, gaps, slippage and broker fills can change actual results.

Each account defines its own futures/CFD symbols, broker mappings, price ticks,
USD tick values and quantity steps. MGC, MNQ, GC and NQ are the initial paper
defaults. Exact integer arithmetic retains sub-cent tick values; cap rounding
never rounds up and risk rounds up to cents. Personal, evaluation and funded
account types share the same configurable authority; a label does not infer a
prop firm's drawdown formula or automation permission. Each account has a
loss-per-trade limit, daily loss budget including open stop risk, maximum position
count, signal-age limit and configurable OCR threshold, initially 95%.
Both workspace and account must be enabled.
Pausing blocks new entries; it leaves existing positions and exits intact.

Missing entry quantity defaults to per-account risk sizing, including explicit
fee/slippage estimates and whole tradable steps. Screenshot order labels never
supply a new quantity. Stop/target updates require an exact trade comparison and
owner approval. See the owning [signal policy](docs/signal-policy.md) for sizing,
approval, partial broker failure recovery and chart-reading acceptance limits.

Google Voice uses opt-in message forwarding to Gmail and read-only Google OAuth.
The worker polls every 30 seconds. Authenticated forwarded mail must match an
exact sender, account, instrument, quantity and UTC session. One supported image
is read by Cloud Vision. The weakest word confidence is used; missing confidence,
missing images, ambiguous tickets, overlapping rules and failed risk checks hold
the signal for review. Stale signals expire. Supported explicit ticket format:

```text
BUY MGC QTY=1 ENTRY=2700 SL=2695 TP=2730
```

Omit `QTY=1` to use account sizing. Optional image-model chart candidates follow
the owner's app/text/automatic approval mode; OCR word confidence alone does not
establish chart-role accuracy. [Approval policy](docs/signal-policy.md) owns the
mode, risk-confirmation and mute behavior across the owner's financial accounts.
[Text messaging](docs/text-messaging.md) records the provider spike and setup.

Typed tickets always require review. Original photos and Google refresh tokens
are encrypted at rest; idempotent source receipts survive restarts. An enabled
email connection sends review notices only to the owner's verified Clerk email,
with durable retries and provider idempotency. In-app review works independently.
Actual Google Voice attachment formats and delivery latency still require a
real connected-account acceptance run.

UI, AI and worker mutations share `src/domain/commands.ts`. Batches are atomic,
revision-checked and idempotent; accepted actions append evidence to the journal.
AI saves proposals for explicit review or applies eligible risk reductions
within owner-defined account boundaries and approval mode. It cannot automatically change its own
authority, resume automation, connect brokers or submit orders through that policy.
Optional periodic analysis persists its cadence and results. Stale proposals are
held. Optional Tavily research uses explicit public queries and a primary-source
domain allowlist, retaining citations. Account-specific patterns exclude closes
with missing P&L. Sample counts are not statistical proof; automated backtesting
and held-out forward-trial evaluation remain unimplemented.

## Develop and verify

Managed localhost runs and editor previews open with the shared
[development account](../../../../../packages/website-host/README.md).

```powershell
bun run --cwd apps/engine-editor/website/examples/trade-bot test
bun run --cwd apps/engine-editor/website/examples/trade-bot typecheck
bun run --cwd apps/engine-editor/website/examples/trade-bot build
bun .agents/skills/dev-server/scripts/dev.ts start trade-bot --json
```

The returned managed URL is authoritative. Tests cover cap rounding, loss exposure,
pause scopes, stale/future signals, configurable confidence, authenticated sources,
tenant isolation, atomic rollback, broker payloads/metadata, unknown outcomes,
bounded AI authority, retries and restart persistence. Browser
acceptance exercises the two-position desk, all tutorial phases, demo restoration,
rules, instrument/policy settings, appearance, reload and phone layouts. Provider fixtures do not establish
real external connectivity. Human taste approval remains open.

SQLite WAL and the background worker share one process and one persistent volume;
run one replica. Limits are 2,000 workspaces, 30 accounts and 100 rules per owner,
and 5,000 positions/signals per workspace. Reaching a limit fails explicitly;
automatic archival and horizontal scaling are not implemented. Keep volume
backups and the session/encryption secret together; losing the secret prevents
decryption. Public practice workspaces use isolated seven-day browser cookies.

See [user stories](user-stories.md) and [research and remaining delivery gates](docs/research.md).

Deployment uses the [shared receipt CLI](../../../../../packages/website-host/src/delivery/README.md): `bun deploy.ts --check`, then an authorized `--target target.json --out .local/deployment-receipt.json --wait`. Existing receipt paths are never overwritten.
