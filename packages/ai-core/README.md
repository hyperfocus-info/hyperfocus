# @hyperfocus/ai-core

Canonical zod-validated harness protocol plus a framework-neutral WebSocket client. Applications own presentation; the harness owns runtimes, persistence, credentials, and run state.

The client is deliberately optional. Consumers can remain fully offline and connect to a local harness only when AI features are requested.

## Client lifecycle

`createHarnessClient(options)` treats `connection.ready`, not the WebSocket `open` event, as the usable boundary. `connect()` resolves with the validated workspace and agent snapshot only after that event. Snapshots distinguish `connecting`, `connected`, and `recovering`; the default client reconnects with bounded exponential backoff, checks liveness with protocol pings, ignores events from stale sockets, and rejects oversized event frames before parsing them.

`send(command)` returns a discriminated `sent`, `queued`, or `rejected` result. Commands issued during connecting or recovery use a bounded in-memory queue and flush in order after the next ready snapshot. They are never presented as sent merely because a socket object exists. Set `reconnect: false` for integrations that own recovery, or tune the timeouts, retry bounds, queue limit, and event-frame limit in the single client options object.

`sendChat(input)` returns the exact request ID placed on the wire together with its delivery result. Use `local-${requestId}` for an optimistic transcript row, then replace that row when the corresponding persisted user-message event arrives. This keeps the interface immediate without inventing an unrelated client identity.

The public `protocol` entrypoint is a compatibility barrel over domain modules in `src/harness/protocol/`. Each domain keeps its Zod schemas beside inferred types; client-command and server-event unions are the only aggregation layers. Add contracts to the owning domain instead of rebuilding a monolithic protocol file.

## Shared capacity

`createCapacityGovernor(options)` atomically acquires named resource permits for
work that spans several scarce systems, such as one subagent plus one provider and
one BranchFS mount. The default is strict FIFO; an optional bounded-bypass policy
can use otherwise-idle capacity while an aging limit prevents permanent
starvation. Queue size, cancellation, active counts, peaks, waits, and releases
remain explicit. Configure capacities once at the host boundary and pass small
resource/count records to leaf work; do not allocate policy objects inside hot
loops. The contract is framework-neutral and its scaling test contends 1,000
mixed-resource tasks while asserting every configured peak.

The same governor can enforce rolling request/token budgets through `rateLimits`
and per-acquisition `rateCosts`. Hosts can apply a shared cooldown with `defer`,
or change a resource limit with `setCapacity` when a provider reports congestion;
queued work is reconsidered without revoking active leases. Snapshots distinguish
capacity waits, rate-window deferrals, cooldowns, and adaptive changes so a faster
machine cannot accidentally bypass an external account limit.
`createCapacityLeaseRegistry({ governor })` bridges resources whose start and end
arrive as separate events, such as browser tool calls. Stable keys reject duplicate
pending/active reservations and abort signals release leaked leases.

Related: [architecture](../../docs/architecture.md), [package testing](../../docs/package-testing.md), and [documentation map](../../docs/README.md).
