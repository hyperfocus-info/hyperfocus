# Railway execution bridge

This private Node 24.22.0 service hosts `railway@3.16.0`. Harness's Bun coordinator
calls it through `@hyperfocus/ai-runtime/swarm`; it is not an independent agent
runtime. The coordinator owns goals, reasoning, permissions, evaluation, budgets
and durable artifacts. The bridge owns sandbox credentials, execution sessions
and its persistent cleanup registry.

The adapter creates an immutable Git checkout from an allowlisted HTTPS URL or a
SHA-256-verified Git bundle. Railway caches the Bun 1.4.3/git toolchain template;
prepared workspaces can be forked or explicitly checkpointed. Every fork has
independent files, explicit resource limits, ISOLATED networking and no public
domain. A command has a bounded deadline, streamed output, cancellation and a
durable session ID. Repeated create/fork task IDs reuse the same workspace and
budget reservation across concurrent retries and bridge restarts; changed source
or fork parent fails. Interrupted preparation is destroyed before one replacement
is admitted. Repeated command IDs reconnect or return the persisted receipt;
changing their input fails. Patches include new files and deletions via
a temporary Git index. The coordinator persists captured bytes before cleanup.

Current service images use Node 24.22.0. Sandboxes use Railway's supplied Node
24.22.0 and verify that version plus Bun 1.4.3 before becoming ready; the template
does not download another Node version or replace its PATH. A provider runtime
change fails the explicit version check until the toolchain contract is updated.
Local version selection remains under the developer's nvm configuration.

Registry writes record ownership before preparation and ready status afterward.
Interrupted preparation is destroyed before retry. One service replica owns the
volume. Three-minute idle expiry and a sixty-minute absolute reaper bound leaked
compute. The coordinator may heartbeat workspaces while a run is active;
heartbeat stops on coordinator failure. There is no permanently idle pool.

## Deployment and verification

For laptop-independent work, use the authorized persistent coordinator and private
bridge. [Connections](../../docs/harness/connections.md) provides remote Codex
sign-in from a phone; no Railway SSH key is needed. The public coordinator owns
campaigns, durable operations and agent events. Worker lifetime and cumulative
compute admission limits remain separate from ongoing service hosting.

The following laptop topology is a diagnostic option, not the remote user workflow.
The bounded laptop topology keeps the existing Codex login, coordinator database
and durable artifacts on the workstation while every execution workspace runs on
Railway. It creates no Railway services, SSH keys or remote authentication copy:

```powershell
bun apps/harness/scripts/swarm/verify-live.ts --topology laptop --demonstration-id <new-UUID> --credential-id <existing-credential-UUID> --railway-cli <railway-executable> --node-executable <Node-24-executable> --project-root . --project-id touch-of-death --request-file <request.json> --compute-usd 10 --run-minutes 60 --allow-launch --provider-smoke
```

The request file supplies the goal, completion criteria, hypotheses and budgets.
Its compute ceiling must be at most $9, with $0 separately billed inference and
at most three workers. The provider smoke and run share the same persistent $10
ledger and original expiry, including retries. Source capture includes only the
existing immutable snapshot policy's accepted files; ignored inputs stay excluded.
The existing Windows-encrypted credential helper verifies workspace scope before
starting the Node bridge. Select an installed Node 24 executable explicitly.

Receipts, immutable source, logs and coordinator artifacts live under
`.local/swarm/live-hosted/<id>/`. Reusing an ID preserves its request, source,
reservations and expiry. Owned processes shut down through their stdin lease;
the bridge destroys recorded sandboxes before exiting and retains failed cleanup
records. The laptop must remain available during work. This topology proves
Railway execution separately from coordinator hosting; it does not verify remote
coordinator failover or public hosting. `SWARM_COORDINATOR_TOPOLOGY=laptop` permits
the explicitly chosen durable host store; deployed Railway coordinators still
require their private bucket.

Bounded recovery may use the same command with `--attempt 2` or `--attempt 3`
after every preceding run is terminal and its process/sandbox cleanup is confirmed.
Each captures fresh source and writes separate `attempt-<number>/` receipts while
preserving the original request, shared ledger and expiry. A driver ownership lock
rejects concurrent attempts and fails closed on stale receipts; a fourth attempt
is refused. Recovery remains within the original spending and duration authority.

Run from the monorepo root:

