import { expect, test } from 'bun:test';
import { createParticleSystem3D } from './emitter.ts';
import type { ParticleRecipe3D, ParticleSample3D } from './contracts.ts';
import { validateParticleRecipe3D } from './contracts.ts';

export const particleFixture = (): ParticleRecipe3D => ({ capacity: 64, seed: 42, space: 'world', lifetime: [1, 2], speed: [1, 3], size: [.05, .2], shape: { kind: 'sphere', radius: .1 }, direction: [0, 1, 0], spreadRadians: .5, gravity: [0, -9.81, 0], drag: .1, sizeOverLife: [[0, 1], [1, 0]], colorOverLife: [[0, [1, .5, .2, 1]], [1, [.3, .1, .1, 0]]], rotation: [0, 3], angularVelocity: [-2, 2] });
const samples = (system: ReturnType<typeof createParticleSystem3D>) => { const output: ParticleSample3D[] = [];system.forEach(p => output.push(structuredClone(p)));return output; };

test('fixed particle clock is independent of render calls and caller frame partition', () => {
  const a = createParticleSystem3D(particleFixture()), b = createParticleSystem3D(particleFixture());a.setRate(24);b.setRate(24);
  for (let i = 0; i < 30; i++) { a.step(0.016666666666666666);samples(a);samples(a); }
  for (let i = 0; i < 15; i++) b.step(0.03333333333333333);
  expect(a.snapshot()).toEqual(b.snapshot());expect(a.count).toBe(12);
  const before = a.snapshot();samples(a);samples(a);expect(a.snapshot()).toEqual(before);
});
test('snapshot restore preserves subsequent births and rejects malformed state atomically', () => {
  const a = createParticleSystem3D(particleFixture());a.emit(12);a.step(.25);const before = a.snapshot();
  a.emit(10);a.step(.1);const later = a.snapshot();a.restore(before);a.emit(10);a.step(.1);expect(a.snapshot()).toEqual(later);
  const broken = structuredClone(before);broken.particles[0]!.values[0] = Infinity;
  expect(() => a.restore(broken)).toThrow('Invalid particle snapshot');expect(a.snapshot()).toEqual(later);
});

test('portable recipe key ordering does not invalidate a saved effect; shape-specific unknown fields reject', () => {
  const recipe = particleFixture(), a = createParticleSystem3D(recipe);a.emit(3);a.step(.1);
  const reordered = validateParticleRecipe3D(Object.fromEntries(Object.entries(recipe).reverse()));
  expect(Object.keys(reordered)).toEqual(Object.keys(recipe).reverse());
  const b = createParticleSystem3D(reordered);
  b.restore(a.snapshot());expect(b.snapshot()).toEqual(a.snapshot());
  expect(() => Reflect.apply(createParticleSystem3D, undefined, [{ ...recipe, shape: { kind: 'point', radius: 3 } }])).toThrow('Unknown particle field');
});
test('world particles stay at their spawn while local particles follow rotated emitter transforms', () => {
  const recipe = particleFixture();recipe.speed = [0, 0];recipe.shape = { kind: 'point' };
  const world = createParticleSystem3D(recipe), local = createParticleSystem3D({ ...recipe, space: 'local' });
  for (const system of [world, local]) { system.setTransform({ position: [1, 2, 3] });system.emit(1);system.setTransform({ position: [4, 5, 6], rotation: [0, 1, 0, 0] }); }
  expect(samples(world)[0]!.position).toEqual([1, 2, 3]);expect(samples(local)[0]!.position).toEqual([4, 5, 6]);
});
test('capacity overflow is explicit and seeded restart restores the initial effect', () => {
  const system = createParticleSystem3D(particleFixture());expect(system.emit(80)).toBe(64);expect(system.diagnostics.dropped).toBe(16);
  const first = samples(system);system.reset();system.emit(64);expect(samples(system)).toEqual(first);
  for (let i = 0; i < 9; i++) system.step(.25);expect(system.count).toBe(0);
});
test('swept particle collisions stop fast particles crossing a support plane', () => {
  const recipe = particleFixture();recipe.shape = { kind: 'point' };recipe.direction = [0, -1, 0];recipe.spreadRadians = 0;recipe.speed = [50, 50];recipe.gravity = [0, 0, 0];recipe.collision = { response: 'bounce', restitution: .4, friction: .2, maxBounces: 2 };
  const system = createParticleSystem3D(recipe, { sweep: (from, to, radius) => from[1] >= radius && to[1] < radius ? { fraction: (from[1] - radius) / (from[1] - to[1]), normal: [0, 1, 0] } : undefined });
  system.emit(1, { position: [0, .2, 0] });system.step(0.016666666666666666);
  expect(system.diagnostics.collisions).toBe(1);expect(samples(system)[0]!.position[1]).toBeGreaterThan(0);expect(samples(system)[0]!.velocity[1]).toBeGreaterThan(0);
});
test('atlas, color and size are sampled across lifetime instead of shrinking a constant-colored mesh', () => {
  const recipe = particleFixture();recipe.lifetime = [1, 1];recipe.atlas = { columns: 4, rows: 2, cycles: 1 };recipe.size = [1, 1];
  const system = createParticleSystem3D(recipe);system.emit(1);system.step(.25);const particle = samples(system)[0]!;
  expect(particle.color[3]).toBeCloseTo(.75);expect(particle.size).toBeCloseTo(.75);expect(particle.uv[2]).toBe(.25);expect(particle.uv[3]).toBe(.5);
});
