# Architectural resilience implementation matrix

This matrix records the implementation state of the 50 resilience and experimental engine ideas proposed in August 2026. “Shipped” means a tested engine primitive is available. “Foundation” means the reusable, capability-gated boundary exists but a browser backend, game policy, or authored asset is still required. “Existing” identifies behavior that was already implemented and was verified during this pass. “Deferred” is used where exposing a placeholder would create a misleading or unsafe contract.

## Standard omissions

The [2026-09-09 adversarial audit](editor-engine-adversarial-audit.md) qualifies
these primitive-level statuses with open integration and boundary failures.
In particular, browser transaction concurrency/quota and actual process-kill
recovery remain unverified; interrupted direct-driver accumulation can exceed the
ordinary fixed-step work ceiling; renderer recovery does not yet propagate to
video delivery. A shipped primitive is not proof of every caller's failure path.

| # | Status | Engine coverage |
|---:|---|---|
| 1 | Shipped | Canvas bootstrap listens for context loss/restoration, exposes recovery callbacks, and provides `recoverContext()` so games can rehydrate atlases, images, and fonts. |
| 2 | Shipped | Keyboard and pointer state reconcile on visibility, page-hide, freeze, and lifecycle changes instead of relying on blur alone. |
| 3 | Shipped | Tile rendering supports source-edge inset clamping and device-pixel destination snapping for fractional-DPI seams. |
| 4 | Shipped | The audio engine monitors `AudioContext.statechange` and can rebuild its static graph or rehydrate a closed context through an injected factory. |
| 5 | Shipped | Polygon/polyline draw data accepts flat numeric arrays with offsets/counts; `drawPolygonFlat()` avoids temporary point objects and slices. |
| 6 | Existing | 2D and rigid-3D continuous bodies use tested sweep collision paths that prevent tunneling through thin colliders. |
| 7 | Shipped | 2D and rigid-3D solvers offer opt-in float32 persistent storage for JavaScript/WASM replay parity. |
| 8 | Existing | IndexedDB saves commit in atomic transactions with compare-and-swap retries; save envelopes are checksummed and rejected when incomplete or corrupt. |
| 9 | Shipped | `createGamepadPoller()` polls from a high-resolution timer independently of RAF while preserving edge state. |
| 10 | Shipped | Bounded asset loading has stable priority classes and starts critical audio before normal/background work. Running browser decode work is not forcibly preempted. |
| 11 | Shipped | Broadphase supports `auto`, packed, and linear strategies; highly dynamic update ratios bypass index-maintenance thrash. |
| 12 | Shipped | Canvas resize handling observes `visualViewport`, waits for consecutive stable viewport frames, cancels stale work, and skips redundant backing-buffer assignments. |
| 13 | Shipped | Post-processing offers standard piecewise sRGB/linear conversion and an opt-in linear working space. |
| 14 | Shipped | `hydrateFonts()` loads faces independently with per-face timeout and required/optional semantics. |
| 15 | Existing | Audio voices use bounded reusable gain/panner slots and a static bus graph rather than constructing an unbounded graph per effect. |
| 16 | Shipped | Rollback input storage bounds both historical and future jitter windows and reports frames dropped outside the recoverable range. |
| 17 | Shipped | IndexedDB failures normalize to typed quota, unavailable, blocked, corrupt-data, and transaction errors with explicit delegation. |
| 18 | Shipped | The staged upload queue amortizes texture/resource insertion by task, byte, and time budgets with bounded overflow and error handling. |
| 19 | Shipped | A bounded LRU procedural `Path2D` cache accepts an injectable path factory and explicit invalidation. |
| 20 | Shipped | `deriveSeed()` and `createSeedableRandom().fork()` provide domain-separated, order-independent structured child seeds. |
| 21 | Shipped | Texture-unit-aware planning splits ordered draw ranges whenever a batch would exceed the hardware unit budget. |
| 22 | Existing | Canvas and fixed-step loops clamp wake-up deltas and bound the number of catch-up updates. |
| 23 | Shipped | The touch-cluster tracker keeps the gesture centroid continuous as fingers join and leave and supports reusable output storage. |
| 24 | Shipped | The collision WASM boundary reserves scratch memory at startup, reuses it, and rejects oversized batches deterministically. Future WASM modules must opt into the same discipline. |
| 25 | Existing | Render text wrapping and truncation use bounded per-context caches for stable text and UI draw data. |

## Experimental ideas

