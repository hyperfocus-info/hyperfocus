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

export class ParticleEmitter2D {
  readonly capacity: number;
  readonly numericStorageBytes: number;
  readonly diagnostics: ParticleEmitter2DDiagnostics = { emitted: 0, dropped: 0, expired: 0, steps: 0 };
  private readonly active: Uint8Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly velocityX: Float32Array;
  private readonly velocityY: Float32Array;
  private readonly age: Float32Array;
  private readonly lifetime: Float32Array;
  private readonly size: Float32Array;
  private readonly free: Int32Array;
  private freeCount: number;
  private activeCount = 0;
  private seed: number;
  private readonly options: Required<Omit<ParticleEmitter2DOptions, "capacity" | "seed">>;

  constructor(options: ParticleEmitter2DOptions) {
    this.capacity = integer(options.capacity, 1, 1_000_000, "Particle capacity");
    this.seed = unsigned(options.seed ?? 0x9e3779b9, "Particle seed") || 1;
    const lifetimeMin = positive(options.lifetimeMin ?? 0.5, "lifetimeMin");
    const lifetimeMax = positive(options.lifetimeMax ?? 1.5, "lifetimeMax");
    const speedMin = nonnegative(options.speedMin ?? 20, "speedMin");
    const speedMax = nonnegative(options.speedMax ?? 100, "speedMax");
    const sizeMin = nonnegative(options.sizeMin ?? 1, "sizeMin");
    const sizeMax = nonnegative(options.sizeMax ?? 4, "sizeMax");
    if (lifetimeMax < lifetimeMin || speedMax < speedMin || sizeMax < sizeMin) throw new RangeError("Particle maximums must not be smaller than minimums");
    this.options = {
      lifetimeMin, lifetimeMax, speedMin, speedMax,
      angleMin: finite(options.angleMin ?? 0, "angleMin"),
      angleMax: finite(options.angleMax ?? Math.PI * 2, "angleMax"),
      gravityX: finite(options.gravityX ?? 0, "gravityX"),
      gravityY: finite(options.gravityY ?? 0, "gravityY"),
      sizeMin, sizeMax,
      maxEmitPerCall: integer(options.maxEmitPerCall ?? Math.min(this.capacity, 65_536), 1, 65_536, "maxEmitPerCall"),
    };
    this.active = new Uint8Array(this.capacity);
    this.x = new Float32Array(this.capacity);
    this.y = new Float32Array(this.capacity);
    this.velocityX = new Float32Array(this.capacity);
    this.velocityY = new Float32Array(this.capacity);
    this.age = new Float32Array(this.capacity);
    this.lifetime = new Float32Array(this.capacity);
    this.size = new Float32Array(this.capacity);
    this.free = new Int32Array(this.capacity);
    for (let index = 0; index < this.capacity; index += 1) this.free[index] = this.capacity - index - 1;
    this.freeCount = this.capacity;
    this.numericStorageBytes = this.capacity * 33;
  }

  get count() { return this.activeCount; }

  emit(count: number, originX = 0, originY = 0) {
    const requested = integer(count, 0, this.options.maxEmitPerCall, "Particle emit count");
    const startX = finite(originX, "originX");
    const startY = finite(originY, "originY");
    const emitted = Math.min(requested, this.freeCount);
    for (let emittedIndex = 0; emittedIndex < emitted; emittedIndex += 1) {
      const index = this.free[--this.freeCount]!;
      const angle = mix(this.options.angleMin, this.options.angleMax, this.random());
      const speed = mix(this.options.speedMin, this.options.speedMax, this.random());
      this.active[index] = 1;
      this.x[index] = startX;
      this.y[index] = startY;
      this.velocityX[index] = Math.cos(angle) * speed;
      this.velocityY[index] = Math.sin(angle) * speed;
      this.age[index] = 0;
      this.lifetime[index] = mix(this.options.lifetimeMin, this.options.lifetimeMax, this.random());
      this.size[index] = mix(this.options.sizeMin, this.options.sizeMax, this.random());
    }
    this.activeCount += emitted;
    this.diagnostics.emitted += emitted;
    this.diagnostics.dropped += requested - emitted;
    return emitted;
  }

  step(deltaSeconds: number) {
    const delta = nonnegative(deltaSeconds, "Particle delta");
    if (delta > 0.25) throw new RangeError("Particle delta must be at most 0.25 seconds");
    this.diagnostics.steps += 1;
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue;
      this.age[index] += delta;
      if (this.age[index] >= this.lifetime[index]) {
        this.active[index] = 0;
        this.free[this.freeCount++] = index;
        this.activeCount -= 1;
        this.diagnostics.expired += 1;
        continue;
      }
      this.velocityX[index] += this.options.gravityX * delta;
      this.velocityY[index] += this.options.gravityY * delta;
      this.x[index] += this.velocityX[index] * delta;
      this.y[index] += this.velocityY[index] * delta;
    }
    return this.activeCount;
  }

  /** Writes x, y, normalizedAge, size records in stable slot order. */
  writeInstances(output: Float32Array) {
    let written = 0;
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue;
      const offset = written * PARTICLE_INSTANCE_STRIDE;
      if (offset + PARTICLE_INSTANCE_STRIDE > output.length) break;
      output[offset] = this.x[index];
      output[offset + 1] = this.y[index];
      output[offset + 2] = this.age[index] / this.lifetime[index];
      output[offset + 3] = this.size[index];
      written += 1;
    }
    return written;
  }

  snapshot(): ParticleEmitter2DSnapshot {
    return { version: 1, seed: this.seed, active: this.activeCount, diagnostics: { ...this.diagnostics } };
  }

  private random() {
    let value = this.seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    this.seed = this.seed >>> 0;
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  }
}

export function createParticleEmitter2D(options: ParticleEmitter2DOptions) { return new ParticleEmitter2D(options); }
function mix(a: number, b: number, ratio: number) { return a + (b - a) * ratio; }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`); return value; }
function positive(value: number, label: string) { const checked = finite(value, label); if (checked <= 0) throw new RangeError(`${label} must be greater than zero`); return checked; }
function nonnegative(value: number, label: string) { const checked = finite(value, label); if (checked < 0) throw new RangeError(`${label} must not be negative`); return checked; }
function integer(value: number, minimum: number, maximum: number, label: string) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`); return value; }
function unsigned(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be an unsigned 32-bit integer`); return value >>> 0; }
