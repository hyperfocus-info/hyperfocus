# October 7: worker recovery and resident-memory WASM

**October 8 correction:** the saved renderer receipts show RTX 4070 in trials
1-8 and Intel UHD in trials 9-16. The original summary incorrectly described
both cohorts as RTX. The within-cohort numbers below remain historical evidence;
they must not be pooled as one GPU environment. The user subsequently reported
low-power operation, but that run did not record power state. The GPU switch is
verified; neither its cause nor the renderer hang's cause is established.
See [the current audit](../../touch-of-death-performance-audit.md) for the powered retest.

**Graphics recovery is fixed in the opt-in host; worker and WASM defaults remain
off.** Context loss now suspends the authoritative worker, clears input/audio and
recreates GPU queries after the engine restores its resources. Match state,
pause state and inactivity survive recovery. Failed restoration or a 15-second
deadline leaves an explicit stopped state. The [host contract](../../../../../../../apps/engine-editor/src/standalone/README.md)
owns this behavior. FPS remains visible and reports zero while submissions stop.

Evidence: .local/engine-perf/worker-wasm-20261007/. The immutable control-v3 graph
inherits selected-v3's accepted fighter-record selection and isolates the host
repair. Three WASM/layout variants change only the obstruction ray inner loop
and target storage. Source patches, module/worker hashes, captures, raw samples
and cleanup receipts are retained. [Reproduction](../../../../../../../spikes/persistent-world-worker/README.md)
and the [WASM experiment](../../../../../../../spikes/persistent-world-worker/wasm-cutaways/README.md)
own commands and boundary details; no engine public API or shipped math changes.

### Shared storage and numeric throughput

JavaScript can write directly into WASM linear memory. The resident variants do
that: persistent Float64 views hold fighter/pickup targets, and one WASM call
handles all target rays for a box that survives the existing engine broadphase.
The scalar kernel uses f64 with the same arithmetic order, a 522-byte binary and
fixed 64 KiB memory per realm. The main realm and worker each retain that memory
plus 512 target views. This is shared JS/WASM storage, not a new cross-worker
SharedArrayBuffer pool. Existing render packets already transfer their bytes
without a structured-clone copy.

A separate synthetic Chrome CPU test uses 128 targets and 32 boxes, 300 warmup
batches and four counterbalanced trials per path. Candidate times include
population/packing; control reuses its already generated native target arrays.
This is numeric throughput, not game FPS:

| Path | Median batches/second | Relative to JS |
| --- | ---: | ---: |
| Existing JavaScript | 23,786 | 1.00x |
| Resident memory, JavaScript math | 20,001 | 0.84x |
| One packing pass, batched WASM | 30,295 | 1.27x |
| Direct resident writes, batched WASM | 28,245 | 1.19x |

Avoiding a copy alone does not establish a win: producing the numeric views and
querying them also costs time. The resident JS control instantiates the same
memory-owning module but does not call its math, separating layout from execution.

### Full combat A/B and the interrupted browser

Sixteen accepted serial trials, four per variant, use forward/reverse order and
then reverse/forward order. Each has six seconds warmup and eighteen seconds
measurement, full services, two render buffers, fresh-input scheduling, VSync
off and the same saved city fight with an idle human and local AI. Environment:
Windows, i9-13900HX (32 logical CPUs), RTX 4070 Laptop in the first half and Intel UHD in the second, through ANGLE/D3D11,
Chrome 154.0.8037.58, 1366 x 768 DPR 1. All are **headless**. No audit builds,
tests or profiling ran during accepted timing; other user work, clocks and
thermal state were not controlled. Startup is reported separately in raw results.

Trial nine first stopped answering page JavaScript and debugger requests while
the browser control connection still answered. Its GPU process accumulated CPU
time, but this does not establish a driver or WASM cause. Diagnostics are retained
in hung-cdp.json, hung-debugger.json and hung-processes.json. Only the owned browser
tree was terminated. That failed attempt is retained separately, and the remaining
eight planned trials resumed with a receipt. The runner now has external deadlines,
bounded failure capture/cleanup and explicit measurement-overrun rejection.

