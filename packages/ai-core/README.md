# @hyperfocus/ai-core

`/connections` provides framework-neutral provider connection, device-action and
durable-operation contracts plus an authenticated-fetch client. Hosts own secrets
and execution; [Remote Connections](../../docs/harness/connections.md) owns the workflow.

Canonical, framework-neutral AI contracts. The package contains the zod-validated Harness protocol and WebSocket client plus app-neutral execution profiles, runtime catalogs, run envelopes, typed action plans, and handoffs.

`@hyperfocus/ai-core` never executes a model or reads credentials. Harness and first-party app hosts own privileged runtime state through `@hyperfocus/ai-runtime`; browser UI owns only the selected profile and reviewed action proposal.

`@hyperfocus/ai-core/agent-events` defines durable event envelopes, recipients and
the resume/wait/acknowledge client. Waiting uses a server-held callback rather than
client polling; hosts own authentication and decide when results are durably
incorporated. [Swarm](../../docs/harness/swarm.md#campaign-ownership-and-agent-continuation)
is the first producer and Harness/Codex continuation is its consumer.

## App runtime contracts

Import `@hyperfocus/ai-core/runtime` for `AiExecutionProfile`, `AiRuntimeCatalog`, `AiRunRequest`, and `hyperfocus-app-action-plan-v1`. Agent, provider, and model are separate identifiers so hosts can offer direct providers, authenticated CLIs, or additional adapters without changing UI contracts. Action plans carry a base revision, default to atomic intent, cap bulk calls, and must be validated again by the receiving app before mutation.

`AiRunRequest.deadlineAt` is an optional absolute Unix-millisecond deadline that
survives transport hops. `AbortSignal` remains process-local and is supplied to
the privileged runtime separately; a transport stopping its wait is not proof
that provider or native execution has stopped.

`AiRunResult.usage.costSource` distinguishes estimated cost from provider-reported
charges independently of token usage. Subscription routing and calculated token
rates supply estimates, including zero estimates; they are not billing receipts.
Consumers preserve omitted provenance as reported for existing adapter compatibility.

Catalog consistency validates the agent/provider/model graph independently of
installation or authentication state. `assertProfileAvailable` validates a selected
execution profile; an unavailable optional adapter does not invalidate the catalog.
Use `chooseAvailableAiProfile` to reconcile persisted preferences with the current
catalog. It preserves compatible choices, falls back to an available graph, and
clamps reasoning and web-search settings before an app submits a run.
Fallback searches subsequent providers and agents when a preferred route has no
described model; it returns no selection only after all available routes are exhausted.
Providers may declare `defaultModelId`; a described, supported declaration wins
over catalog order, while an explicit compatible model remains authoritative.
Missing/stale declarations are ignored. A sole described model remains unambiguous;
multiple models without a default require an explicit selection. UI hosts can use
`chooseAiProfileConfiguration` to expose an incomplete configuration with empty
`modelId`; that draft fails execution-profile validation and must never enable Send.

`SharedAiPreferences` holds a version and optional provider and reasoning defaults.
The retired `designGuidance` field is ignored when reading legacy preferences.
Design context is derived from the task, not stored as a preference.
`aiDesignGuidanceForTask({ task, projectContext? })` returns compact defaults for
interface work and unspecified app creation, with only the forms, data, navigation,
media, game-menu or interactive-learning branches evidenced by the task. Composition
and semantic content precede decoration; menu guidance declares audience/priority,
while learning guidance requires observed completion, correction and isolated examples.
User and project stacks and visual
references govern; the helper imposes no brand, palette, or component library.
Material unresolved preferences call for a focused question; reversible details
use task-appropriate choices. Project context cannot
trigger UI intent. Audio-only, CLI, backend-only, and explicitly excluded UI tasks
receive no design context. The deterministic router is deliberately bounded;
project instructions and the user's actual requirements always take precedence.
Mixed CLI/UI requests add context only when a visual companion is explicit;
reading UI logs in a CLI is not interface work. Representative Spanish, French,
and German app-creation phrases are covered, not unrestricted language detection.
`applySharedAiPreferences` resolves these against a host catalog; an explicit app
profile takes precedence. With no saved provider, OpenAI is the initial default,
matching Harness; an unavailable catalog route falls back to another described
provider and model. Credentials, model IDs, and execution permissions never
travel in this shared contract. Persistence and transport belong to
[`@hyperfocus/ai-runtime`](../ai-runtime/README.md).

Action-plan extraction accepts one schema-valid plan among surrounding JSON
metadata and preserves fenced scalar extraction. Multiple valid plans fail
explicitly; processing is bounded to 2 MiB and 64 JSON candidates.

## Client lifecycle

Control frames retain JSON by default. `encoding: "protobuf"` opts a Harness client
into the bounded dynamic-value experiment through `?encoding=protobuf`; readers
accept both forms. This is separate from the proposed typed event schemas in the
[serialization benchmark](../../docs/serialization-evidence.md), and has no default
performance claim. Existing binary terminal/stream protocols retain their owners.

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
