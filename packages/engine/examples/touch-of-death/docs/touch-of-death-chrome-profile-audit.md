# Chrome profile audit — October 13, 2026

The captured ordinary game is constrained by a busy main thread. This capture
does not establish a GPU device bottleneck or make extensions the primary cause.
It is a diagnostic profile, not a controlled performance comparison.

The subsequent [HUD layout audit](touch-of-death-hud-layout-audit.md) owns the
implemented controls, bounded comparison and current managed game URL. It found
work removal without a promotion-worthy throughput gain.

## Evidence and identity

Input: `C:/Users/MindOverMelee/Downloads/Trace-20261013T183503.json.gz`, SHA-256
`403737414c64c97d340a626a5e9a3073036448913c228d9f74e97a09c21af4c0`.
The saved DevTools window is 16,417.930 ms, with 260,133 trace events. Page:
`http://127.0.0.1:8798/game/`, renderer PID 74044, main thread 71760; host DPR 1.2.
This is the ordinary inline playable, not the worker lab. There is no dedicated
worker thread in this capture. Rendering switches do not remove simulation or
all presentation preparation. Exact effective switches and changed-pose/step
rates were not retained in the trace and cannot be reconstructed reliably.

The matching preserved artifact is
`.local/touch-of-death/performance-menu-2026-10-13/web/index.html`:
HTML hash `d565c3a41ca04243b0e00c94cf6502fabb6897d3cee327e8852924f8efe225f8`,
runtime hash `c73c1c4c787ef60bbc867eb27505f5917c75025270c907ca31ba8eb5f424f63a`.
Minified source coordinates below were checked against that artifact. Source
links point to the corresponding current implementation.

Saved outputs: [analysis](../../../../../.local/engine-perf/chrome-trace-20261013/analysis.json),
[browser verification](../../../../../.local/engine-perf/chrome-trace-20261013/verification.json),
[visible launcher verification](../../../../../.local/engine-perf/chrome-trace-20261013/visible-launch.json).
The imported trace analyzer is offline; no new throughput campaign was run.

## Measured findings

| Observation | Recorded result | Interpretation |
| --- | ---: | --- |
| Animation callbacks | 489; 29.78/s | Callback rate, not physical presents or fresh poses |
| Callback interval p50 / p95 / p99 | 32.780 / 39.365 / 44.616 ms | 100% exceed 6.06 ms |
| Callback execution p50 / p95 / p99 | 29.243 / 36.991 / 42.029 ms | Main-thread work is sufficient to explain roughly 30 FPS |
| Main-thread task wall union | 15,938.638 ms; 97.1% of window | Occupied task time can include native waiting; not an OS CPU counter |
| Style recalculation | 1,978 events; 1,173.252 ms | 7.15% of window; repeated HUD/layout interactions |
| Layout | 506 events; 93.285 ms | Distinct from style recalculation |
| GC wall union | 446.929 ms; 2.72% of window | Nested V8/CppGC spans unioned, not summed |
| Minor GC | 169 collections; 332.059 ms; p95 2.492 ms | Frequent collections perturb a 6.06-ms deadline |
| Major GC | 7 collections; 41.109 ms | Maximum 7.012 ms |
| Minor-GC reclaimed bytes | 4,544.68 MiB cumulatively | Allocation-pressure proxy, not exact allocations or retained memory |
| JS heap range | 41.5–249.0 MB; starts 131.0, ends 183.9 MB | Churn is proven; a leak is not |

Ranked CPU costs below use reconstructed embedded samples. Inclusive entries
overlap: do not add rows or combine these with GC/style totals. The profiler's
initial unsampled gap and final unknown interval are excluded. Recorded profiling
startup itself occupies about 214 ms, so these are not uninstrumented timings.

| Priority / area | Sampled cost over the window | Supported next investigation |
| --- | ---: | --- |
| Renderer execution/submission | `render`: 3,859.98 ms inclusive; `vertexAttribPointer`: 1,375.60 ms self | Attribute/instance and morph bindings remain expensive. Existing VAO offset caching already executes; this is not evidence that every pointer reset is redundant. Separate required range changes from repeated state setup. |
| Gameplay and presentation | `step`: 2,703.73 ms; `presentFrame`: 2,271.09 ms inclusive | Ordinary playable still does this work with geometry hidden. Obstruction presentation accounts for 1,206.48 ms within presentation; `applyFrame` is another 968.72-ms inclusive entry. |
| DOM/HUD | `set textContent`: 252.18 ms self; fighter bars: 649.54 ms inclusive | Repeated imperative writes and interleaved reads, not proof of React rerenders. Style cost is larger than text assignment alone. |
| Allocation churn | GC sample self: 409.92 ms; snapshot factory self: 386.92 ms | Snapshot and interaction-copy paths are visible suspects. This profile does not assign reclaimed bytes to allocation sites. |
| Shadow pass | 686.60 ms inclusive on CPU | Shadow work executes in the capture. No isolated GPU shadow duration is available. |

Concrete forced-style callers:

