# Browser cadence, focus and image repeatability - October 8, 2026

The visible browser can follow the monitor's 165 Hz cadence. The old image
variation is isolated to the multisampled WebGL path, including identical-packet
redraws inside one inline world. Neither finding establishes game performance at
165 FPS or licenses changing rendering quality or the image gate.

This note owns these diagnostic findings; the
[performance audit](../../touch-of-death-performance-audit.md) owns promotion.
Reference environment: Windows, i9-13900HX, RTX 4070 Laptop through ANGLE/D3D11,
Chrome 154.0.8037.58, AC power, battery saver off and High performance power plan.
Game captures used a 1366 x 768 viewport at approximately DPR 1. All browsers
were owned visible windows and were closed with empty process/window receipts.

## Native cadence and timing limits

The native display probe reported one 2560 x 1600 display configured at 165 Hz.
A separate visible probe collected 400 rAF intervals per case, comparing callback
timestamps, `performance.now()` and `Date.now()` in the same browser.

| Probe | Observed cadence | Interval p50 / p95 / p99 |
| --- | ---: | ---: |
| Idle | 165.07 Hz | 6.1 / 6.2 / 6.3 ms |
| WebGL2 clear, initially unwarmed | 155.73 Hz | 6.1 / 6.3 / 18.2 ms |
| Canvas2D fill | 165.06 Hz | 6.1 / 6.2 / 6.2 ms |
| Repeated idle | 165.06 Hz | 6.1 / 6.2 / 6.3 ms |

All three clocks agreed; this does not support a scaled-clock explanation for
the earlier roughly 7.6 ms empty-rAF median, or 131.6 Hz. The historical native
display mode and VRR state were not recorded, so their earlier state is unknown.
The new probe ran while CPU-only fixture preparation was active. Its unwarmed
WebGL result is diagnostic health evidence, not an isolated performance ceiling.
The idle and Canvas2D cases establish current 165 Hz capability without a display
setting change; they do not measure physical scanout or sustained game rendering.

Keep the 6.06 ms CPU/GPU deadline target. A literal `interval <= 1000 / 165`
threshold also counts quantized 6.1 ms intervals as late on this normally paced
display. Report actual cadence and timer precision alongside that strict metric;
do not silently reinterpret every such interval as a missed display refresh.

## MSAA isolates the old image mismatch

The experiment reused the exact prior `current/candidate` graph and saved KO
checkpoint, with captures at frames 0 and 60. Two independent inline/worker runs
per raster mode retained raw WebGL, postprocessed and identical-packet redraw
images. Twelve world executions passed all 732 standalone state-oracle samples;
state, numeric packet and compact presentation hashes matched between realms.

| Actual raster state | Pixel comparisons | Exact | Maximum channel delta | Outside existing tolerance |
| --- | ---: | ---: | ---: | ---: |
| 4 samples, dithering on | 20 | 6 | 7/255 | 6 |
| 4 samples, dithering off | 20 | 4 | 7/255 | 6 |
| 0 samples, dithering on | 20 | 20 | 0 | 0 |

Each group covers raw and postprocessed realm pairs, same-packet redraws and
independent inline runs. Actual WebGL attributes and sample counts were recorded;
the zero-sample result was not inferred from a requested setting alone.

The default-AA same-packet inline redraw changed eight opaque raw pixels along
`x=256..263, y=8` by up to 7/255, plus one pixel by 1/255. Postprocessing produced
the familiar 19 changed pixels near `x=256..264, y=8..10`, maximum 5/255. Because
these raw pixels have alpha 255, alpha unpremultiplication does not explain this
particular difference. Canvas2D compositing cannot be its sole origin either.
Dithering off retained the mismatch. With AA off, every raw and postprocessed
comparison was pixel-exact across realms, independent runs and repeated draws.

The evidence isolates the multisampled WebGL path independently of worker state.
It does not distinguish browser default-framebuffer behavior, resolve behavior
or driver implementation, and does not establish a driver defect. JIT, physics
divergence and worker serialization do not explain identical-packet inline
redraw differences. The result is specific to this captured artifact and GPU.

A later combined selection/VAO candidate also matched state, packet and
presentation hashes through 1,441 samples, with exact AA-off inline/worker PNGs
at frames 0, 300, 600, 900, 1260 and 1440. These six captures provide additional
isolated correctness evidence; they do not satisfy the default-AA quality gate.

The existing gate remains at most 100 changed pixels and maximum channel delta
3/255. Diagnostic runs retain failures rather than widening that tolerance.
Keep production AA quality unchanged and use AA-off as a separate exact oracle.
If deterministic default-AA captures are required, compare an explicit offscreen
multisample target/resolve with the browser default framebuffer, retaining image
quality and measuring total GPU and presentation cost.

## Focus instrumentation control

A real tab switch tested raw CDP attachment, `Performance.enable`, explicit focus
emulation on and explicit emulation off. Raw attachment and Performance collection
both reported the inactive page as hidden and unfocused, with blur/visibility
events. Explicit emulation on masked those signals; disabling it restored them.
The native foreground HWND remained owned while the other tab was active, which
demonstrates why native window checks and DOM events are both needed.

The installed Playwright code skips automatic focus emulation for the owned
default context with `noDefaults: true`; raw `newCDPSession` only attaches. The
experiment therefore rejects the suspected current CDP-attachment blind spot.
It does not prove the cause of historical roughly 500 ms message-delivery gaps
or rule out every brief operating-system foreground change between samples.

## Reproduction and evidence

The [worker spike tools](../../../../../../../spikes/persistent-world-worker/README.md)
own reusable commands and options: `cadence.ts`, `diagnostics/power-state.ts`, `focus-check.ts`,
`verify.ts`, `image-parity.ts`, and offline `control-drift.ts` / `trace-analysis.ts`.
Run window probes serially outside accepted FPS measurements. Image-layer capture,
actual raster-state receipts, pixel locations and batch comparisons are supported
without changing the ordinary renderer or accepted pixel threshold.

Temporary raw evidence is under
`.local/engine-perf/worker-arena-campaign-20261008/`: `native-cadence.json`,
`focus-session.json`, `raster-matrix-inputs.ps1`, `raster-matrix-plan.json`,
`raster-summary.json`, all `raster-*` captures/reports and `combined-parity-*`.
The owning performance campaign may prune these reproducible outputs after its
promotion decision and unresolved defects are preserved; this note retains the
findings without requiring those local files to exist.

The later [marked native traces](october-8-native-critical-path.md) separate
allocation pressure, worker computation and presentation stalls at native size.
