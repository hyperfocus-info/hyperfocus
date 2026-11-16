# Touch of Death performance lab — October 10, 2026

The later [bounded fresh-motion follow-up](touch-of-death-performance-lab-follow-up.md)
audits these receipts and measures the three named targets using this same artifact.

This is the original 51-option report. The later [source-owned primitives
comparison](touch-of-death-standard-primitives.md) covers 74 options; the current
[unchanged-transform sampling audit](touch-of-death-entity-sampling-audit.md)
identifies the 75-option artifact, measured result and remaining acceptance gaps.

The [working lab](http://127.0.0.1:8807/lab/?arena=rooftop) contains **51 controls in
one artifact**. Use `arena=depot` for the other smoke-tested scene. The
[registry](../../../../../spikes/persistent-world-worker/lab/registry.ts) drives
the panel, URL, JSON configuration and automation. The normal playable is unchanged.
This instrumented baseline uses original material comparisons/rendering and
full-object display publication; it is not ordinary-playable acceptance timing.

Reproduce from the repository root:

```powershell
bun.cmd spikes/persistent-world-worker/lab/build.ts
bun.cmd .agents/skills/dev-server/scripts/dev.ts start touch-of-death-lab --json
bun.cmd spikes/persistent-world-worker/lab/smoke.ts
bun.cmd spikes/persistent-world-worker/lab/proof.ts
bun.cmd spikes/persistent-world-worker/lab/screen.ts
```

Use the returned managed URL (`PERF_URL` if its port differs). The completed screen
refuses an accidental rerun; `screen.ts --output .local/engine-perf/touch-of-death-lab/screen-repro`
deliberately reproduces it using the same artifact. [Command/API details](../../../../../spikes/persistent-world-worker/lab/README.md)
include launch profiles and the archived inputs needed to rebuild.

## Bounded screen

**Screening, not acceptance.** One headless Chrome 154.0.8037.58 on the RTX 4070
Laptop, 1366×768 / scale 1, inherited browser limits, fixed camera and rooftop
checkpoint (motion seed 5). Every trial resets that checkpoint, warms for 3 s,
then measures 5 s. Twenty-one serial coarse trials interleave eleven baselines;
one ABBA adds four trials. No throughput captures, traces, synchronous readbacks
or forced GPU completion. No six-arena timing sweep or subsequent optimization
campaign was run.

The table ranks apparent coarse submission-rate change against the mean of its
two adjacent controls. Variation is their relative spread. An effect no larger
than that spread is **inconclusive**; it receives no further investigation.
Simulation removals intentionally change gameplay and later presentation work.

| Switch | Actual work removed | Submission interval p50, control → switch | Rate change / control spread | Correctness and decision |
| --- | --- | --- | --- | --- |
| Presentation frozen | Main endpoint copying/application; 3,391 entity visits and 1,702 material checks/submission → 0 | 62.35 → 11.20 ms | +444.4% / 2.5% | Frozen visuals; zero changed poses. Repeat below. |
| Non-fighter updates off | Background actor updates → 0; geometry remains | 71.60 → 64.00 ms | +8.5% / 20.4% | Gameplay ablation; inconclusive, stop. |
| Fighter updates off | Fighter and AI updates → 0; geometry remains | 73.70 → 67.80 ms | +4.6% / 13.4% | Gameplay ablation; inconclusive, stop. |
| Shadows off | About 1,007 shadow draws/submission → 0 | 63.45 → 61.70 ms | +3.0% / 1.3% | Image changes. Small single-screen signal; outside top three, no repeat. |
| Main + KO physics off | Rigid-world steps → 0 | 66.05 → 65.30 ms | +2.2% / 6.8% | Gameplay ablation; inconclusive, stop. KO was inactive in this timed checkpoint. |
| Post off | Canvas2D post calls → 0 | 62.65 → 64.80 ms | −3.5% / 2.8% | Image changes; no observed gain. |
| Environment updates off | Environment/traffic/hazard updates → 0 | 65.50 → 68.80 ms | −6.1% / 8.0% | Gameplay ablation; inconclusive, stop. |
| AI off | AI decisions → 0 | 63.65 → 68.70 ms | −9.4% / 1.5% | Changes the fight; no observed gain. |
| Clear-only | Scene draws, triangles and uploads → 0; post/HUD still run | 52.00 → 58.60 ms | −16.6% / 42.7% | Image removal; opening control drift makes this inconclusive. |
| Inline versus worker | Worker transport/handshake removed; packet pool 2 → 1; full-object display copies remain | 65.90 → 78.70 ms | −18.1% / 2.9% | No observed gain; this comparison includes necessary ownership changes. |

The top-three rule selected presentation freeze, non-fighter updates and fighter
updates. The latter two were already drift-explained and stopped. Presentation's
ABBA controls measured **13.31 / 15.32 submissions/s**, versus **82.86 / 81.26**
frozen. Candidate spread was 1.96%; control spread was 14.05%. The large removal
effect survives that variation, but its precise size is not an acceptance result.
Frozen p50/p95/p99 intervals were **11.90/19.50/22.30** and
**12.00/19.10/21.20 ms**, versus controls **72.60/92.90/103.50** and
**65.00/81.10/82.50 ms**. Missed-6.06-ms rates remained **98.55–99.01%** frozen
and **100%** in those controls.

## Accounting and limits

All 25 trials retain raw samples: **2,966 submissions, 7,583 fixed steps, no
dropped simulation time; 2,966 valid asynchronous GPU queries, zero invalid or
disjoint results**. ABBA controls had 61/70 changed pose signatures and 6/7
repeats; frozen trials had 0 changes and 415/406 repeats while each advanced 302
fixed steps. Clear-only signatures describe prepared state, not visible poses.
Neither callbacks nor submissions are physical presents.

In the ABBA controls, producer compute p50 was 22.0–25.1 ms, main publication
45.4–50.1 ms, preparation 3.8–4.4 ms and WebGL submission 3.5–3.7 ms. Worker
input-wait p50 was 42.6–48.6 ms and buffer-wait 23.2–25.4 ms. Async renderer GPU
p50/p95/p99 was 9.33–10.08 / 15.89–16.07 / 17.33–19.11 ms. These intervals
overlap and **must not be summed**. GPU timing excludes post/HUD/compositing.
Pose-age p50 was 116.8–131.7 ms; the applied-input age proxy was 117.1–132.1 ms.
Frozen pose age reached a 5.5 s median and had no applicable input-age sample.

Comparison storage reports 3,404 backing buffers / 224,664 logical bytes;
contiguous storage reports two buffers in the untimed lane. Worker packets retain
1,447,048 bytes across two buffers. Copy-byte counters cover numeric packet/compact
buffers, not opaque full-object clone bytes. Heap boundary samples, clone counts
and storage evidence are saved; allocation rate, retained memory, CPU-cache/RAM
traffic and observer overhead were not measured.

AC power, battery saver off, the High performance plan, browser and GPU device
remained unchanged. GPU boundary clocks were 330/360 MHz; clocks and thermals were
not controlled continuously. All page focus/visibility receipts passed; this was
headless, not native foreground or monitor evidence. Callback medians ranged
11.2–79.9 ms. Actual command lines are saved; only the inherited launch profile
was measured. The bounded wake owner reported no suspected sleep and released
its request. Owned browser windows/processes were absent after identity-checked
cleanup. Three startup 404s are optional online-host/AI discovery endpoints;
there were no game/worker runtime errors or managed-server errors.

## Three targets supported by this screen

1. **Main endpoint copying/publication:** the 45–50 ms publication median dominates
   this baseline. The existing compact/owned publication controls are the relevant
   later comparison; this screen does not establish their gain.
2. **Display application:** 3,391 entity visits and 1,702 material checks per normal
   submission disappear under freeze. Existing revisions/reuse are the available
   candidates; untimed revisions retained resource checks while skipping deep work.
3. **Shadow submission/GPU work:** shadows-off removes about 1,007 draws and lowers
   local GPU p50 from 10.11 to 6.42 ms, with only a 3% coarse cadence signal.
   Existing shadow batching/material tables are candidates for later evaluation.

These are follow-up targets, not promoted optimizations. No further experiments
were launched.

## Delivered evidence and explicit gaps

Both arenas passed **67 seeded reversals and 67 live transitions each**, plus
panel stage/apply/reset, import/export, invalid-transaction and restart-scope checks.
Six renderer/AA configurations each reproduced their own PNG across two resets
in both arenas: **12 exact pairs**. This short lane does not overturn historical
MSAA failures. The verification receipt reports thirteen focused tests (302
assertions); the saved raw log proves twelve (294 assertions), with the updated
raw log absent. Scoped typechecking and process policy passed. Exact-graph tests cover all nine material storage/identity
combinations and an active-corpse KO toggle, including independent gravity.

Evidence root: `.local/engine-perf/touch-of-death-lab/`. It contains
`configuration.json`, `option-inventory.json`, `historical-inventory.json`,
`smoke/work-proof.json`, images, `screen/plan.json`, all 25 raw trial JSON files,
`screen/summary.json`, power/wake/cleanup receipts and frozen sources.
Artifact SHA-256: `47654f4721553967751f9c25f8312c3b4fe6290f359f2ce05e46464763f67170`.

**Not all historical experiments are integrated.** The inventory enumerates 67
report owners and 159 executable owners, with explicit exclusions. Removed owned
frame pools/interning and the rejected early-toon/depth shader pair are unported;
bound lookup/shared-validation improvements remain fixed without reversal controls.
Replay/FIFO, synthetic ceilings, service-removal, native/Wasm fixtures and detailed
observers remain external owners. Spatial AA uses the existing canvas context
with a single-sample scene target, rather than reproducing the historical no-AA
default context. Combat-off gates strike resolution, with movement/interactions
separate. Browser flag profiles are supplied but their alternatives were not
measured. These limits are also exposed in the panel and owning lab README.