**The two halves have materially different performance.** All variants slowed
after the interruption; an overall median would conceal that change. Below are
medians of two trials per path within each half, using fighting samples only.
Input age is software poll-to-packet acquisition, not input-to-photon latency.

| Half | Path | Fresh FPS | Interval p95 | Interval p99 | Input age p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| Before interruption | JavaScript | 44.00 | 39.90 ms | 47.15 ms | 43.25 ms |
| Before interruption | Resident JS | 43.81 | 39.65 ms | 48.20 ms | 43.75 ms |
| Before interruption | Packed WASM | 42.69 | 40.80 ms | 48.85 ms | 44.95 ms |
| Before interruption | Resident WASM | 45.63 | 38.55 ms | 47.20 ms | 43.85 ms |
| After interruption | JavaScript | 24.28 | 66.00 ms | 82.65 ms | 106.75 ms |
| After interruption | Resident JS | 23.75 | 61.45 ms | 93.70 ms | 106.60 ms |
| After interruption | Packed WASM | 25.55 | 58.80 ms | 76.40 ms | 106.80 ms |
| After interruption | Resident WASM | 24.90 | 56.45 ms | 86.60 ms | 105.80 ms |

Resident WASM gains about **3.7% and 2.6% FPS**, respectively. These small samples,
changed conditions, mixed tails and the unresolved renderer hang do not support
promotion. Its pooled median appears 5.2% higher; that is not accepted as the
roughly 5% default-enablement gate. Packed WASM also changes direction between
halves. Accepted trials have no runtime errors or dropped fighting simulation
time; packet storage remains 1,460,224 bytes, plus the candidate's linear memory.
Worker-owner startup medians range from 557 to 632 ms overall, with too much
variation to attribute differences to this tiny module. Uncollected heap readings
are not a memory-saving claim.

For the JavaScript control, median main work changes from **9.0 to 31.4 ms**,
worker compute from **17.1 to 22.3 ms**, and completed-frame acquisition delay from
**6.15 to 20.25 ms**. This directs the next investigation toward rendering and
handoff scheduling, rather than assuming more numeric boundaries solve the gap.
The campaign does not establish foreground performance or stable 165 FPS.

### Correctness and remaining gates

48,000 differential numeric comparisons pass. Ordinary and 721-frame knockout
trajectories match full state, numeric packets and compact presentation exactly,
including the independent normal-simulation oracle. Thirteen focused authority,
save, session, launcher and packet tests pass (66 assertions). App/spike typecheck,
changed-source lint, source-structure and process-policy checks pass.

Real browser recovery checks pass repeated active/paused loss, restore commands
during loss, stale focus events, restoration while inactive, GPU-query recreation,
FPS waiting, the failure deadline and late restoration after failure. The broader
headless readiness journey passes saves/exchanges, pause, virtual-window inactivity,
mode guards, motion settings, startup fallback and hung-worker request/stream checks.

**MSAA explains the observed image-parity sensitivity in this diagnostic.** Default
captures can differ before postprocessing; disabling dithering does not resolve it.
With MSAA disabled only in the capture harness, all seven knockout checkpoints
match pixel-for-pixel, including the WASM candidate. With production MSAA enabled,
frames 240 and 480 still reach 4/255 versus the existing 3/255 limit. Rendering
quality and that gate remain unchanged; the default-renderer gate stays open.

Next experiments:

- Attribute the renderer slowdown and unresponsive headless page. Separate worker
  message arrival from main acquisition; test a frame-ready wakeup against polling,
  and compare GPU/MSAA behavior with the same visual settings and environment.
- Reduce engine scene application (previous diagnostic mean 3.40 ms) and complete
  presentation snapshots (1.33 ms) through retained records/dirty updates. Keep
  independent complete snapshots for save, review and rollback.
- Revisit larger numeric batches only after measuring their complete conversion,
  scheduling and render costs. The previous world presentation/cutaway and
  navigation-tail findings remain in [the preceding campaign](october-7-bounded-fighter-presentation.md).

Worker default promotion still needs the guarded modes' ownership, default-renderer
image acceptance, physical controller coverage and a longer stable soak. The
unexplained headless renderer hang is additional open stability evidence.
