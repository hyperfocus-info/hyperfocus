export type ParticleEmitter2DOptions = {
  capacity: number;
  seed?: number;
  lifetimeMin?: number;
  lifetimeMax?: number;
  speedMin?: number;
  speedMax?: number;
  angleMin?: number;
  angleMax?: number;
  gravityX?: number;
  gravityY?: number;
  sizeMin?: number;
  sizeMax?: number;
  maxEmitPerCall?: number;
};
export type ParticleEmitter2DDiagnostics = { emitted: number; dropped: number; expired: number; steps: number };
export type ParticleEmitter2DSnapshot = { version: 1; seed: number; active: number; diagnostics: ParticleEmitter2DDiagnostics };

export const PARTICLE_INSTANCE_STRIDE = 4;

type ParticleEmitter2DState = {
  capacity: number;
  diagnostics: ParticleEmitter2DDiagnostics;
  active: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  age: Float32Array;
  lifetime: Float32Array;
  size: Float32Array;
  free: Int32Array;
  freeCount: number;
  activeCount: number;
  seed: number;
  options: Required<Omit<ParticleEmitter2DOptions, "capacity" | "seed">>;
};

export function createParticleEmitter2D(options: ParticleEmitter2DOptions) {
  const state = createParticleEmitter2DState(options);
  return Object.freeze({
    capacity: state.capacity,
    numericStorageBytes: state.capacity * 33,
    diagnostics: state.diagnostics,
    get count() { return state.activeCount; },
    emit: (count: number, originX = 0, originY = 0) => emitParticles2D(state, count, originX, originY),
    step: (deltaSeconds: number) => stepParticles2D(state, deltaSeconds),
    writeInstances: (output: Float32Array) => writeParticleInstances2D(state, output),
    snapshot: (): ParticleEmitter2DSnapshot => ({ version: 1, seed: state.seed, active: state.activeCount, diagnostics: { ...state.diagnostics } }),
  });
}

export type ParticleEmitter2D = ReturnType<typeof createParticleEmitter2D>;

function createParticleEmitter2DState(options: ParticleEmitter2DOptions): ParticleEmitter2DState {
  const capacity = integer(options.capacity, 1, 1_000_000, "Particle capacity");
  const lifetimeMin = positive(options.lifetimeMin ?? 0.5, "lifetimeMin");
  const lifetimeMax = positive(options.lifetimeMax ?? 1.5, "lifetimeMax");
  const speedMin = nonnegative(options.speedMin ?? 20, "speedMin");
  const speedMax = nonnegative(options.speedMax ?? 100, "speedMax");
  const sizeMin = nonnegative(options.sizeMin ?? 1, "sizeMin");
  const sizeMax = nonnegative(options.sizeMax ?? 4, "sizeMax");
  if (lifetimeMax < lifetimeMin || speedMax < speedMin || sizeMax < sizeMin) throw new RangeError("Particle maximums must not be smaller than minimums");
  const free = new Int32Array(capacity);
  for (let index = 0; index < capacity; index += 1) free[index] = capacity - index - 1;
  return {
    capacity,
    diagnostics: { emitted: 0, dropped: 0, expired: 0, steps: 0 },
    active: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    velocityX: new Float32Array(capacity),
    velocityY: new Float32Array(capacity),
    age: new Float32Array(capacity),
    lifetime: new Float32Array(capacity),
    size: new Float32Array(capacity),
    free,
    freeCount: capacity,
    activeCount: 0,
    seed: unsigned(options.seed ?? 0x9e3779b9, "Particle seed") || 1,
    options: {
      lifetimeMin, lifetimeMax, speedMin, speedMax,
      angleMin: finite(options.angleMin ?? 0, "angleMin"),
      angleMax: finite(options.angleMax ?? Math.PI * 2, "angleMax"),
      gravityX: finite(options.gravityX ?? 0, "gravityX"),
      gravityY: finite(options.gravityY ?? 0, "gravityY"),
      sizeMin, sizeMax,
      maxEmitPerCall: integer(options.maxEmitPerCall ?? Math.min(capacity, 65_536), 1, 65_536, "maxEmitPerCall"),
    },
  };
}

function emitParticles2D(state: ParticleEmitter2DState, count: number, originX: number, originY: number) {
  const requested = integer(count, 0, state.options.maxEmitPerCall, "Particle emit count");
  const startX = finite(originX, "originX");
  const startY = finite(originY, "originY");
  const emitted = Math.min(requested, state.freeCount);
  for (let emittedIndex = 0; emittedIndex < emitted; emittedIndex += 1) {
    const index = state.free[--state.freeCount]!;
    const angle = mix(state.options.angleMin, state.options.angleMax, randomParticleValue(state));
    const speed = mix(state.options.speedMin, state.options.speedMax, randomParticleValue(state));
    state.active[index] = 1;
    state.x[index] = startX;
    state.y[index] = startY;
    state.velocityX[index] = Math.cos(angle) * speed;
    state.velocityY[index] = Math.sin(angle) * speed;
    state.age[index] = 0;
    state.lifetime[index] = mix(state.options.lifetimeMin, state.options.lifetimeMax, randomParticleValue(state));
    state.size[index] = mix(state.options.sizeMin, state.options.sizeMax, randomParticleValue(state));
  }
  state.activeCount += emitted;
  state.diagnostics.emitted += emitted;
  state.diagnostics.dropped += requested - emitted;
  return emitted;
}

function stepParticles2D(state: ParticleEmitter2DState, deltaSeconds: number) {
  const delta = nonnegative(deltaSeconds, "Particle delta");
  if (delta > 0.25) throw new RangeError("Particle delta must be at most 0.25 seconds");
  state.diagnostics.steps += 1;
  for (let index = 0; index < state.capacity; index += 1) {
    if (!state.active[index]) continue;
    state.age[index] += delta;
    if (state.age[index] >= state.lifetime[index]) {
      state.active[index] = 0;
      state.free[state.freeCount++] = index;
      state.activeCount -= 1;
      state.diagnostics.expired += 1;
      continue;
    }
    state.velocityX[index] += state.options.gravityX * delta;
    state.velocityY[index] += state.options.gravityY * delta;
    state.x[index] += state.velocityX[index] * delta;
    state.y[index] += state.velocityY[index] * delta;
  }
  return state.activeCount;
}

function writeParticleInstances2D(state: ParticleEmitter2DState, output: Float32Array) {
  let written = 0;
  for (let index = 0; index < state.capacity; index += 1) {
    if (!state.active[index]) continue;
    const offset = written * PARTICLE_INSTANCE_STRIDE;
    if (offset + PARTICLE_INSTANCE_STRIDE > output.length) break;
    output[offset] = state.x[index];
    output[offset + 1] = state.y[index];
    output[offset + 2] = state.age[index] / state.lifetime[index];
    output[offset + 3] = state.size[index];
    written += 1;
  }
  return written;
}

function randomParticleValue(state: ParticleEmitter2DState) {
  let value = state.seed += 0x6d2b79f5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  state.seed = state.seed >>> 0;
  return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
}
function mix(a: number, b: number, ratio: number) { return a + (b - a) * ratio; }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`); return value; }
function positive(value: number, label: string) { const checked = finite(value, label); if (checked <= 0) throw new RangeError(`${label} must be greater than zero`); return checked; }
function nonnegative(value: number, label: string) { const checked = finite(value, label); if (checked < 0) throw new RangeError(`${label} must not be negative`); return checked; }
function integer(value: number, minimum: number, maximum: number, label: string) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`); return value; }
function unsigned(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be an unsigned 32-bit integer`); return value >>> 0; }