```powershell
bun run swarm:deploy --plan
bun run swarm:deploy --preflight --railway-cli <railway executable>
bun run swarm:deploy --billing --railway-cli <railway executable>
bun test apps/swarm-worker/src packages/ai-runtime/src/swarm
bun build apps/swarm-worker/src/server.ts --target node --format esm --external railway --outfile apps/swarm-worker/.local/server.mjs
```

The plan names the project, dedicated services/volumes, bucket prefix, required
variables and conservative cost estimates. Billing inspection uses authenticated
read-only queries and prints a sanitized report; it never changes account limits.
The Pro upgrade was verified October 16, 2026 at 01:12 UTC: $20 included usage,
with $3.4390 used and approximately $16.5610 of shared included usage remaining.
The cycle ends October 26 at 01:14:49 UTC. Sandbox usage qualifies for that
allowance, but it is not reserved: unrelated workloads continue spending it, and
reported usage can lag. The $10 demonstration admission ceiling fits this
snapshot. Refresh billing before provisioning; Pro entitlements do not increase
the requested fleet or resource allocations.

The temporary demonstration mode uses two services for at most two hours, with
no persistent idle fleet. At full assigned resources the four sandboxes cost at
most about $1.1111/hour for CPU/RAM, and both trusted services total about
$0.1667/hour (one vCPU and four GB per trusted service). Egress and artifact storage
are additional. A durable bridge ledger reserves 65 minutes of full CPU/RAM for
every created/forked sandbox across all runs and probes, plus $1 for hosting and
egress; reservations are never reset by cleanup or service restart. It rejects
admission beyond $10 or the two-hour expiry. This is an estimated admission cap,
not a provider-enforced charge guarantee: no per-sandbox egress cap is configured,
and the account-wide limit stays unchanged.

After explicit deployment authorization, provide `SWARM_RAILWAY_API_TOKEN` through
the invoking environment and run:

