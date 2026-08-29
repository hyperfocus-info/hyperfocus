import { TELEMETRY_FRAME_BUDGET_MS, TELEMETRY_PHASE_NAMES, TELEMETRY_SAMPLE_COUNT } from "./constants.ts";
import { PERF_QUERY } from "./environment.ts";
import { createFrameMetrics } from "@hyperfocus/engine";
import type { SlowFrame } from "./telemetry-types.ts";

export function createSlowFrameList(): SlowFrame[] {
  return [];
}

export const telemetry = {
  enabled: PERF_QUERY.get("telemetry") === "1",
  metrics: createFrameMetrics({ capacity: TELEMETRY_SAMPLE_COUNT, maxSeries: 64, longFrameMs: TELEMETRY_FRAME_BUDGET_MS }),
  phaseScratch: createTelemetryPhaseScratch(),
  count: 0,
  totalFrames: 0,
  longFramesOverBudget: 0,
  longFramesOver33: 0,
  longFramesOver50: 0,
  longFramesOver100: 0,
  skippedFrames: 0,
  dtClampFrames: 0,
  maxFrameGapMs: 0,
  maxFrameMs: 0,
  maxUpdateMs: 0,
  maxRenderMs: 0,
  lastFrameStart: 0,
  lastHeapBytes: 0,
  lastMaterialCreates: 0,
  lastMeshCreates: 0,
  lastEffectCreates: 0,
  lastParticleCreates: 0,
  slowFrames: createSlowFrameList(),
  clock: 0,
  materialCreates: 0,
  meshCreates: 0,
  effectCreates: 0,
  particleCreates: 0,
  lastText: ""
};

export function createTelemetryPhaseScratch(): Record<string, number> {
  const scratch: Record<string, number> = {};
  for (const name of TELEMETRY_PHASE_NAMES) scratch[name] = 0;
  return scratch;
}

export function measureTelemetryPhase<T>(name: string, work: () => T): T {
  if (!telemetry.enabled) return work();
  const started = performance.now();
  try {
    return work();
  } finally {
    telemetry.phaseScratch[name] += performance.now() - started;
  }
}