| # | Status | Engine coverage |
|---:|---|---|
| 26 | Foundation | The shared state arena provides atomic, zero-copy TS/WASM/worker allocation and typed views. A game still chooses its worker physics protocol and isolation headers. |
| 27 | Shipped | The experimental AudioWorklet/WASM host owns module loading, node connection, control messages, lifecycle, and unsupported-browser failure. DSP code remains caller supplied. |
| 28 | Shipped | Strict bit readers/writers encode signed/unsigned values at exact bit widths and reject overflow, truncation, and trailing misuse. |
| 29 | Shipped | Bounded CRC histories isolate root/entity divergence and create targeted, validated repair patches. |
| 30 | Foundation | Capability inspection reports Houdini Paint Worklet availability. No engine paint language is imposed without an authored UI contract. |
| 31 | Shipped | The WebCodecs replay stream handles encoder backpressure, keyframes, ordered encoded chunks, and stats. Output is deliberately an elementary stream (`container: "none"`); muxing is caller supplied. |
| 32 | Shipped | `SharedStateArena` attaches TS, WASM, and workers to one buffer with atomic bump allocation, epochs, sealing, and zero-copy views. |
| 33 | Foundation | The temporal jitter controller emits deterministic Halton jitter and invalidates history on camera/scene discontinuity. A Canvas feedback compositor remains renderer-specific. |
| 34 | Shipped | The mesh host coordinator performs deterministic temporary-host election, term changes, grace periods, loss recovery, and primary-server revocation without granting implicit authority. |
| 35 | Shipped | A bounded transferable worker scheduler handles compressed-texture transcode requests, cancellation, capacity, and result validation; Basis/KTX2 codec workers remain pluggable. |
| 36 | Shipped | The fixed-memory path predictor learns next hops and falls back cleanly on misses, blockers, cycles, or undersized output buffers. |
| 37 | Deferred | Browser packaging already has bounded compression/decompression and SHA-256 verification. A WASM replacement is deferred until the archive ABI and codec semantics are stable. |
| 38 | Foundation | Existing allocation-bounded instance frustum culling and typed command buffers cover the batching contract. A dedicated SIMD WASM kernel still requires benchmark proof. |
| 39 | Shipped | The bounded chunk streamer deduplicates concurrent loads, retains viewport regions, evicts through LRU policy, and accepts injected IndexedDB/network loaders. |
| 40 | Shipped | The speech-intent mapper normalizes exact commands with confidence/finality checks and requires a guaranteed-local recognition driver by default. |
| 41 | Foundation | An allocation-free RGBA luminance SSIM helper complements existing headless Chromium journey tests. CI ownership and golden-image policy remain repository-specific. |
| 42 | Shipped | The bounded sequential voiceover queue accepts local synthesis drivers, cancellation, overflow policy, and guaranteed-local enforcement. |
| 43 | Shipped | The binary save journal emits bounded snapshot or changed-run deltas with sequence, baseline, entry, and reconstructed-result checksums. |
| 44 | Shipped | The capability-gated instance culler validates an injected GPU backend and always retains an authoritative CPU fallback. WebGPU/transform-feedback shaders remain backend supplied. |
| 45 | Shipped | The deterministic soundscape generator fills caller-owned PCM buffers with seeded wind, rain, and machinery layers without runtime allocation. |
| 46 | Shipped | The movement predictor combines bounded EWMA velocity and RTT, clamps horizon/speed, rejects stale samples, and returns confidence in reusable output. |
| 47 | Shipped | The WASM simulator host validates ABI/exports, migrates state transactionally, rolls back failed swaps, and disposes replaced modules. |
| 48 | Shipped | The local NPC runtime serializes requests, bounds context, refuses remote models, and uses a safe fallback when the local model fails. |
| 49 | Shipped | The adaptive-resolution controller uses frame-budget hysteresis and bounded scale steps while leaving HUD resolution independent. |
| 50 | Shipped | Cooperative tasks use capacity-aware leases, timeout/reassignment, bounded attempts, stale-token rejection, and an explicit verification state before trusted acceptance. |

## Public package surfaces

- `@hyperfocus/engine` — Canvas lifecycle, input reconciliation, deterministic seeds, drawing, and color-space helpers.
- `@hyperfocus/engine/render` — upload staging, texture batching, adaptive resolution, temporal jitter, path caching, and SSIM.
- `@hyperfocus/engine/net` — rollback windows, reconciliation, mesh election, movement prediction, and cooperative task leases.
- `@hyperfocus/engine/protocol` — replication schemas, deltas, frames, and exact bit buffers.
- `@hyperfocus/engine/save` and `@hyperfocus/engine/save/browser` — checksummed profiles, binary journals, and typed IndexedDB storage failures.
- `@hyperfocus/engine/audio` and `@hyperfocus/engine/assets/loader` — recoverable audio graphs, audio-first task priority, and isolated font hydration.
- `@hyperfocus/engine/wasm` — shared memory arenas and transactional simulator hot swapping.
- `@hyperfocus/engine/experimental` — capability-gated AudioWorklet, WebCodecs, texture worker, streaming, speech, synthesis, local NPC, and GPU-culling adapters.

Experimental adapters are opt-in. They validate browser support and injected backends at runtime and do not silently fall back to remote services.
