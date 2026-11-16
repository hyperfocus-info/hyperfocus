# Railway swarm demonstration — 2026-10-16

The real Touch of Death run launched three isolated investigations on Railway,
retained a fresh CPU baseline and passed 237 baseline correctness tests. All three
hypotheses were rejected without implementation patches. The human review ended
the run without integration. **The completion contract remains unmet:** no
candidate comparison, paired performance experiment or optimization was established.
`COMPLETED` records the reviewed disposition, not achievement of the engineering goal.

Current behavior and commands belong to [swarm engineering](swarm.md). The
[game recipe and remaining browser prerequisites](../../packages/engine/examples/touch-of-death/docs/swarm.md)
own the measurement scope.

## Identity and evidence

- Run: `2d76b7fa-b2bb-4834-af2e-1941dc976162`.
- Source snapshot: `c599e0f7ca99cd71a1a3cbc83b1a3e057ee7b617`.
- Demonstration: `a2952022-d5a4-4334-b4dc-213dd402bb61`.
- Execution: 03:34:01.130–03:47:48.996 UTC, **13 minutes 47.866 seconds**.
- First retained finding: 4 minutes 5.231 seconds after start.
- Baseline artifact: `54f3504c-542c-4c92-a39b-23c96785739b`, SHA-256
  `39d6eff8ae3acac2c41a9d0df8ba0dba405e5ba5f3f8f082bdabed91f7de204e`.
- Independent review: `2ed3a44d-070b-4575-8bf0-cbfbcd83cc60`, SHA-256
  `2ac994cef11d5923cf6a4c79e2f79a59f632c4fd9d279f3847b5ec0b9950f611`.

All 25 artifacts, totaling 586,487 bytes, were downloaded from the authenticated
Harness proxy and independently checked against their SHA-256 hashes and byte
lengths before teardown. Local receipts, raw artifacts and the final run snapshot
are under `.local/swarm/deployments/<demonstration>/tournament-evidence/`, including
`baseline-independent-analysis.json` and `final-evidence-manifest.json`. Durable
content remains in the private bucket; sandbox files are not the evidence owner.

## Current baseline

The source-owned `touch-of-death-cpu-preparation-v1` workload used a seeded compact
city with 3,202 entities and 126–130 compiled commands. It warmed 120 frames,
restored the initial state, then measured 240 frames in 10.648 seconds. The runtime
was Bun 1.4.3 on Linux x64; reported CPU was AMD EPYC 9655P 96-Core Processor.
That name identifies the host CPU, not the sandbox's core allocation or dedicated
physical hardware. The sandbox requested two CPUs and 2 GB memory.

| CPU stage | Median ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Simulation | 7.242 | 22.191 | 60.394 |
| Frame sampling | 2.316 | 10.835 | 46.873 |
| Producer presentation | 11.987 | 53.522 | 136.773 |
| Entity application | 3.535 | 11.879 | 44.013 |
| Command preparation | 0.147 | 0.376 | 0.984 |
| Total CPU | 29.296 | 112.626 | 290.604 |

These are one diagnostic trial's distributions. Component medians do not sum to
the total median. Large tails cannot independently identify host interference,
GC or changing frame work. No paired comparison qualified environmental noise.
The historical rooftop/browser observations use a different scenario and hardware;
these numbers establish neither a regression nor an improvement against them.

RSS ended at 200,806,400 bytes and heap usage at 42,470,046 bytes. Allocation totals
and GC counts/durations were unavailable. Heap boundary changes are not allocation
rates. Browser main-thread work, GPU rendering, physical display freshness,
interpolation and exact-image repeatability were not measured.

## Correctness and hypotheses

The baseline passed **237 tests, zero failures, 83,835 assertions**: 19 game,
replay and workload tests plus 218 engine runtime, presentation and frame tests.
Artifacts `9e64fb0e-c082-4f92-8954-b57e362fc41d` and
`bdb2bbe5-455f-4b3a-9a22-de3b3cb061d2` retain the exact command output.
This is CPU/gameplay correctness evidence, not the missing browser/image gates.

| Investigation | Recorded result | Diagnosis artifact |
| --- | --- | --- |
| A: writer-driven dirty propagation | Presentation/application timings did not attribute avoidable visits. Source inspection found resource validation still necessary for unchanged material inputs; input leases alone cannot justify skipping lifecycle checks. No patch. | `b5b4d0f7-060c-4ff3-a081-baa720304b75` |
| B: endpoint-aware publication | No trace connected endpoint readiness, publication, displayed poses, interpolation and input timing. CPU throughput cannot establish freshness gains. No patch. | `43b5133d-736e-4546-9086-eb021d089b38` |
| C: temporary-object reuse | Sampling/application costs suggested measurement targets, but allocation stacks, rates, GC and retained-memory attribution were missing. No patch. | `de1b5e7b-472a-44b8-abd1-aa0697361785` |

These mechanisms were **unsupported, not disproven**. Each implementation workspace
was distinct. The planner classified the work as complex, so auto mode selected
GPT-6 Astra x-high for implementation as well as planning and review. The verified
value profile, GPT-6.1 Sol high, was not selected for this run.

Candidate `correctness: failed` means the candidate supplied no patch for independent
validation; it does **not** mean a game test failed. The benchmark task completed
its eligibility check and explicitly recorded that no measurement workspace was
provisioned. Thus benchmark duration was zero: no paired trials, comparison winner,
candidate noise verdict or integrated change exists. The reviewer retained the
unmet completion criterion and all promotion blockers.

## Product verification and costs

