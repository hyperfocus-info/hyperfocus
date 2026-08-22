export type MovementSample = {
  time: number;
  x: number;
  y: number;
  z?: number;
};

export type MovementPrediction = {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  horizonMs: number;
  confidence: number;
};

export type MovementPredictorOptions = {
  maxPredictionMs?: number;
  maxSpeed?: number;
  velocitySmoothing?: number;
  latencySmoothing?: number;
  initialRttMs?: number;
};

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

/** A deterministic bounded statistical predictor; callers supply all timestamps. */
export function createMovementPredictor(options: MovementPredictorOptions = {}) {
  const maxPredictionMs = options.maxPredictionMs ?? 150;
  const maxSpeed = options.maxSpeed ?? Number.POSITIVE_INFINITY;
  const velocitySmoothing = options.velocitySmoothing ?? 0.5;
  const latencySmoothing = options.latencySmoothing ?? 0.2;
  let rttMs = options.initialRttMs ?? 0;
  if (!Number.isFinite(maxPredictionMs) || maxPredictionMs < 0) throw new RangeError("maxPredictionMs must be non-negative and finite");
  if (!(maxSpeed > 0) || Number.isNaN(maxSpeed)) throw new RangeError("maxSpeed must be positive");
  if (!Number.isFinite(velocitySmoothing) || velocitySmoothing < 0 || velocitySmoothing > 1) throw new RangeError("velocitySmoothing must be between 0 and 1");
  if (!Number.isFinite(latencySmoothing) || latencySmoothing < 0 || latencySmoothing > 1) throw new RangeError("latencySmoothing must be between 0 and 1");
  if (!Number.isFinite(rttMs) || rttMs < 0) throw new RangeError("initialRttMs must be non-negative and finite");
  let latencyDeviationMs = 0;
  let latest: Required<MovementSample> | undefined;
  let velocityX = 0;
  let velocityY = 0;
  let velocityZ = 0;
  let sampleCount = 0;

  function observe(sample: MovementSample) {
    const next = {
      time: finite(sample.time, "movement sample time"),
      x: finite(sample.x, "movement sample x"),
      y: finite(sample.y, "movement sample y"),
      z: finite(sample.z ?? 0, "movement sample z")
    };
    if (next.time < 0) throw new RangeError("movement sample time must be non-negative");
    if (latest && next.time <= latest.time) return false;
    if (latest) {
      const seconds = (next.time - latest.time) / 1_000;
      let measuredX = (next.x - latest.x) / seconds;
      let measuredY = (next.y - latest.y) / seconds;
      let measuredZ = (next.z - latest.z) / seconds;
      const speed = Math.hypot(measuredX, measuredY, measuredZ);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        measuredX *= scale;
        measuredY *= scale;
        measuredZ *= scale;
      }
      const blend = sampleCount === 1 ? 1 : velocitySmoothing;
      velocityX += (measuredX - velocityX) * blend;
      velocityY += (measuredY - velocityY) * blend;
      velocityZ += (measuredZ - velocityZ) * blend;
    }
    latest = next;
    sampleCount += 1;
    return true;
  }

  return {
    observe,
    observeRtt(measuredRttMs: number) {
      finite(measuredRttMs, "round-trip latency");
      if (measuredRttMs < 0) throw new RangeError("round-trip latency must be non-negative");
      const deviation = Math.abs(measuredRttMs - rttMs);
      rttMs += (measuredRttMs - rttMs) * latencySmoothing;
      latencyDeviationMs += (deviation - latencyDeviationMs) * latencySmoothing;
      return rttMs;
    },
    predict(atTime: number, target: MovementPrediction = {} as MovementPrediction): MovementPrediction | undefined {
      finite(atTime, "prediction time");
      if (!latest) return undefined;
      const ageMs = Math.max(0, atTime - latest.time);
      const horizonMs = Math.min(maxPredictionMs, ageMs + rttMs / 2);
      const seconds = horizonMs / 1_000;
      target.x = latest.x + velocityX * seconds;
      target.y = latest.y + velocityY * seconds;
      target.z = latest.z + velocityZ * seconds;
      target.velocityX = velocityX;
      target.velocityY = velocityY;
      target.velocityZ = velocityZ;
      target.horizonMs = horizonMs;
      const freshness = maxPredictionMs === 0 ? (horizonMs === 0 ? 1 : 0) : 1 - horizonMs / maxPredictionMs;
      const jitterPenalty = maxPredictionMs === 0 ? 0 : Math.min(1, latencyDeviationMs / maxPredictionMs);
      target.confidence = sampleCount < 2 ? 0 : Math.max(0, Math.min(1, freshness * (1 - jitterPenalty)));
      return target;
    },
    reset() {
      latest = undefined;
      velocityX = 0;
      velocityY = 0;
      velocityZ = 0;
      sampleCount = 0;
      latencyDeviationMs = 0;
    },
    latency() {
      return { rttMs, deviationMs: latencyDeviationMs };
    }
  };
}
