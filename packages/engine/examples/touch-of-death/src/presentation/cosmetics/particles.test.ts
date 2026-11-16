import { expect, test } from 'bun:test';
import { validateDirectionEvidence } from '@hyperfocus/artifact-review/direction';
import { cosmeticLimits, particleRecipes, validateCosmeticRecipes } from './direction.ts';
import { createCosmeticEmitter, presentCosmeticParticles, sampleCosmeticParticles, type CosmeticEvent } from './particles.ts';
import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';

const event: CosmeticEvent = { tick: 10, point: [7, 3, -2], direction: [1, 0, 0], kind: 'step' };

test('all tiers fit their lifetime, spatial and density budgets; no NaNs, growing tails or future emission', () => {
  expect(validateCosmeticRecipes().assignments).toHaveLength(4);
  for (const recipe of particleRecipes) {
    for (let age = -1; age <= 25; age++) {
      const samples = sampleCosmeticParticles(recipe.id, event, event.tick + age);
      expect(samples.length).toBeLessThanOrEqual(4);
      if (age < 0 || age >= recipe.lifetime) expect(samples).toEqual([]);
      for (const particle of samples) {
        expect([...particle.position, ...particle.rotation, ...particle.scale].every(Number.isFinite)).toBe(true);
        expect(particle.scale.every(value => value >= 0)).toBe(true);
        expect(Math.hypot(particle.position[0] - 7, particle.position[2] + 2)).toBeLessThanOrEqual(cosmeticLimits.maximumReach);
        expect(particle.position[1]).toBeGreaterThanOrEqual(3);
        expect(particle.position[1] - 3).toBeLessThan(cosmeticLimits.maximumHeight);
        expect(Math.hypot(...particle.rotation)).toBeCloseTo(1, 8);
      }
    }
  }
  expect(() => validateCosmeticRecipes(particleRecipes.map(recipe => ({ ...recipe, count: 16 })))).toThrow('budget');
  expect(() => validateCosmeticRecipes(particleRecipes.map(recipe => ({ ...recipe, lifetime: NaN })))).toThrow('budget');
  expect(() => validateCosmeticRecipes(particleRecipes.slice(0, 3))).toThrow('four tiers');
});

test('fixed-tick emitter is bounded, anchored, silent at rest and resets after rollback or teleport', () => {
  const emitter = createCosmeticEmitter();
  const step = (tick: number, x: number, grounded = true) => emitter.step({ tick, point: [x, 1, 0], foot: [x, 0, 0], dash: false, grounded, enabled: true });
  for (let tick = 0; tick < 100; tick++) step(tick, 0);
  expect(emitter.events).toEqual([]);
  for (let tick = 100; tick < 125; tick++) { step(tick, (tick - 99) * .1);expect(emitter.events.length).toBeLessThanOrEqual(3); }
  const events = structuredClone(emitter.events);step(124, 2.5);expect(emitter.events).toEqual(events);
  step(125, 50);expect(emitter.events).toEqual([]);
  step(10, 0);expect(emitter.events).toEqual([]);
  step(11, .1, false);expect(emitter.events).toEqual([]);
  step(12, .2);expect(emitter.events[0]?.kind).toBe('land');
});

test('cosmetic choices never edit protected dash, impact, guard or tech cues; reduced motion suppresses decoration', () => {
  const entities = Array.from({ length: 12 }, (_, i): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: `actor:dust:${i}`, position: [0,0,0], scale: [1,1,1], rotation: [0,0,0,1], visible: true }));
  for (const suffix of ['trail:0', 'spark:0', 'guard', 'parry:0', 'art:torso']) entities.push({ ...structuredClone(entities[0]!), id: `actor:${suffix}` });
  const template: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'scene', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 2, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities, materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  for (const recipe of particleRecipes) {
    const frame = structuredClone(template);presentCosmeticParticles(frame, 'actor', recipe.id, [event], 14);
    expect(frame.entities.slice(12)).toEqual(template.entities.slice(12));
    const visible = frame.entities.slice(0,12).filter(entity => entity.visible);
    expect(visible).toHaveLength(recipe.id === 'relay' ? 0 : recipe.count);expect(visible.every(entity => entity.variantId === recipe.id)).toBe(true);
    presentCosmeticParticles(frame, 'actor', recipe.id, [event], 14, true);
    expect(frame.entities.slice(0,12).every(entity => !entity.visible)).toBe(true);
    expect(frame.entities.slice(12)).toEqual(template.entities.slice(12));
  }
  const invalid = structuredClone(template);
  expect(() => sampleCosmeticParticles('unknown-style', event, 14)).toThrow('Unmapped particle style: unknown-style');
  expect(() => Reflect.apply(presentCosmeticParticles, undefined, [invalid, 'actor', 'unknown-style', [event], 14])).toThrow('Unmapped particle style: unknown-style');
  for (const [events, reducedMotion] of [[[], false], [[event], true]] as const) {
    const quiet = structuredClone(template);
    Reflect.apply(presentCosmeticParticles, undefined, [quiet, 'actor', 'unknown-style', events, 14, reducedMotion]);
    expect(quiet.entities.slice(0, 12).every(entity => !entity.visible)).toBe(true);
    expect(quiet.entities.slice(12)).toEqual(template.entities.slice(12));
  }
});

test('a named recipe and a passing test cannot substitute for rendered evidence or grant approval', () => {
  const plan = validateCosmeticRecipes();
  expect(validateDirectionEvidence(plan, []).stage).toBe('ROUGH');
  const records = plan.assignments.map(assignment => ({ id: assignment.id, media: Object.fromEntries(plan.requiredEvidence.map(key => [key, `${assignment.id}-${key}.png`])), checks: [{ name: 'bounded sampler', passed: true }] }));
  expect(validateDirectionEvidence(plan, records).stage).toBe('CANDIDATE');
  delete records[0]!.media['contact-clip'];expect(validateDirectionEvidence(plan, records).stage).toBe('ROUGH');
});