| Caller | Events / wall time | Source |
| --- | ---: | --- |
| Canvas dimensions after HUD updates | 491 / 492.092 ms | [standalone frame](../../../../../apps/engine-editor/src/standalone-3d.ts): `gameplayUi.render` precedes `canvas.clientWidth/clientHeight`; trace `game/:1625:59539` |
| Reticle position, including hidden reticle | 491 / 79.386 ms | [gameplay presentation](../../../../../apps/engine-editor/src/scene3d/gameplay-presentation.ts), original strategy; trace `game/:1300:15227` |
| Fighter-bar geometry reads | 490 / 49.637 ms | [fighter bars](../../../../../apps/engine-editor/src/scene3d/fight-hud/fighter-bars.ts); trace `game/:1315:95062` |

Another 534.220 ms of style recalculation has no JavaScript caller stack and
cannot be assigned to one writer from this trace. The normal playable uses the
original HUD-write and reticle strategies; existing lab alternatives are not
automatically active here. No optimization strategy was promoted in this audit.

## GPU and extensions

The trace contains WebGL draw/bind calls and 13,342 GPU-task events attributed to
the game's renderer. GPU-process task time is CPU/driver activity, not asynchronous
GPU execution time. The saved trace lacks an adapter identity and timer-query
measurements, so it cannot retrospectively prove which physical GPU ran it.

The separate current-browser check reports **NVIDIA GeForce RTX 4070 Laptop GPU,
ANGLE/D3D11**, with hardware WebGL and GPU compositing enabled. This rules out
SwiftShader for that verification run only; its screenshot FPS is not a benchmark.

Lightning Autofill, React DevTools and a third extension appear in the original
trace. Recorded Autofill `FunctionCall` spans total **16.604 ms**, versus
14,530.602 ms for game callbacks. Sampled extension leaf attribution is also small.
The screenshot's >100% inclusive number is not a sound exclusive CPU attribution.
Neither screenshot nor this trace establishes retained memory per extension.

Owned browsers now default to both `--disable-extensions` and
`--disable-component-extensions-with-background-pages`, through the shared
desktop-runtime host primitive. The first verification, with only the first flag,
still found two built-in extension targets; that
[failed receipt](../../../../../.local/engine-perf/chrome-trace-20261013/verification-components-found.json)
is retained. With both flags, current headless and visible checks observed zero
extension targets; the headless gameplay check also observed zero extension
scripts/contexts. This follows Chrome's documented distinction between
[ordinary and built-in background extensions](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#commonly-unwanted-browser-features).
Personal Chrome profiles, extensions and global GPU/OS settings are unchanged.
A web page cannot apply this launch policy to an existing personal browser.

## Delivered profiling configuration

The editor dev build already supported source maps; the standalone web/music
exporter omitted them. Its new `--debug` / `HYPERFOCUS_PLAYABLE_DEBUG=1` path emits
readable JavaScript, inline source maps and embedded TypeScript. Chrome verified
609 sources and 609 source contents in `hyperfocus-playable-3d.js`.

Managed game: **http://127.0.0.1:8798/game/**. Reload before recording. In DevTools,
enable Settings → Sources → JavaScript source maps. Chrome executes the generated
script while mapping it to authored sources ([Chrome documentation](https://developer.chrome.com/docs/devtools/javascript/source-maps/)).
The original capture cannot acquire a matching map from a different rebuilt runtime.

Current artifact: `.local/engine-perf/chrome-trace-20261013/debug-web`, HTML hash
`5f800552472f8a9280da9f2f91e80bbf46081d3c440c86011c4305299883104b`, runtime hash
`2fe68ae01796957e88856297603150a2a656108d91c32dc88877e5ea2b0fbb50`.
It is a different compilation configuration for attribution; no before/after
performance gain is claimed. Release web exports remain minified without maps.

From the repository root, open the same game in an isolated profiling browser
(15-minute lifetime; close the window sooner to finish):

```powershell
bun.cmd spikes/persistent-world-worker/owned-browser.ts http://127.0.0.1:8798/game/ 15
```

Recompute the imported-trace evidence:

```powershell
bun.cmd spikes/persistent-world-worker/trace-analysis.ts --trace C:/Users/MindOverMelee/Downloads/Trace-20261013T183503.json.gz --output .local/engine-perf/chrome-trace-20261013/analysis.json
```

Rebuild the debug artifact from `apps/engine-editor`:

```powershell
bun.cmd scripts/touch-of-death-music/export-web.ts ../../.local/touch-of-death/project ../../.local/engine-perf/chrome-trace-20261013/debug-web ../../.local/touch-of-death/music-playlists/classification.json --debug
```

Follow the [exporter's managed restart procedure](../../../../../apps/engine-editor/scripts/touch-of-death-music/README.md)
after rebuilding. The old artifact is intact. Only its managed game surface was
restarted; the existing worker-lab server was not changed.

Verification: 10 trace/extension/lifecycle tests and 2 exact-export tests passed;
the two trace tests were rerun after analyzer changes. Desktop-runtime build and
package typecheck passed; process-policy check reported zero violations. Untimed
browser verification proved source-map loading, an advancing local match, no page
errors and cleanup. Visible launch had a Chrome window, no visible console window,
zero extension targets and no remaining owned processes. Managed server errors
were empty. This is correctness/tooling evidence, not fresh-motion acceptance.

The proposed shared-geometry, hidden-reticle and changed-write follow-up is now
implemented and measured in the [HUD layout audit](touch-of-death-hud-layout-audit.md).
That report retains the failed timing results and identifies the next remaining
forced-style caller. Renderer attribute setup remains a large sampled native
cost in this original capture; the redundant fraction is still unmeasured.