The same actual run was inspected in Harness and Editor, including an actual
artifact. The native review finished without integration; the existing project
memory contains the run summary and artifact hashes. The successful UI receipt
and screenshots are under
`.local/swarm/live-ui/<demonstration>/e00dfb38-cf91-49c2-8874-c8313b4092aa/`.
It records no page/capture errors and zero local repository-execution commands.
Earlier UI verification attempts failed and were repaired; the successful receipt
is the evidence for the final observed interaction.

Those native clients used local Harness and Editor hosts. The later public page
and scoped session controls passed local browser fixtures, including steering,
artifact inspection, follow-up cancellation and revocation. Their receipts under
`.local/swarm/{public-ui,native-link-ui}/results.json` explicitly report simulated
workloads and `cloudVerified: false`. Public hosting was prepared after this
deployment ended and was not verified on Railway.

| Metric | Observed value |
| --- | ---: |
| Peak concurrent tasks | 3 |
| Model calls | 25 |
| Reported input/output tokens | 383,644 / 29,068 |
| Initial dependency preparation | 113.697 seconds |
| Aggregate sandbox/fork creation | 195.428 seconds |
| Prepared-fork cache hits / requests | 6 / 6 |
| Human interventions | 3: two steering messages and final rejection |
| Failed task attempts / recorded orphans | 0 / 0 |
| Compute reservation estimate | $0.439815 |
| Separate inference estimate | $0 |
| Provider-reported compute/inference charges | Unavailable |
| Observed shared weekly quota increase | 22% → 24%; 2 of 20 allocated percentage points |

The compute figure is conservative coordinator reservation accounting, not a
provider invoice; it includes tasks that subsequently skipped work. Subscription
tokens are reported, while the $0 separate inference figure is an estimate under
the authenticated subscription route. Concurrent account activity can contribute
to the weekly increase. Deployment setup/probes and service/storage costs are not
included in these per-run metrics. No serial/local performance baseline was run,
so no swarm productivity speedup is claimed.

## Observed repair priorities and limits

All three workers repeated dependency installation and the unchanged baseline
suites. Later candidate prose incorrectly claimed those checks were not repeated;
the command receipts are authoritative. In particular, artifacts
`f72b3823-2a43-4589-bb9d-b296c9def097`,
`cc1567fe-1a19-4263-9976-4fc4bb8e19fd` and
`44a7eb94-c5a1-4627-b1ba-bef70ba4359a` each retain 19 plus 218 passing tests.
The model bridge lacked bounded retrieval of older command receipts and its initial
handoff did not clearly identify already-verified preparation. The subsequent local
repair records structured command receipts, supplies authoritative preparation and
baseline-check facts in each handoff, and permits bounded reads of the worker's own
command logs and baseline evidence. Other candidates' logs and patches remain
inaccessible through this action. The coordinator also now skips validation forks
when no patch exists; this run created three such forks before skipping their checks.

These repairs passed 22 focused tests with 152 assertions, Harness TypeScript and
scoped style checks. They were not redeployed or exercised in another cloud run.
The original run's repeated work and missing candidate evidence remain part of
this result.

The next performance run needs bounded attribution for writer/visit counts and
allocation/GC, plus the portable browser inputs and Linux browser adapter described
by the game owner. It must then produce viable isolated patches and actually
exercise serialized paired comparisons. The current run proves remote coordination,
baseline execution, isolated investigation, evidence retention, review and rejection;
it does not complete the required competing-implementation acceptance demonstration.

## Deployment cleanup and billing

Independent Railway inventory at 03:56:47 UTC confirmed all 11 sandbox records
DESTROYED, including provider-probe and template-builder records, with no further
inventory page. Both named temporary services were absent before the approved
04:00:41 UTC deadline. The two current volumes were detached and queued for
Railway's recoverable deletion period, approximately October 18; physical erasure
is not claimed. The existing `pad-pilot` service remained outside cleanup ownership.

The initial coordinator export succeeded, but the worker's separate private-network
export check failed for an undiagnosed reason. Its safe failure path stopped
compute and retained volumes. The repaired local cleanup independently verified
the private bucket manifest, database, deployment receipt and Codex logout receipt,
then checked stopped deployments and sandbox inventory before deleting only the
recorded services and volumes. Corrupt/missing evidence or changed ownership blocks
this recovery path. No replacement deployment was started.

The retained database is 233,472 bytes, SHA-256
`ed52b5f190aa9b03fd59b0a81fdf146a13e16898b3d9aa51b1fae8ff1360b94e`.
The bucket held 37 objects totaling 137,954,449 bytes, about $0.0021 per month at
the documented $0.015/GB-month rate. It remains private and was not deleted.
Receipts are `independent-cleanup-final.json`, `independent-bucket-proof.json` and
`verified-export-fallback.json` in the demonstration's local evidence directory.

The deployment admission ledger reserved **$3.708333**, including its $1
service/egress reserve, against the $10 estimated ceiling. This is distinct from
the per-run $0.439815 reservation above and is not an invoice. At 03:55:40 UTC,
Railway reported $0.02670 for the project and $3.52409 across the workspace, leaving
approximately $16.47591 of the Pro plan's $20 included usage. Reporting lag and
other services prevent treating these as final attributable tournament charges.
No workspace-wide limit was changed and no separately billed model API was used.

The owned remote Codex file store was logged out and its auth file removed, with
a hash-verified receipt in the bucket. Server-side credential revocation and
provider backup erasure were not proven. The temporary SSH key was revoked and
both local key copies removed at 03:56:06 UTC. Revocation of the named temporary
workspace API token requires the account owner; its workspace scope cannot list
or identify itself. That final manual step was requested after all provider work.
