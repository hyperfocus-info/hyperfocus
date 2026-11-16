---
name: swarm-engineering
description: Run or extend Hyperfocus remote engineering swarms, isolated candidate tournaments, controlled performance comparisons and reviewed integration. Use for cloud swarm work; ordinary local delegation stays with the owning product workflow.
---

# Swarm engineering

Read [the swarm owner](../../../docs/harness/swarm.md) and the selected project's
trusted recipe. `bun run swarm help` exposes operational commands;
`bun run swarm:deploy --plan` describes the exact Railway deployment candidate.
Provider lifecycle and live probes belong to [the bridge](../../../apps/swarm-worker/README.md).

Resolve the project, immutable source and explicit completion criteria. For a run
on an already configured cloud coordinator, use `bun run swarm launch --file
<request.json> --root <repository> --agent <thread-id>`. This returns phone access
and a durable event recipient without local execution or monitoring duties.
Always include the returned run URL in the first launch/progress response and
the final handoff; include the artifact URL when a viewable build exists. Follow
the [access and retention handoff](../../../docs/harness/swarm.md#access-and-retention-handoff)
for link verification, expiry, local-lab links and inexpensive post-run access.
Use native `agent_events_resume` / `agent_events_wait` when available, or
`swarm continue` / `swarm wait --project <id> --agent <thread-id>`. On a later
"continue", retrieve retained results before starting new work. Acknowledge only
after durable incorporation; a disconnected wait must not cancel the cloud run.
The [owner](../../../docs/harness/swarm.md#campaign-ownership-and-agent-continuation)
defines delivery and deployment limits. Never substitute `live/hosted.ts` for this
remote ownership workflow; it is a laptop-owned diagnostic runner.

For missing remote authorization, use [Connections](../../../docs/harness/connections.md)
through either native host or `bun run connections --deployment <id> --project <id>
--agent <thread-id>`. Give the user the scoped phone link. The cloud owns device
sign-in and saved launch intent; agent events report completion or failure. Do not
register an SSH key or copy local auth to solve a connection prompt.

For an existing run
on a configured public coordinator, prefer
`bun run swarm site --public --run <id>` and give the user its returned link.
View access is the default; add `--access control` when the requested workflow
includes steering, queueing follow-ups or cancelling work. These one-use links
create expiring sessions scoped to that run and its same-source follow-ups;
keep unopened links private. The public page cannot upload arbitrary source or
apply patches locally. `swarm help` lists expiry and revocation commands.
Use `bun run swarm site --project <id>` for local setup and native integration.
Issuing a link starts no compute and does not provision a deployment. CLI and UI
share request defaults, completion criteria and budget admission.

Default to auto mode. Verified host profiles use Astra x-high for planning/review
and Sol 6.1 high for bounded implementation; difficult work can retain Astra.
Maximum intelligence keeps the highest profile throughout. Carry completion
criteria, source, artifact IDs, reproduction commands, blockers and remaining
budgets in compact handoffs. Let trusted recipes run checks and comparisons;
do not spend model turns narrating scripts or repeat full transcripts. Surface
token, duration, compute and weekly allowance ceilings before launch. Weekly
allowance observations include other account activity and are not exact per-run
metering; host deployment expiry always wins over a longer requested duration.

Capture a known revision, including an immutable working snapshot when the
consumer is uncommitted. The host preserves the developer's index and branch.
Never silently replace cloud execution with local execution or upload ignored
local data to make a preflight pass.

Use the existing model runtime with bounded roles and remote tools. Verify the
configured Codex subscription with `bun run swarm:auth --probe`; never fall back
to paid APIs. Keep subscription auth in the coordinator, Railway keys in the
bridge, and neither in sandboxes. Refresh `swarm:deploy --billing` before spending.
Persist partial evidence before cleanup. Existing project notes hold compact run
dispositions; individual findings do not become global policy.

Correctness precedes controlled timing. Compare paired baseline/candidate trials
through `@hyperfocus/performance/swarm` on the exclusive measurement worker.
Railway hardware remains shared; preserve noisy outcomes and missing browser/image
evidence as promotion blockers. The [Touch of Death recipe](../../../packages/engine/examples/touch-of-death/docs/swarm.md)
owns its measurement scope.

Show immutable patches and verification before human integration. Use host review
to verify the source tree and repeat trusted checks remotely. Stale source,
conflicts or failed checks leave integration incomplete. Publication and cloud
spending follow the existing explicit authorization, including its limits.

Report deterministic tests, disposable local execution, browser fixture evidence,
and actual Railway execution separately. The [campaign repair plan](../../../docs/harness/swarm-campaign-repair-plan.md)
records current persistent hosting, Connections and campaign acceptance evidence;
the earlier temporary demonstration does not establish those gates.
