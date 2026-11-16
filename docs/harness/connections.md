# Remote connections and durable operations

Connections are host-owned provider capabilities shared by Harness, Editor and
Swarm. `@hyperfocus/ai-core/connections` owns framework-neutral contracts and the
client. `@hyperfocus/ai-runtime/connections` owns adapter execution. This extends
the existing local credential infrastructure without exposing its secrets remotely.

The initial adapters are Codex subscription authentication and the existing Railway
bridge/storage connection. Codex uses the official app-server device-code flow and
completion notification. Account and quota checks independently verify the result.
Credentials remain in the coordinator's private `CODEX_HOME`; no local login copy,
SSH key, API-key fallback or worker credential distribution is involved. Railway
is host-managed: the UI reports bridge/storage reachability, while actual sandbox
admission verifies provider access. The UI cannot rotate its workspace credential.

Hosts that isolate accounts may pass an explicit `cwd` and `env` to the Codex
connection adapter and subscription reader; the environment is still allowlisted.
`@hyperfocus/ai-runtime/connections/codex` also exports `openCodexAccountSession`
for bounded official account/model RPC. Books uses these hooks for separate
per-user homes without inheriting the service's credentials or working directory.

## User flow

Harness and Editor expose **Manage remote connections** in the Swarm workflow.
The trusted host issues a one-use link to `/connections`. The surface also works
independently of a campaign:

```powershell
bun run connections --deployment <receipt-id> --project <project-id> --agent <thread-id>
bun run connections --deployment <receipt-id> --list
bun run connections --deployment <receipt-id> --project <project-id> --agent <thread-id> --connect codex-account
bun run connections --deployment <receipt-id> --operation <operation-id>
```

Alternatively configure `HYPERFOCUS_HOST_URL` / `HYPERFOCUS_HOST_TOKEN`; existing
Swarm host settings remain compatible. Device authorization is an explicit user
action on the official provider page. Closing the browser does not stop sign-in.
The page streams status and can cancel sign-in or disconnect Codex. Disconnecting
removes this host's login, not every account session.

Browser grants use `@hyperfocus/ai-runtime/browser-grants`, also used by Swarm run
access. Connection grants are separate: controlling a campaign does not authorize
changing host credentials. Grants limit project, event recipient, connection IDs
and lifetime. One-use exchange, hashed cookies, exact origin, CSRF, revocation and
expiry protect them. The broad host bearer token never enters browser JavaScript.

## Operations and events

`@hyperfocus/ai-runtime/operations` commits operation state and a credential-free
agent event in one SQLite transaction. Stable operation IDs, versioned immutable
events and explicit recipient acknowledgements support offline continuation.
Progress events carry `terminal: false`, so acknowledging progress does not remove
unfinished work from the waiting list. Existing one-shot result events remain
terminal when that optional field is absent.
The shared `/api/agent-events/v1` endpoint and MCP tools cover connections and
campaigns; the earlier Swarm event route remains compatible. Events contain
references and summaries. Device codes stay in authorized connection state.

Connection attempts have a 15-minute deadline and one owned provider process.
Duplicate requests do not start competing logins. After restart, account inspection
resolves a completed login; an interrupted login becomes retryable failure with
its stale code removed. Waiting work remains saved. Token refresh belongs to the
official provider runtime.

A requested campaign launch persists a separate operation while connections are
unavailable. It starts once they become ready, including after restart. Its
execution clock starts at actual launch. The connection wait expires after 15
minutes; cancellation prevents later launch. Authentication loss during active
work prevents new dispatch without resetting the original deadline or budgets.
Quota and budget failures retain their separate limits.

## Evidence and limits

Runtime connection tests, HTTP capability tests and the Swarm connection-gate test
cover process ownership, deduplication, replay, restart, cancellation and access.
`scripts/verify-connections.ts` exercises the phone UI, browser closure before
completion, automatic launch and durable callback against a simulated provider.
It is not live authentication evidence. The [campaign repair plan](swarm-campaign-repair-plan.md)
records cloud acceptance separately.

`HYPERFOCUS_CODEX_ACCOUNT_TEST=1 bun test packages/ai-runtime/src/process/codex-connection.live.test.ts`
checks a fresh private home with the installed official CLI, without reading a
user account or invoking inference. For live browser evidence, mint a separate
access receipt and run `bun apps/harness/scripts/verify-remote-connections.ts
--access-file <receipt.json>`. This observes current authorization, disconnects
and reconnects the browser, and masks the code in captures. It does not complete
the user's account authorization or establish campaign success.
`bun apps/harness/scripts/swarm/verify-workflow.ts --connections-only` exercises
both native entry points, their authenticated project proxies and the shared page
against simulated providers.

This host has one trusted owner and a configured project allowlist. Multi-user
ownership, per-agent connection policies and other providers require their own
authorization contracts. Offline agents retrieve retained events on reconnection;
waking an inactive agent requires an available agent host.
