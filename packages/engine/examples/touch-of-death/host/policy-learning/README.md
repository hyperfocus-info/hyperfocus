# Shared combat policy learning

The relay owns the canonical offset policy for one fixed content identity. Explicit
legacy policy experiments produce nominations; default browser training updates
the local general contextual model without this approval path. Local offset approval and uploaded win claims cannot
promote the global policy. The host independently simulates the candidate against
the frozen current champion, previous champion and original baseline through
`createTrustedPolicyEvaluator`. Private local branches may nominate policies even
when their local comparison differs from the current champion. Their claimed
canonical base revision must still be current when uploaded and promoted.

The shared simulator uses ordinary contextual adaptation during each independent
set. Original/baseline in this offset protocol means the current default without
host offsets, rather than the frozen pre-adaptation brain. Fresh trials do not
carry opponent-specific contextual models between evaluation sets. Browser search
sets can inherit their separate local contextual lesson bank; its observations
never warm these held-out or trusted evaluation inputs and are not shared policy
approval. The database persists offset artifacts and exact trial evidence.
`combat-v33` separates cumulative contextual learning, stable personality scoring
and explicit training exploration from older promotion evidence. Artifact version one and the
search algorithm remain unchanged.

Development relays use local SQLite. The package builder opens that database
read-only and carries its committed champion in `policy-candidate.json`, scoped
to the exact packaged combat content. Railway keeps its existing PostgreSQL
credentials in runtime environment variables. No database, account rows or secrets
are packaged. See [packaging](../package/README.md) for `--policy-db` and the default
development path.

On deployment, `deployment.ts` validates the bounded artifact and atomically
records a one-time nomination against the current production revision. Dev and
production revision numbers are independent. The host evaluates that nomination
using the ordinary trusted gate; production stays unchanged until it passes.
A durable release receipt survives ordinary candidate pruning, restart and
rollback, preventing an old package from repeatedly nominating itself. Staging
failures retry once per minute without blocking other queued training. Empty
artifacts have no policy effect. Malformed or wrong-content artifacts fail startup
before storage is opened. Up to 4096 release receipts per content identity are
retained; reaching that bound defers new nominations for operator review.

`createPolicyLearningService({ contentId, store, evaluate })` uses the relay's
existing `DurableServiceStore`: PostgreSQL for hosted deployments, SQLite for
local hosting. Canonical weights, previous weights, exact compact source records,
candidate receipts, evaluation leases and lifetime attempt counters share the
same atomic database boundary. Browser IndexedDB is not the shared authority.
The PostgreSQL bridge currently loads the entire bounded durable collection for
each transaction (default 100,000 records / 64 MiB), under one advisory lock.
Thirty-minute public reads avoid repeated model reads, but nomination batches,
claims and 40-second active leases still use that bridge. This can become a
database-load bottleneck as shared social and policy history grows; scaling it
requires measured keyed-query work, not simply raising the storage bounds.

`submit({ submitter, candidates })` accepts 1–8 bounded compact records in one
transaction. The HTTP adapter supplies the authenticated submitter; it must not
forward a client-selected player identity. Each player may submit one new batch
per minute. Retrying the same ID and body returns its receipt without another
evaluation or rate charge. Changed evidence or ownership under an existing ID is
rejected. Identical normalized weights within a canonical revision are rejected
as duplicates without consuming another server evaluation. Policy labels cannot
be reused for different retained weights. Stale-base nominations are acknowledged
as stale. A full queue, malformed batch or failed database transaction accepts
none of that batch, so clients retain it for retry.
Accepted compact records are re-encoded from validated evidence, dropping
irrelevant checksummed fields and local mirror metadata without quantizing
weights. HTTP responses retain both current and previous records for rollback;
the browser's bounded response reader must allow 1 MiB, since valid escaped move
identifiers can exceed 256 KiB when both records are included.

The queue holds at most 64 pending evaluations. A canonical revision admits at
most 4096 receipts; reaching the limit fails closed. One previous revision's
receipts remain for retries, and older revisions cannot be evaluated again.
Expired player rate records are removed during admission. The latest 64 trusted
evaluation reports are retained; this is bounded operational history, not a
permanent research archive. Export evidence before longer retention is needed.

`processNext()` claims one nomination atomically. A claim allocates its lifetime
attempt ordinal before any held-out seed is drawn. Attempts persist across
restarts, reclaims and rollbacks. The trusted evaluator spends its statistical
error budget using that ordinal, so restarting cannot reset the repeated-search
budget. Its fresh cryptographic seeds exclude the nomination's reported local
seeds, and every seed is tested from both seats. Reports preserve exact outcomes,
policy identities, seeds and bounded recent combo sequences with coverage limits.

