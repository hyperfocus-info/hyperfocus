# October 9: browser cadence and repeated controls

**165 Hz fresh-motion gameplay remains unproven.** The current visible browser
pacing fails the target even without gameplay. Its cause must be separated from
the engine's substantial preparation and rendering costs. No optimization was
promoted. This follows the [first provenance cohort](october-9-frame-provenance.md).

## Browser pacing

Raw evidence: `.local/engine-perf/provenance-20261009-v2/`, especially
`native-cadence-control.json`, `native-cadence-trace-webgl2.json`, its complete
`.trace.json`, `native-cadence-trace-summary.json` and
`native-cadence-gpu-vsync-off.json`.

Visible focused Chrome 154.0.8037.58 used the RTX 4070 Laptop through ANGLE D3D11.
Windows reported 165 Hz for the foreground monitor. Native gameplay backing was
1920 by 998 at DPR 1.5. Earlier 165 Hz observations used another desktop/backing
configuration; these sessions cannot establish a speedup or an absolute ceiling.

| Hypothesis / controlled variable | Expected signature | Result / uncertainty | Decision |
| --- | --- | --- | --- |
| Game work explains slow callbacks; remove it | Minimal scene returns to 165 Hz | Idle, WebGL clear, Canvas2D fill, idle again: 130.30–130.93 callbacks/s over 1,000 intervals each. rAF, monotonic and wall-clock observations agree. | Current pacing problem exists before game work. |
| Browser wait explains the 7.6 ms interval; trace minimal WebGL | Repeated wait spans without CPU work | All 500 sampled cycles contain `WaitForVSync Sleep`: p50 7.571 ms, p95 8.120 ms; thread CPU p50 0.016 ms. Begin-frame metadata advertises 6.059 ms. Draw/swap and browser feedback also occur near 130 Hz. | Sleep fallback is directly observed. Why hardware VBlank waiting fails is unresolved. |
| Disable GPU VSync in the owned browser | Fallback disappears or cadence changes | 130.80 callbacks/s; all 500 sleep events remain. Separate diagnostic session, not an acceptance configuration. | Reject as a workaround; default unchanged. |

Current upstream Chromium's [Windows VSync implementation](https://chromium.googlesource.com/chromium/src/+/lkgr/ui/gl/vsync_thread_win.cc)
falls back to an integer-millisecond sleep when hardware waiting fails or returns
too quickly. That is consistent with the trace, but the source is not the exact
Chrome build tag and does not prove which driver/output condition caused this run.
Neither callbacks nor browser feedback prove physical scanout or new game pixels.
The subsequent `display-adapter-probe.json` maps the active primary `DISPLAY5`
to the NVIDIA adapter, matching WebGL. A cross-adapter mismatch is therefore not
supported by that observation. Boundary probes now retain adapter/output mapping.
A later read-only boundary probe in the `incremental-20261009` evidence root
(`output-session-boundary-v2.json`) identifies an attached AUOC1A5 monitor on that
output and Windows session protocol 0. The
[Windows API](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ne-wtsapi32-wts_info_class)
defines 0 as the console session. The user subsequently confirmed direct viewing
on the physical monitor; remote viewing is no longer the working explanation.
`fresh-render-20261009/physical-viewing-confirmation.json` records that evidence.
Physical scanout is still uninstrumented and the VSync fallback remains unexplained.
Recorded browser feature status enables GPU compositing, rasterization and WebGL
on the RTX 4070. The audit uses an isolated Chrome profile; the user's ordinary
profile settings are separate. NVIDIA frame caps, VSync and G-SYNC policy remain
unrecorded; no driver or browser setting has been changed by this audit.

## Provenance validation and uncertainty

The v2 pose observer now has an independent allocating reference used only in
manual verification. Removing zero-valued morph weights no longer reports false
motion, and morph history is bounded by active instance capacity. Host submission
IDs and publication-sequence packet versions are explicit. Nine end-of-run clock
exchanges check consistency with the nine startup exchanges.

