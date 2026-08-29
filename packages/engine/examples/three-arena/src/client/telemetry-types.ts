
export type SlowFrame = {
  time: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  gapMs: number;
  rawDtMs: number;
  topPhase: string;
  topPhaseMs: number;
  heapDeltaBytes: number;
  enemies: number;
  bullets: number;
  pickups: number;
  particles: number;
  props: number;
  pendingProps: number;
};

export type TelemetrySample = {
  frameMs: number;
  updateMs: number;
  cameraMs: number;
  renderMs: number;
  dtMs: number;
  rawDtMs: number;
  frameGapMs: number;
};
export type SampleStats = { p50: number; p95: number; p99: number; avg: number; max: number };
export type PositiveSampleStats = SampleStats & { count: number };
export type BrowserPerformance = Performance & { memory?: { usedJSHeapSize: number } };
