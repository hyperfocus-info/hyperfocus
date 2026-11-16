import { particleRecipeStructure } from './structure.ts';
/** Renderer-neutral, JSON-serializable particle recipes. Distances are metres, time is seconds. */
export type ParticleVector3 = [number, number, number];
export type ParticleColor = [number, number, number, number];
export type ParticleCurve = Array<[number, number]>;
export type ParticleGradient = Array<[number, ParticleColor]>;
export type ParticleShape3D =
  | { kind: 'point' }
  | { kind: 'sphere'; radius: number; surface?: boolean }
  | { kind: 'box'; halfExtents: ParticleVector3 }
  | { kind: 'ring'; radius: number; thickness: number };
export type ParticleRecipe3D = {
  capacity: number;
  seed: number;
  space: 'world' | 'local';
  lifetime: [number, number];
  speed: [number, number];
  size: [number, number];
  shape: ParticleShape3D;
  direction: ParticleVector3;
  spreadRadians: number;
  gravity: ParticleVector3;
  drag: number;
  /** Bounded smooth directional disturbance; not a fluid solver. */
  turbulence?: { strength: number; frequency: number };
  sizeOverLife: ParticleCurve;
  colorOverLife: ParticleGradient;
  rotation: [number, number];
  angularVelocity: [number, number];
  /** The renderer samples a regular atlas. Omit for a single texture. */
  atlas?: { columns: number; rows: number; cycles: number; randomStart?: boolean };
  collision?: { restitution: number; friction: number; maxBounces: number; response: 'bounce' | 'kill' };
};
export type ParticleTransform3D = { position: ParticleVector3; rotation?: [number, number, number, number] };
export type ParticleSweep3D = (from: Readonly<ParticleVector3>, to: Readonly<ParticleVector3>, radius: number) => { fraction: number; normal: ParticleVector3; /** Optional resolved centre for initial overlaps. */ position?: ParticleVector3 } | undefined;
export type ParticleDiagnostics3D = { emitted: number; dropped: number; expired: number; collisions: number; steps: number; highWater: number };
export type ParticleSample3D = { slot: number; position: ParticleVector3; velocity: ParticleVector3; size: number; rotation: number; color: ParticleColor; uv: [number, number, number, number]; progress: number };

export function particleNumber(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be finite from ${min} to ${max}`);
  return value;
}
export function particleInteger(value: number, min: number, max: number, name: string) {
  particleNumber(value, min, max, name);if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be an integer`);return value;
}
export function validateParticleRecipe3D(input: unknown): ParticleRecipe3D {
  if (!particleRecipeStructure(input)) throw new Error('Invalid particle recipe structure');
  const recipe = structuredClone(input);
  particleInteger(recipe.capacity, 1, 65536, 'capacity');particleInteger(recipe.seed, 0, 4294967295, 'seed');
  if (!['world', 'local'].includes(recipe.space)) throw new Error('Unknown particle space');
  const range = (values: number[], min: number, max: number, name: string) => {
    if (values.length !== 2 || values[0]! > values[1]!) throw new Error(`Invalid ${name} range`);
    values.forEach(value => particleNumber(value, min, max, name));
  };
  range(recipe.lifetime, .001, 120, 'lifetime');range(recipe.speed, 0, 1000, 'speed');range(recipe.size, .00001, 1000, 'size');
  range(recipe.rotation, -1000, 1000, 'rotation');range(recipe.angularVelocity, -1000, 1000, 'angularVelocity');
  vector(recipe.direction, 'direction');vector(recipe.gravity, 'gravity');
  if (Math.hypot(...recipe.direction) < .000001) throw new Error('Particle direction must be nonzero');
  particleNumber(recipe.spreadRadians, 0, Math.PI, 'spreadRadians');particleNumber(recipe.drag, 0, 100, 'drag');
  if (recipe.turbulence) { particleNumber(recipe.turbulence.strength, 0, 100, 'turbulence.strength');particleNumber(recipe.turbulence.frequency, .001, 100, 'turbulence.frequency'); }
  if (recipe.shape.kind === 'sphere' || recipe.shape.kind === 'ring') particleNumber(recipe.shape.radius, 0, 1000, 'shape.radius');
  if (recipe.shape.kind === 'ring') particleNumber(recipe.shape.thickness, 0, recipe.shape.radius, 'shape.thickness');
  else if (recipe.shape.kind === 'box') { vector(recipe.shape.halfExtents, 'shape.halfExtents');if (recipe.shape.halfExtents.some(v => v < 0)) throw new Error('Shape extents must be nonnegative'); }
  else if (recipe.shape.kind !== 'point' && recipe.shape.kind !== 'sphere') throw new Error('Unknown particle shape');
  curve(recipe.sizeOverLife, 'sizeOverLife');recipe.sizeOverLife.forEach(([, value]) => particleNumber(value, 0, 100, 'size multiplier'));
  curve(recipe.colorOverLife, 'colorOverLife');
  recipe.colorOverLife.forEach(([, color]) => { if (color.length !== 4) throw new Error('Particle color needs RGBA');color.forEach(value => particleNumber(value, 0, 1, 'color')); });
  if (recipe.atlas) {
    particleInteger(recipe.atlas.columns, 1, 64, 'atlas.columns');particleInteger(recipe.atlas.rows, 1, 64, 'atlas.rows');particleNumber(recipe.atlas.cycles, 0, 100, 'atlas.cycles');
  }
  if (recipe.collision) {
    particleNumber(recipe.collision.restitution, 0, 1, 'restitution');particleNumber(recipe.collision.friction, 0, 1, 'friction');particleInteger(recipe.collision.maxBounces, 0, 32, 'maxBounces');
    if (!['bounce', 'kill'].includes(recipe.collision.response)) throw new Error('Unknown collision response');
    if (recipe.space === 'local') throw new Error('Collision requires world-space particles');
  }
  return recipe;
}
export function vector(value: readonly number[], name: string): asserts value is ParticleVector3 {
  if (value.length !== 3) throw new Error(`${name} needs three coordinates`);
  value.forEach(part => particleNumber(part, -1000000, 1000000, name));
}
function curve(values: Array<[number, unknown]>, name: string) {
  if (values.length < 2 || values.length > 16 || values[0]![0] !== 0 || values.at(-1)![0] !== 1) throw new Error(`${name} needs 2–16 keys including 0 and 1`);
  values.forEach(([time], i) => { particleNumber(time, 0, 1, name);if (i && values[i - 1]![0] >= time) throw new Error(`${name} keys must increase`); });
}