Create that token at [Railway account tokens](https://railway.com/account/tokens),
selecting the existing workspace rather than the broader account scope. Token
creation is a credential change covered by deployment authorization. The official
[sandbox quickstart](https://docs.railway.com/sandboxes/quickstart) requires an
account or workspace API token; a project token is not the documented SDK path.
The workspace token still has access to unrelated workspace resources, so it stays
in the trusted private bridge and should be revoked after this temporary deployment.
Do not set `RAILWAY_TOKEN`, which selects project-token authentication.

```powershell
bun run swarm:deploy --provision --allow-provision --demonstration-id <approved UUID> --project-ids 959d56f6-7585-4e13-9eee-c8a2c6309ccc,editor-workspace,touch-of-death --max-usd 10 --lifetime-minutes 120 --railway-cli <railway executable>
bun run swarm:deploy --inspect <demonstration-id> --railway-cli <railway executable>
bun run swarm:deploy --auth <demonstration-id> --railway-cli <railway executable>
bun run swarm:deploy --ready <demonstration-id> --railway-cli <railway executable>
```

Before creating services, the script verifies that the approved existing bucket
has an instance in the selected environment and reads only its URL-style metadata.
It does not create a missing bucket instance or retrieve credential values during
this check. `SWARM_S3_URL_STYLE` is set to `virtual-hosted` or `path` from that
metadata; unresolved references or unknown styles block deployment. Cloud readiness
then verifies a durable artifact write/read round trip before inference or workers.
Cloud execution never falls back to service-local artifact files.

The script validates the complete immutable source, then creates uniquely
named services, attaches dedicated `/data` volumes, applies resource caps, configures
private networking/bucket references, uploads that source and creates only the
coordinator HTTPS domain. It stores exact ownership IDs and separate local secret
files under `.local/swarm/deployments/<id>/`; it never copies the CLI credential
store. Railway chooses initial volume capacity because its public create API has
no capacity argument; the receipt records the reported size, and no resize occurs.
Inspect deployment health before authenticating. `--auth` now returns the shared
`bun run connections --deployment <id> --project <id>` command. Open its scoped
phone link and complete the official Codex device authorization. Closing the
browser does not stop the remote operation. No local account file is copied.

Legacy temporary-deployment cleanup can use an already authorized SSH identity:
set `SWARM_SSH_IDENTITY_FILE` before `--cleanup`. This is not required for sign-in
or persistent campaign execution. The scripts do not register keys. Workspace SSH keys
grant access to all workspace services and have no automatic expiry. Registering
one requires separate credential authorization. Record its ID and fingerprint,
revoke that exact key after remote operations, verify removal, and delete only
its owned local private/public files. Service cleanup does not revoke the key.
The project IDs above identify this existing Hyperfocus workspace; supply explicit
registered IDs for another installation. `--ready` checks the deployed subscription,
Railway backend and exact project allowlist before creating any sandbox. Bootstrap
waits for both deployments and attempts scoped cleanup if either build fails.
A killed provisioning process or provider outage still needs receipt-based cleanup;
Railway does not supply a service TTL during bootstrap.

Configure its returned URL and the locally saved coordinator secret as
`HYPERFOCUS_SWARM_URL` and `HYPERFOCUS_SWARM_TOKEN` in Harness and Editor.
Set Editor's server-only `HYPERFOCUS_SWARM_PROJECT_ID` to the registered Harness
project ID and `HYPERFOCUS_SWARM_PROJECT_ROOT` to that same repository to inspect
the same runs in both apps. Without this explicit mapping, Editor keeps its
`editor-workspace` project scope. The host resolves the alias before listing,
uploading or creating work; arbitrary project IDs remain denied.

The coordinator image also builds and hosts the compact `/swarm` website; no third
service or local development server is needed for an issued public link. Provisioning
sets `SWARM_PUBLIC_ORIGIN` to its generated HTTPS origin before upload. An optional
`--public-origin https://swarm.example.com` selects an already configured custom
origin; this script does not create DNS records. `SWARM_SITE_DIR` points to the image's
`/app/apps/harness/dist/swarm-site`. Omitting `SWARM_PUBLIC_ORIGIN` on a manually
configured coordinator leaves public browser access disabled.

With the owner URL/token configured in the invoking host, issue a private link:

```powershell
bun run swarm site --public --run <run-id>
bun run swarm site --public --run <run-id> --access control --expires-minutes 60
bun run swarm site-revoke --access-id <returned-access-id>
```

View access is the default. Open the one-use link within ten minutes; it exchanges
its fragment code for an HttpOnly scoped session, and the browser removes the code
from its address. The session expires after the requested duration (one hour by
default, at most 24 hours), bounded by deployment expiry. Control allows the selected
run and linked follow-ups to be reviewed, steered, launched, cancelled or rejected;
source upload, integration and further link issuance require the trusted host.
Revocation invalidates that link and every session created from it. Native Harness
and Editor can issue the same scoped links after authorizing the selected project.
The broad coordinator token never goes to the browser. Issuance starts no workloads.

Persistent hosting was explicitly authorized and deployed October 17. Current live
and fixture evidence, billing and remaining campaign acceptance gates are tracked
in the [repair plan](../../docs/harness/swarm-campaign-repair-plan.md). Temporary
demonstration mode retains its two-hour expiry; persistent service mode does not.

An authorized `swarm:deploy --update <id> --coordinator-only --allow-provision`
updates only the receipt-owned coordinator. Optional `--project-ids <full-list>`
updates its trusted recipe allowlist and saved receipt together; preserve existing
project IDs when adding a lane. This leaves worker code, credentials, volumes and
compute limits in place. The source upload and remote Railway build are distinct
from local tests; a workload-protection request still forbids local verification.

After the managed hosts have been configured and remote readiness passes, exercise
the actual Touch of Death recipe through Harness and inspect the same run in Editor:

```powershell
bun apps/harness/scripts/swarm/verify-live.ts --harness-url <managed Harness URL> --editor-url <managed Editor URL> --project-id <registered project ID> --project-root . --demonstration-id <approved UUID> --allow-launch --compute-usd 5 --run-minutes 60 --wait-minutes 65
```

This submits the owning game's goal and three hypotheses through Harness's
authenticated API, reviews and launches the plan in Harness UI, and observes it in
both apps. It uses 3 workers, 24 calls and 400,000 subscription tokens per agent,
600-second tasks and $0 separately billed inference. Keep the run duration within
the deployment's remaining authorized lifetime. It does not read Railway secrets,
provision resources, restart hosts, or approve a patch. The host captures the current
working source; credentials stay in the configured host environment. Replace
`--allow-launch` with `--run-id <id>` to inspect an existing run. Add `--reject-run`
only when rejection is intended. A timed-out observation cancels only a run this
invocation launched. Screenshots, source and run receipts are preserved in separate
invocation directories under `.local/swarm/live-ui/<demonstration-id>/`; `latest.json`
locates the newest attempt without overwriting earlier launch evidence. Completed
dispositions also verify the saved project note through Harness's existing memory
protocol. Provider inventory and benchmark evidence
must still establish remote execution, measurement quality and cleanup separately.

The coordinator image installs official `@openai/codex@0.163.0`, including its
Linux platform binary, with Node 24.22.0. Configure the `codex-cli/codex-account/default`
profile and `SWARM_MAX_MODEL_USD=0`. Device login provisions existing ChatGPT
subscription authentication into its private `/data/codex` volume. Authentication
is never copied into the image, uploaded source, sandbox or artifact bucket.
There is no separately billed model API fallback. A successful local ChatGPT
login does not prove that the deployed coordinator can authenticate; its readiness
and a real subscription call must be checked there.

At the end, run:

```powershell
bun run swarm:deploy --cleanup <demonstration-id> --allow-cleanup --railway-cli <railway executable>
bun run swarm:deploy --cleanup-credentials <demonstration-id> --allow-credential-cleanup
```

Credential cleanup is separately authorized and waits for a cleaned deployment
receipt plus authoritative absence of both temporary services. It verifies the
recorded SSH key's ID, workspace, name and fingerprint before revocation, verifies
remote absence, then removes only fingerprint-matching local key files. It retains
modified keys and any `known_hosts` file containing additions or changes. The
sanitized `ssh-key-cleanup.json` records each result. Revoke the exact temporary
Railway API token last using the existing owner login at
[account tokens](https://railway.com/account/tokens): workspace API tokens cannot
list tokens or identify their own token ID. The helper does not guess a token to
delete and does not claim that service or SSH cleanup revokes it.

Cleanup exports state, verifies its hash, destroys owned sandboxes, then removes
only the recorded new services and volumes. It preserves the existing bucket and
`pad-pilot`. The bridge also initiates this sequence at the two-hour expiry without
depending on a connected workstation. A stable bucket manifest at
`swarm/deployments/<id>/manifest.json` points to exported SQLite metadata and the
deployment receipt. Failed export stops deployments and retains evidence volumes;
failed provider cleanup retains ownership records for retry. These outcomes are
reported as incomplete, never as successful deletion. Every deletion/stop mutation
must return `true`; HTTP success alone is insufficient. Railway volume deletion
can queue a roughly 48-hour retention period: an instance may still report `READY`
with `isPendingDeletion=true` and a future `deletedAt`. This is queued storage
deletion, not immediate physical erasure of the volume or its Codex auth copy.
After verified export, the coordinator runs the pinned Codex logout against only
its owned `/data/codex` file store and verifies that login status and `auth.json`
are absent. A hashed cleanup receipt is retained in the bucket. This does not
claim confirmed server-side token revocation or physical erasure of provider
backups. Failure retains the evidence volumes and stops compute.
Compute shutdown is verified separately: no owned sandboxes, services or active
deployments may remain. The cleanup command rereads inventory
and billing; a lost SSH connection during self-deletion is not taken as proof.
If private coordinator export fails after a separately verified export succeeded,
rerun the same cleanup command. Its local fallback independently reads the bucket
manifest, hashed SQLite/deployment receipts and verified Codex logout receipt.
Only after checking the original budget/expiry, stopped deployments, no remaining
sandbox compute and exact service/volume ownership does it remove those resources.
`verified-export-fallback.json` records this proof; reruns tolerate absent services
and volumes already queued for deletion. The initial private-export failure is
retained as a diagnostic limitation rather than inferred to have succeeded.

Failed or cancelled investigations preserve patches up to 36,000 bytes as explicitly
unvalidated evidence before teardown, with a separate fifteen-second capture limit.
Publication requires the same live task lease/fence, source and workspace ownership;
it never sets a candidate's accepted patch. Oversized or unavailable patches leave
a bounded report. Interrupted commands retain bounded redacted logs and structured
receipts under that same ownership check without replacing the original failure.
Abrupt coordinator death or lease recovery can still prevent this
last capture; stale attempts cannot publish into a replacement attempt.
The provisioning script sets each recorded service's Dockerfile path, health check,
restart policy and resource limits through the Railway API. New services cannot
opt into legacy Config as Code; the December 1, 2026 cutoff applies only to
existing legacy services. There is no project-wide IaC apply that could take
ownership of `pad-pilot` or the existing bucket. See Railway's
[current migration rules](https://docs.railway.com/infrastructure-as-code#iac-vs-config-as-code).

The Dockerfiles use repository-root build context and exclude local state,
credentials, generated output and media. They require the matching committed
`bun.lock`. The SDK bridge intentionally runs under Node; importing the SDK in
Bun tests with a fake transport is not runtime compatibility certification.

After deployment and subscription readiness, run the real provider probe inside
the coordinator, which already has access to the private bridge and artifact bucket:

```powershell
railway ssh --project 13527ca6-cda6-4341-8d8a-9ab70d7bcdf5 --environment e46fa18a-61c0-4cc4-9379-45b8dfde47a6 --service <coordinator-id> -- bun apps/swarm-worker/scripts/verify-cloud.ts --allow-provision
```

This real-provider probe creates at most two short-lived sandboxes, uploads a
small immutable fixture, tests fork isolation, command output, nonzero exit,
timeout, cancellation, patch extraction and cleanup. It saves an attributable
report and retained patch in the durable artifact bucket, with a local receipt on
the coordinator volume. Its capability check may perform one small, cached Codex
subscription preflight; the execution probe itself makes no model calls. It is
separate from the required Touch of Death tournament.

Current evidence: deterministic service/provider tests, actual loopback HTTP,
disposable local Git execution, Railway Linux builds and deployed resource caps
passed. The worker's deployed Node 24.22.0 runtime was read back over SSH. The
coordinator rejects unauthenticated requests. A real two-sandbox probe verified
create/upload/fork isolation, command output, nonzero exit, timeout, cancellation,
patch retention and destruction; the native provider inventory confirmed both IDs
DESTROYED. The report and patch passed private-bucket hash readback. The owner
authorized the existing bucket's missing private `iad` instance separately.

Remote Codex subscription sign-in and its native-tool canary passed. Actual Astra
x-high and Sol 6.1 high subscription calls both passed; the production readiness
check verifies configured phase profiles before admitting workloads. No API fallback
is configured. Shared budget restart/expiry and export cleanup tests also pass;
the [live tournament report](../../docs/harness/swarm-live-demonstration.md) records
the independent investigations and their actual outcome. Final native inventory
confirmed all eleven sandboxes destroyed and both temporary services removed.
The two current volumes were detached and queued for Railway's recoverable deletion.
The worker's private export failed, so final service cleanup used the independently
verified bucket fallback described above; automatic self-deletion was not proven.
The existing bucket retained 37 objects / 137,954,449 bytes at verification time.

## Trust and provider limits

The bridge accepts authenticated host requests only, rejects browser origins,
checks repository URL allowlists and exposes only owned sandbox IDs. Sandbox
commands never receive Railway, model or database credentials from either
service. Captured file paths must stay inside their repository; size bounds and
hashes are checked before durable storage. The coordinator enforces project
authorization for source bundles and review access for results.

Railway's ISOLATED mode still permits outbound internet. It does not prevent
exfiltration of repository content, hostile dependency scripts or adversarial
programs that learn a secret from project source. A caller must authorize the
source and exclude secrets before upload. Checkpoint/fork files are untrusted;
they never grant coordinator filesystem or credential access. No public previews
are published. Captured browser/media artifacts use the authenticated host's
artifact viewer.

A workspace execution lease prevents concurrent swarm commands on that
workspace. It does not promise dedicated physical CPU or protection from
neighbouring provider tenants. Measurement quality is decided by the existing
performance comparison lane. The explicit local backend isolates disposable
working files but has the developer process's host privileges and cannot enforce
cloud CPU/memory limits; remote requests never silently select it.

Official references: [sandboxes](https://docs.railway.com/sandboxes),
[quickstart](https://docs.railway.com/sandboxes/quickstart),
[agent workers](https://docs.railway.com/guides/ai-agent-workers),
[private networking](https://docs.railway.com/networking/private-networking),
[buckets](https://docs.railway.com/storage-buckets),
[pricing](https://docs.railway.com/pricing),
[cost control](https://docs.railway.com/pricing/cost-control).
