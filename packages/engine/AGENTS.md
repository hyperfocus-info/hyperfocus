# Engine guidance

The root [repository guidance](../../AGENTS.md) also applies here. Start with
[the engine guide](readme.md), then choose one focused topic from
[the engine documentation index](docs/README.md). Do not preload the whole docs folder.

## Engine contract

- Preserve the framework-neutral and editor-independent package boundary.
- Keep the baseline API small and immediately usable; advanced tuning stays optional.
- Follow the root entry/leaf function convention. In hot leaf paths, prefer small
  positional inputs and reusable output sinks over per-frame options objects.
- Store authored numeric tuning as finished values, not placeholder arithmetic.
- Use `for...of` for arrays and iterables and `Object.keys` or `Object.entries` for
  object maps. Use `for...in` only when inherited enumerable keys are intentional.

## Performance changes

Read [developer performance](docs/developer-performance.md) for the normal workflow.
Use [performance hypotheses](docs/engine-performance-hypothesises.md) and
[optimization history](docs/engine-performance-optimizations.md) only for a measured
performance task.

- Define the control, candidate, command, repeats, warmup, input scale, flags, and
  primary metric before editing.
- Run correctness checks before benchmarks. Compare repeated serial A/B/B/A trials;
  parallel timing is health evidence, not decision evidence.
- Prefer machine-independent test budgets for behavior, allocations, bytes, draw
  counts, queue depth, cache growth, and scaling ratios.
- Gate wall-clock p95/p99 only on a documented reference environment. Judge median
  p95 first, then tail latency, memory, payload, resource counts, and parity.
- Default-enable only clear end-to-end wins (about five percent or better on the
  target metric with no material regression). Keep noisy or microbench-only wins off.
- Treat pooling, output reuse, typed buffers, and WASM as tradeoffs until the full
  loop includes conversion cost and proves a net win.
- Store raw evidence under `.local/engine-perf/` with the experiment id, environment,
  command, control, candidate, repeats, and summary.

## Multiplayer state

- Use bounded engine binary schemas for high-rate snapshots and deltas; keep JSON
  for low-rate lobby, control, debug, and compatibility traffic.
- Do not add game-local wire formats when the engine protocol can express the data.
- Treat zero-copy decoded payloads as borrowed read-only views unless the caller owns
  the backing buffer.
- Benchmark protocol changes with multi-client room tests that record bytes per
  second, payload size, latency, and entity counts.
