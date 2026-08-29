# Hyperfocus performance evidence

Repository-only benchmark helpers shared by engine, application, and UI spikes.
`createPerformanceEvidenceReport` keeps portable structural facts separate from
calibration-only timing samples. `comparePerformanceEvidence` permits timing
comparison only when benchmark config and the complete machine/runtime context
match. `record-history.ts` rolls reports into a bounded 104-entry-per-benchmark
history and records whether each adjacent timing pair is actually comparable.

Set `HYPERFOCUS_BENCH_POWER_PROFILE`, `HYPERFOCUS_BENCH_THERMAL_STATE`,
`HYPERFOCUS_BENCH_CONTENTION`, `HYPERFOCUS_BENCH_DEVICE_PROFILE`, and
`HYPERFOCUS_BENCH_ACTIVE_AGENTS` when known. Unset conditions are recorded as
`unrecorded`, making cross-run timing comparison ineligible. Add freeform context
with `HYPERFOCUS_BENCH_NOTES`. CPU clocks and free memory are observations, not
portable gates.
