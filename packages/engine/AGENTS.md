# Engine guidance

Start with [the engine README](readme.md); choose a relevant topic from
[the documentation map](docs/README.md). Root guidance owns shared code policy.

Keep engine APIs framework-neutral, editor-independent, and usable without app
preferences. Game identities, balance, assets, and narrative stay in consumers.
Hot leaf paths may use positional inputs and reusable output sinks; document the
ownership and lifetime of borrowed buffers.

## Conditional contracts

- **Game visual assets or presentation:** use [game-art-direction](../../.agents/skills/game-art-direction/SKILL.md)
  for rendered comparisons and scoped approvals. Game taste stays in its owning consumer.
- **Performance work:** use [developer performance](docs/developer-performance.md).
  Define control/candidate, workload, metric, warmup and repeats before timing.
  Check correctness first; compare repeated serial A/B/B/A trials, judging median
  p95 plus tails, memory and parity. Parallel timings are health evidence only.
  Portable gates count work, bytes, allocation, resource bounds and scaling;
  absolute timing gates require a documented reference environment. Default-enable
  only clear full-loop wins (roughly 5% on the target without material regression).
  Pooling, typed buffers and WASM must include conversion and lifecycle costs.
  Keep raw commands, samples and environment under `.local/engine-perf/`.
  [Hypotheses](docs/engine-performance-hypothesises.md) and
  [history](docs/engine-performance-optimizations.md) are experiment references.
- **Package entries or bundling:** run package `build`, `check:bundle-size`, and
  `release:package-consumer`. Review complete native and rebundled import graphs,
  including shared chunks; [bundle evidence](docs/bundle-size-evidence.md) owns
  size migrations.
- **Project formats or export:** preserve the public, independently readable
  [portable project contract](docs/project-portability.md), including explicit
  diagnostics for unsupported engine-specific data.
- **Multiplayer protocols:** follow [serialization guidance](../../docs/serialization.md)
  for measured codec selection; preserve specialized binary input/replication until a full-loop A/B proves a win. Avoid
  game-local formats when the engine protocol suffices. Zero-copy decoded views
  are read-only unless the caller owns the buffer. Verify protocol changes with
  multi-client room evidence for bytes/second, payload, latency and entity count.
