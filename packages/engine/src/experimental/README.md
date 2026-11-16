# Buffered frame experiments

`@hyperfocus/engine/experimental` exports `createBufferedFrames` and
`createRenderFramePacket3D`. These are opt-in experiments, not the default game
loop or an automatic worker pool. The engine owns buffer admission, sequencing
and serialization; the host supplies execution, clocks and worker lifetime.

`createBufferedFrames<Input, Output>` accepts one, two or three fixed-size buffers
and a `run({ sequence, epoch, input, buffer })` executor. Transfer the buffer to
the executor and return it with the result. A rejected executor or invalid
returned buffer fails the pipeline closed and calls `onError`; the host must
stop its executors. There is no automatic retry or unbounded input queue.

`submit(input)` returns false when full, failed or disposed. Keep the newest
input at the producer; do not queue every rejected input. `takeLatest()` returns
the newest completed result and drops older results. Release its lease only
after every consumer has finished reading its buffer. Do not read its views
after release: another submission may transfer or overwrite that storage.
`reset()` fences pending results from an earlier scene/seek generation. It does
not cancel execution or reuse a buffer that an executor still owns. `dispose()`
stops admission; the host must terminate workers and release outstanding leases.
The bound covers packet storage and admitted jobs, not memory inside an executor.

`createRenderFramePacket3D({ commands, scene })` defines a fixed packet layout
for an initialized scene. `write` copies render command arrays, material data and
skeletal palettes into caller-owned storage. `read` returns borrowed command
views and copies material/palette state into the receiving scene. The two scenes
must have identical immutable mesh, texture, skeleton and handle registries.
Camera, render graph, HUD, audio, simulation state, texture replacements and
mutable mesh/morph data are outside this packet. Synchronize those separately or
recreate the pipeline. This is an in-process trusted-worker format, not a portable
save or untrusted network decoder.

The Touch of Death experiment exercises this boundary with real browser workers;
its commands, hashes, parity checks and timing evidence are recorded in the
[performance audit](../../examples/touch-of-death/docs/touch-of-death-performance-audit.md). Buffer count
is independent of worker count. Extra buffers permit overlapping ownership;
they do not justify predicting future combat inputs or rendering stale frames
from a FIFO. Measure completed render FPS, frame age, transfer time and total
memory before selecting concurrency.

`createSimulationMailbox<Input, Event>` from the small standalone entry
`@hyperfocus/engine/experimental/simulation-mailbox` supports a persistent world instead of
transferring that world on every job. Supply an initial input, monotonic clock
origin, fixed step, catch-up limit, event capacity and synchronous `advance`
callback. `offer` transfers ownership of a continuous input value, replacing the
previous value while retaining discrete events in order. Stale sequences and
event overflow return false without changing state; retain/retry those events at
the host. `advance(nowMs, paused)` consumes events on the first simulated tick,
reports dropped time and distinguishes received from simulation-applied input
sequence. `sampledAtMs` describes the newest accepted input;
`appliedSampledAtMs` describes the input consumed by the last successful tick and
is undefined until a tick runs. Paused or zero-step advances cannot refresh it.
Paused elapsed time is discarded; pending events remain explicit and
are consumed on resume. Dispose/recreate to cancel them or replace a world.
Callback failure stops the mailbox, because a partially advanced world cannot
safely retry. Clock/transport, frame-buffer leases and worker lifetime remain
host responsibilities. The [persistent-world experiment](../../../../spikes/persistent-world-worker/README.md)
is a real browser consumer; it is not enabled by the normal game loop.
