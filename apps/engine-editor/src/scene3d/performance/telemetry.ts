export type GameFrameSample = {
  time: number;
  intervalMs: number;
  cpuMs: number;
  simulationMs: number;
  presentationMs: number;
  renderSubmitMs: number;
  steps: number;
  droppedMs: number;
  tick: number;
  phase: string;
  vsync: boolean;
  draws: number;
  shadowDraws: number;
  outlineDraws: number;
  triangles: number;
  instances: number;
  physicsOverflows: number;
  /** Viewport + fighter bars + reticle only. Setter calls are not style/layout events. */
  hudWork?: { layout: 'original' | 'batched' | 'post-first'; geometryReads: number; rendererGeometryReads: number; postGeometryReads: number; deferredFrames: number; layoutFallbacks: number; textWrites: number; attributeWrites: number; styleWrites: number; skippedWrites: number; projections: number; entityVisits: number; reticleReads: number; reticleWrites: number };
  /** Canvas2D post submission and overlay layout; overlaps cpuMs, excludes deferred HUD work. */
  postProcessMs?: number;
  /** Separate realm timings; these overlap host CPU work and must not be summed with cpuMs. */
  workerComputeMs?: number;
  workerSimulationMs?: number;
  workerPresentationMs?: number;
  inputAgeMs?: number;
  /** Applied ages track successful simulation ticks; submit endpoints precede GPU completion/scanout. */
  appliedInputAgeMs?: number;
  inputToSubmitMs?: number;
  appliedInputToSubmitMs?: number;
  messageDeliveryMs?: number;
  hostWaitMs?: number;
  frameAgeMs?: number;
  combatFrame?: number;
  hitstopFrames?: number;
  fighters?: Array<{ id: string; x: number; y: number; z: number; health: number; moveId?: string }>;
};

function distribution(values: number[]) {
  values.sort((a, b) => a - b);
  const at = (fraction: number) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))]! : 0;
  return { p50: at(.5), p95: at(.95), p99: at(.99), max: values.at(-1) ?? 0 };
}

/** Detached export; fixed storage bounds independent of session duration. */
export function createGameTelemetry(options: { capacity?: number; incidentCapacity?: number } = {}) {
  const capacity = options.capacity ?? 1800, incidentCapacity = options.incidentCapacity ?? 64;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(incidentCapacity) || incidentCapacity < 1) throw Error('Telemetry capacities must be positive integers.');
  const frames = new Array<GameFrameSample>(capacity);
  const incidents: Array<{ kind: string; sample: GameFrameSample; context: unknown }> = [];
  let cursor = 0, count = 0, totalFrames = 0, slowFrames = 0, droppedMs = 0, lastIncident = -Infinity;
  function recent() { return Array.from({ length: count }, (_, i) => frames[(cursor - count + i + capacity) % capacity]!); }
  return {
    record(sample: GameFrameSample, context?: () => unknown) {
      frames[cursor] = { ...sample };cursor = (cursor + 1) % capacity;count = Math.min(count + 1, capacity);totalFrames++;
      droppedMs += sample.droppedMs;if (sample.intervalMs > 50) slowFrames++;
      const kind = sample.physicsOverflows > 0 ? 'physics-overflow' : sample.droppedMs > 0 ? 'simulation-time-dropped' : sample.intervalMs > 50 ? 'slow-frame' : undefined;
      if (kind && (kind !== 'slow-frame' || sample.time - lastIncident >= 1000)) {
        if (incidents.length === incidentCapacity) incidents.shift();
        incidents.push({ kind, sample: { ...sample }, context: context?.() });lastIncident = sample.time;
      }
    },
    summary(phase?: string) {
      const rows = recent().filter(row => phase === undefined || row.phase === phase), elapsed = rows.reduce((sum, row) => sum + row.intervalMs, 0);
      return { retainedFrames: rows.length, totalFrames: phase === undefined ? totalFrames : rows.length,
        slowFrames: phase === undefined ? slowFrames : rows.filter(row => row.intervalMs > 50).length,
        droppedMs: phase === undefined ? droppedMs : rows.reduce((sum, row) => sum + row.droppedMs, 0), fps: elapsed ? rows.length * 1000 / elapsed : 0,
        intervalMs: distribution(rows.map(row => row.intervalMs)), cpuMs: distribution(rows.map(row => row.cpuMs)),
        simulationMs: distribution(rows.map(row => row.simulationMs)), renderSubmitMs: distribution(rows.map(row => row.renderSubmitMs)),
        presentationMs: distribution(rows.map(row => row.presentationMs)), draws: distribution(rows.map(row => row.draws)),
        maxSteps: rows.reduce((max, row) => Math.max(max, row.steps), 0) };
    },
    snapshot() { return { capacity, incidentCapacity, frames: structuredClone(recent()), incidents: structuredClone(incidents) }; },
    clear() { frames.length = 0;frames.length = capacity;cursor = count = totalFrames = slowFrames = droppedMs = 0;incidents.length = 0;lastIncident = -Infinity; },
  };
}
