import { particleInteger, particleNumber, validateParticleRecipe3D, vector, type ParticleDiagnostics3D, type ParticleRecipe3D, type ParticleSample3D, type ParticleSweep3D, type ParticleTransform3D, type ParticleVector3 } from './contracts.ts';
import { particleCone3D, particleDelta, particleTransform, randomParticle3D, rotateParticleVector, sampleParticleCurve3D, sampleParticleGradient3D } from './sample.ts';
import { particleSnapshotStructure } from './structure.ts';
import { readParticleSnapshot3D } from './snapshot.ts';
import { canonicalSaveJson } from '../../save/index.ts';

const STRIDE = 14, FIXED_DELTA = 0.008333333333333333;
export type ParticleSnapshot3D = { version: 1; recipe: string; seed: number; accumulator: number; emission: number; rate: number; anchor: Required<ParticleTransform3D>; free: number[]; particles: Array<{ slot: number; values: number[] }>; diagnostics: ParticleDiagnostics3D };

/** Fixed storage and fixed simulation clock. Rendering never emits, advances or mutates particles. */
export function createParticleSystem3D(input: ParticleRecipe3D, options: { sweep?: ParticleSweep3D } = {}) {
  const recipe = validateParticleRecipe3D(input), signature = canonicalSaveJson(JSON.parse(JSON.stringify(recipe))), data = new Float64Array(recipe.capacity * STRIDE), active = new Uint8Array(recipe.capacity), free: number[] = [];
  const random = { seed: recipe.seed }, diagnostics: ParticleDiagnostics3D = { emitted: 0, dropped: 0, expired: 0, collisions: 0, steps: 0, highWater: 0 };
  let count = 0, accumulator = 0, emission = 0, rate = 0, anchor = particleTransform({ position: [0, 0, 0] });
  if (recipe.collision && !options.sweep) throw new Error('Collision particles require an explicit swept collision provider');
  const scratch: ParticleSample3D = { slot: 0, position: [0, 0, 0], velocity: [0, 0, 0], size: 0, rotation: 0, color: [1, 1, 1, 1], uv: [0, 0, 1, 1], progress: 0 };
  const next: ParticleVector3 = [0, 0, 0], from: ParticleVector3 = [0, 0, 0], velocity: ParticleVector3 = [0, 0, 0];
  const randomRange = (range: [number, number]) => range[0] + (range[1] - range[0]) * randomParticle3D(random);
  reset();
  function reset() {
    data.fill(0);active.fill(0);free.length = 0;for (let i = recipe.capacity - 1; i >= 0; i--) free.push(i);
    count = 0;accumulator = 0;emission = 0;rate = 0;random.seed = recipe.seed;anchor = particleTransform({ position: [0, 0, 0] });
    for (const key of Object.keys(diagnostics)) Reflect.set(diagnostics, key, 0);
  }
  function kill(slot: number) { active[slot] = 0;free.push(slot);count--;diagnostics.expired++; }
  function emit(requested: number, transform: ParticleTransform3D = anchor, inherit: ParticleVector3 = [0, 0, 0]) {
    particleInteger(requested, 0, 65536, 'emit count');const origin = particleTransform(transform);vector(inherit, 'inherited velocity');
    const accepted = Math.min(requested, free.length);diagnostics.dropped += requested - accepted;
    for (let i = 0; i < accepted; i++) {
      const slot = free.pop()!, at = slot * STRIDE, position = spawnPosition(), direction = particleCone3D(recipe.direction, recipe.spreadRadians, randomParticle3D(random), randomParticle3D(random)), speed = randomRange(recipe.speed);
      if (recipe.space === 'world') { rotateParticleVector(position, origin.rotation, position);rotateParticleVector(direction, origin.rotation, direction); }
      for (let axis = 0; axis < 3; axis++) { data[at + axis] = position[axis]! + (recipe.space === 'world' ? origin.position[axis]! : 0);data[at + 3 + axis] = direction[axis]! * speed + inherit[axis]!; }
      data[at + 6] = 0;data[at + 7] = randomRange(recipe.lifetime);data[at + 8] = randomRange(recipe.size);data[at + 9] = randomRange(recipe.rotation);data[at + 10] = randomRange(recipe.angularVelocity);
      data[at + 11] = recipe.atlas?.randomStart ? randomParticle3D(random) : 0;data[at + 12] = 0;data[at + 13] = randomParticle3D(random) * Math.PI * 2;active[slot] = 1;
    }
    count += accepted;diagnostics.emitted += accepted;diagnostics.highWater = Math.max(diagnostics.highWater, count);return accepted;
  }
  function spawnPosition(): ParticleVector3 {
    const shape = recipe.shape;
    if (shape.kind === 'point') return [0, 0, 0];
    if (shape.kind === 'box') return [randomRange([-shape.halfExtents[0], shape.halfExtents[0]]), randomRange([-shape.halfExtents[1], shape.halfExtents[1]]), randomRange([-shape.halfExtents[2], shape.halfExtents[2]])];
    const angle = randomParticle3D(random) * Math.PI * 2;
    if (shape.kind === 'ring') { const inner = shape.radius - shape.thickness, radius = Math.sqrt(inner * inner + randomParticle3D(random) * (shape.radius * shape.radius - inner * inner));return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]; }
    const y = randomParticle3D(random) * 2 - 1, radius = shape.radius * (shape.surface ? 1 : Math.cbrt(randomParticle3D(random))), ring = Math.sqrt(Math.max(0, 1 - y * y));
    return [Math.cos(angle) * ring * radius, y * radius, Math.sin(angle) * ring * radius];
  }
  function fixedStep() {
    diagnostics.steps++;
    emission += rate * FIXED_DELTA;const births = Math.floor(emission + 1e-10);emission -= births;if (births) emit(births);
    const attenuation = Math.exp(-recipe.drag * FIXED_DELTA);
    for (let slot = 0; slot < recipe.capacity; slot++) {
      if (!active[slot]) continue;const at = slot * STRIDE;data[at + 6] += FIXED_DELTA;
      if (data[at + 6]! >= data[at + 7]!) { kill(slot);continue; }
      for (let axis = 0; axis < 3; axis++) {
        const noise = recipe.turbulence ? Math.sin(data[at + 13]! + axis * 2.0943951023931953 + data[at + 6]! * recipe.turbulence.frequency) * recipe.turbulence.strength : 0;
        from[axis] = data[at + axis]!;velocity[axis] = (data[at + 3 + axis]! + (recipe.gravity[axis]! + noise) * FIXED_DELTA) * attenuation;next[axis] = from[axis]! + velocity[axis]! * FIXED_DELTA;
      }
      const radius = data[at + 8]! * sampleParticleCurve3D(recipe.sizeOverLife, data[at + 6]! / data[at + 7]!) * .5;
      const hit = recipe.collision ? options.sweep!(from, next, radius) : undefined;
      if (hit) {
        particleNumber(hit.fraction, 0, 1, 'collision fraction');vector(hit.normal, 'collision normal');
        if (hit.position) vector(hit.position, 'collision resolved position');
        if (Math.abs(Math.hypot(...hit.normal) - 1) > .001) throw new Error('Collision normal must have unit length');
        diagnostics.collisions++;data[at + 12]++;
        if (recipe.collision!.response === 'kill' || data[at + 12]! > recipe.collision!.maxBounces) { kill(slot);continue; }
        const normalSpeed = velocity[0] * hit.normal[0] + velocity[1] * hit.normal[1] + velocity[2] * hit.normal[2];
        for (let axis = 0; axis < 3; axis++) {
          next[axis] = (hit.position?.[axis] ?? from[axis]! + (next[axis]! - from[axis]!) * hit.fraction) + hit.normal[axis]! * .00001;
          const tangent = velocity[axis]! - normalSpeed * hit.normal[axis]!;
          velocity[axis] = tangent * (1 - recipe.collision!.friction) + (normalSpeed < 0 ? -normalSpeed * recipe.collision!.restitution : normalSpeed) * hit.normal[axis]!;
        }
      }
      for (let axis = 0; axis < 3; axis++) { data[at + axis] = next[axis]!;data[at + 3 + axis] = velocity[axis]!; }
      data[at + 9] += data[at + 10]! * FIXED_DELTA;
    }
  }
  function sample(slot: number, out: ParticleSample3D) {
    const at = slot * STRIDE, progress = data[at + 6]! / data[at + 7]!;out.slot = slot;out.progress = progress;
    for (let i = 0; i < 3; i++) { out.position[i] = data[at + i]!;out.velocity[i] = data[at + 3 + i]!; }
    if (recipe.space === 'local') {
      rotateParticleVector(out.position, anchor.rotation, out.position);rotateParticleVector(out.velocity, anchor.rotation, out.velocity);
      for (let i = 0; i < 3; i++) out.position[i] += anchor.position[i]!;
    }
    out.size = data[at + 8]! * sampleParticleCurve3D(recipe.sizeOverLife, progress);out.rotation = data[at + 9]!;
    sampleParticleGradient3D(recipe.colorOverLife, progress, out.color);
    const atlas = recipe.atlas;
    if (atlas) {
      const cells = atlas.columns * atlas.rows, frame = Math.min(cells - 1, Math.floor(((progress * atlas.cycles + data[at + 11]!) % 1) * cells));
      out.uv[0] = frame % atlas.columns / atlas.columns;out.uv[1] = Math.floor(frame / atlas.columns) / atlas.rows;out.uv[2] = 1 / atlas.columns;out.uv[3] = 1 / atlas.rows;
    }
  }
  function snapshot(): ParticleSnapshot3D {
    return { version: 1, recipe: signature, seed: random.seed, accumulator, emission, rate, anchor: structuredClone(anchor), free: [...free], particles: Array.from(active.entries()).filter(([, on]) => on).map(([slot]) => ({ slot, values: Array.from(data.subarray(slot * STRIDE, (slot + 1) * STRIDE)) })), diagnostics: { ...diagnostics } };
  }
  function restore(saved: unknown) {
    if (!particleSnapshotStructure(saved)) throw new Error('Invalid particle snapshot structure');
    if (saved.version !== 1 || saved.recipe !== signature || saved.free.length + saved.particles.length !== recipe.capacity) throw new Error('Particle snapshot recipe/capacity mismatch');
    particleInteger(saved.seed, 0, 4294967295, 'saved seed');particleNumber(saved.accumulator, 0, FIXED_DELTA, 'saved accumulator');particleNumber(saved.emission, -.000001, 1, 'saved emission');particleNumber(saved.rate, 0, 65536, 'saved rate');
    const transform = particleTransform(saved.anchor), slots = [...saved.free, ...saved.particles.map(p => p.slot)];
    slots.forEach(slot => particleInteger(slot, 0, recipe.capacity - 1, 'saved slot'));if (new Set(slots).size !== recipe.capacity) throw new Error('Duplicate snapshot slots');
    for (const particle of saved.particles) {
      if (particle.values.length !== STRIDE || particle.values.some(n => !Number.isFinite(n) || Math.abs(n) > 1000000000) || particle.values[6]! < 0 || particle.values[7]! <= particle.values[6]! || particle.values[8]! <= 0) throw new Error('Invalid particle snapshot state');
    }
    for (const key of Object.keys(diagnostics)) particleInteger(Reflect.get(saved.diagnostics, key), 0, Number.MAX_SAFE_INTEGER, 'saved diagnostic');
    readParticleSnapshot3D(saved);
    data.fill(0);active.fill(0);free.splice(0, free.length, ...saved.free);
    for (const p of saved.particles) { data.set(p.values, p.slot * STRIDE);active[p.slot] = 1; }
    count = saved.particles.length;random.seed = saved.seed;accumulator = saved.accumulator;emission = saved.emission;rate = saved.rate;anchor = transform;Object.assign(diagnostics, saved.diagnostics);
  }
  return {
    get recipe() { return structuredClone(recipe); }, get diagnostics() { return { ...diagnostics }; }, numericStorageBytes: data.byteLength + active.byteLength,
    get count() { return count; }, emit, reset, snapshot, restore,
    setTransform(transform: ParticleTransform3D) { anchor = particleTransform(transform); },
    setRate(value: number) { rate = particleNumber(value, 0, 65536, 'emission rate'); },
    step(delta: number) { accumulator += particleDelta(delta);while (accumulator + 1e-12 >= FIXED_DELTA) { fixedStep();accumulator = Math.max(0, accumulator - FIXED_DELTA); }if (accumulator < 1e-12) accumulator = 0;return count; },
    /** Sample storage is borrowed for this callback only. Copy retained values. */
    forEach(visit: (particle: Readonly<ParticleSample3D>) => void) { for (let slot = 0; slot < recipe.capacity; slot++) if (active[slot]) { sample(slot, scratch);visit(scratch); } },
  };
}
export type ParticleSystem3D = ReturnType<typeof createParticleSystem3D>;