`depot-pose-oracle.json` and `roof-pose-oracle.json` retain 661 frames per owner per
arena: **2,644 independent pose checks and 2,644 complete simulation-state checks**.
Inline/worker state, packet and presentation sequences agree. The 11-event input
schedule exercises restore, pause, viewport and reduced-motion changes. Focused
fixtures additionally cover camera, teleport/epoch, membership, joints and morphs.
Normal-AA image gates pass: depot maximum channel delta 2 / at most 18 changed
pixels; rooftop delta 2 / at most 4. These observations preserve the existing
tolerance; they do not explain all AA variation or validate dynamic resource loads.

`depot-overhead-paired-plan.json` defines eight separately owned browsers in
off/on/on/off/on/off/off/on order, with identical v2 executable, replay, normal AA,
6 s warm-up and 8 s measurement after checkpoint restore. All receipts pass focus,
source, state and cleanup checks. All four combined startup/end clock bounds are
consistent, about 0.5 ms wide, with the explicit assumed timer-rounding allowance.

Control fighting rates span **95.56–108.76**, a **12.58% spread**. Medians are
104.958 off / 104.947 on; instrumentation-on spread is 2.28%. Four adjacent paired
effects average +2.08%, with exploratory t95 interval **[-6.43%, +10.59%]**.
`overhead-pairs.json` retains the calculation. Eight browser owners form one
two-block cohort, not independent thermal sessions. Result: **overhead magnitude
is inconclusive**, and these controls cannot support a small optimization claim.

GPU boundary temperatures were 57–59 C. Post-window clocks were sampled after
quiescence, so they do not describe in-window execution. CPU temperature, sustained
clocks, resource residency and other-process interference remain insufficiently
observed. The slow control has longer preparation/compile/main stages; that is
localization, not proof of thermal throttling, GC, JIT or memory-bandwidth limits.

## Reproduction and next acceptance

The [spike README](../../../../../../../spikes/persistent-world-worker/README.md)
owns switches. Use the first cohort's command with root
`.local/engine-perf/provenance-20261009-v2`, eight identical depot entries and
`PERF_PROVENANCE_MODES=0,1,1,0,1,0,0,1`. Plans retain the exact configuration and
private source graphs. Cadence traces use `cadence.ts` with
`PERF_NATIVE_VIEWPORT=1`, `PERF_CADENCE_MODES=webgl2`, `PERF_TRACE=1` and the retained
trace-category configuration. Do not pool trace and ordinary timing runs.

The warm-up-only control is complete: `depot-warmup-paired-plan.json` retains
6/30/30/6/30/6/6/30 seconds, with provenance throughout and the same checkpoint
restored before each 8-second window. Four trials per group have median fighting
rates 102.52 / 99.73 and spreads 11.00% / 11.67%. The paired effect is -2.91%,
exploratory t95 [-17.05%, +11.23%], saved in `warmup-pairs.json`. All eight trial
receipts pass. Longer warm-up **did not establish stable controls**; neither
thermal throttling nor JIT behavior has been demonstrated as the cause.

Unresolved acceptance includes visible-response latency, dynamic resource
invalidation, broader browser-frame association, long-soak export/memory trends,
and all six arenas/stress scenes. Preparation profiling can proceed diagnostically;
promotion remains gated by controls and production-AA parity.
The [first preparation attribution](october-9-preparation-attribution.md) records
frozen/changing replays and structural counts without promoting a cache.

Current verification: 28 focused tests / 184 assertions and focused TypeScript
checks pass. Source-structure and process policy pass. All 41 browser cleanup
receipts in this root are clean; the shared server reports no errors. The global
code-style gate still fails on existing dirty-tree assertion debt, including
pre-existing controller/worker assertions. New clock fields use explicit types;
no baseline was increased. `verification.json` retains receipts and source hashes.