The champion comparison uses 128 fresh seeds, each played from both seats. Its
one-sided Hoeffding lower bound must exceed a 0.52 win/draw score. Attempt `n`
uses `alpha = 0.01 / (n * (n + 1))`; these allowances sum to at most 1% per durable
content-specific attempt sequence under the fresh uniform seed-pair assumptions.
This is a conservative gate against repeated lucky selection, not a guarantee of
general fighting strength. Previous-champion and original-baseline controls use
separate seeds and require no aggregate regression; they are not statistical
non-inferiority tests. A passing evaluation can require 1280 full sets. The host
runs one candidate at a time and yields between simulation slices, but CPU cost
and live-room latency still need measurement at production load. Small real
improvements may fail this gate; rejection does not prove a candidate is worse.

The trusted runner retains its snapshot loop by default. `snapshotLoop: false`
selects `advance()` plus detached match metadata for measured comparisons. Both
paths preserve seeded outcomes and bounded reports. The full-city serial A/B/B/A
check in `.local/engine-perf/tod-trusted-loop/report-1200.json` measured an aggregate
3.3% throughput gain with opposite signs across repeats; this did not justify
changing the default. Those capped samples measure ticks per second, not completed
games per minute or fighting strength. Rebuild the engine runtime artifact before
testing host changes: its package import resolves `dist/project-runtime-3d.js`.

The objective is completed match outcome only. Interaction counts, button presses
and reported combo drops create no reward or penalty. Interrupted combos remain
diagnostic evidence, including censoring and sample coverage, rather than automatic
punishment. There is no separate learned avoidability classifier or combo reward.

Evaluation runs outside database transactions. The default lease lasts two
minutes and renews every 40 seconds while work is active. Expired claims can be
recovered using a new ordinal and token. Publication requires the exact live
token, unchanged champion revision and a passing trusted result. A late worker
cannot publish after another worker promotes or reclaims its nomination. One
service runs one evaluation at a time; database claims coordinate multiple
service instances. `dispose()` aborts work and clears the heartbeat; hosts await
it before closing storage. The caller owns wake-up scheduling; the service has
no idle polling loop.

Passing promotion atomically writes the new champion, preserves the previous
champion and exact compact record, advances the revision and retires stale
nominations. Weights are never averaged across clients. Host-only
`rollback({ expectedRevision })` swaps current and previous policies and advances
the revision again. There is no public rollback endpoint. Failed, partial,
aborted, capped, rejected or stale evaluations cannot modify the champion.
If the final promotion transaction fails, the candidate remains leased rather
than being relabeled as rejected. After lease expiry, the worker reruns trusted
evaluation under a new durable attempt ordinal and can promote once storage
recovers. A transient failed write therefore cannot permanently blacklist those
weights through deduplication.

Public reads use a 30-minute single-flight cache. A local promotion or rollback
updates that cache immediately. A different host's commit may remain unseen by a
reader until its cache expires; mutation transactions always read the database
directly. Failed refreshes retain the last verified snapshot marked stale, with
a 30-second retry backoff; explicit retry can bypass it. Initial load failures
surface an error instead of inventing a new canonical baseline. Corrupt database
envelopes fail closed, and checksums detect accidental corruption. Checksums are
not authentication; database access, backups and host evaluator integrity remain
deployment responsibilities.
Cache and lease deadlines use wall-clock time; large backward clock adjustments
can delay expiry. Keep host time synchronized. The browser has the same wall-clock
cache limitation. The host checks the durable nomination queue on startup, after
accepted batches and once per minute for crash/lease recovery; those transactional
queue reads and lease renewals intentionally bypass the canonical-policy cache.

Run `HARNESS_TEST_SKIP_UI_PRELOAD=1 bun test packages/engine/examples/touch-of-death/host/policy-learning`
(set the environment variable with PowerShell syntax on Windows) and the engine's
`src/server/services/combat-policy.test.ts`. Coordinator tests cover atomic
admission, many-client races, stale revisions, normalized-weight deduplication,
claim expiry, durable attempt spending, failed writes, cache behavior, corruption
and SQLite restart/rollback. Engine backup tests ensure host-owned envelopes
survive replacement without weakening existing social record schemas. These
tests establish coordination correctness; broader live-match strength still
requires evaluation evidence from the canonical game and varied opponents.
The live PostgreSQL adapter test requires `TOD_POSTGRES_TEST_URL_FILE`; it was
not run for this change because that configuration was unavailable. SQLite and
the shared transaction/backup contracts were exercised locally.
`deployment.test.ts` and `../package/policy.test.ts` cover read-only dev exports,
production revision selection, re-evaluation, restart/redeploy deduplication and
atomic recovery after failed nomination writes. Packaging never activates weights.
