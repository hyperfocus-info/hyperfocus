import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { presentTelemetry } from './telemetry.ts';
import { particleRecipes, cosmeticLimits } from './direction.ts';

type Point = [number, number, number];
export type CosmeticEvent = { tick: number; point: Point; direction: Point; kind: 'step' | 'dash' | 'land' };

/** Pure event sampler shared by gameplay and wardrobe. Nothing emits from a rendering clock. */
export function sampleCosmeticParticles(style: string, event: CosmeticEvent, tick: number) {
  const recipe = particleRecipes.find(recipe => recipe.id === style);
  if (!recipe) throw new Error(`Unmapped particle style: ${style}`);
  if (style === 'relay') return []; // Status lights remain attached to visible hardware.
  const age = tick - event.tick;
  if (age < 0 || age >= recipe.lifetime) return [];
  const t = age / recipe.lifetime, fade = (1 - t) ** 1.4, travel = 1 - (1 - t) ** 2;
  const magnitude = Math.hypot(event.direction[0], event.direction[2]) || 1;
  const dx = event.direction[0] / magnitude, dz = event.direction[2] / magnitude;
  return Array.from({ length: recipe.count }, (_, index) => {
    const side = (index % 2 ? 1 : -1), lane = Math.floor(index / 2), angle = index * 2.399963 + event.tick * .37;
    const spread = recipe.reach * travel, lift = recipe.height * Math.sin(Math.PI * t);
    const across = style === 'classic' || style === 'embers' ? Math.cos(angle) * spread : side * (.025 + spread * .18);
    const behind = style === 'classic' || style === 'embers' ? Math.sin(angle) * spread : -.04 - spread * (.5 + lane * .3);
    const center: Point = [event.point[0] + dz * across + dx * behind, event.point[1] + .025 + lift, event.point[2] - dx * across + dz * behind];
    const direction: Point = style === 'embers' ? [Math.cos(angle) * .3, 1 - t * 1.6, Math.sin(angle) * .3] : style === 'classic' ? [0, 1, 0] : [dx, .06, dz];
    const length = Math.hypot(...direction) || 1;
    const x = direction[0] / length, y = direction[1] / length, z = direction[2] / length, q = Math.hypot(z, x, 1 + y);
    const rotation: [number, number, number, number] = q < .00001 ? [1, 0, 0, 0] : [z / q, 0, -x / q, (1 + y) / q];
    const segment = 1;
    const size: Point = style === 'classic' ? [recipe.width * fade, recipe.width * fade * .55, recipe.length * fade] : [recipe.width * fade, recipe.length * fade * segment, recipe.width * fade * .5];
    return { position: center, rotation, scale: size };
  });
}

export function presentCosmeticParticles(frame: Hyperfocus3DEvaluatedFrame, actorId: string, style: string, events: readonly CosmeticEvent[], tick: number, reducedMotion = false) {
  const last = events.filter(event => event.tick <= tick).at(-1);
  const age = last ? tick - last.tick : 24;
  presentTelemetry(frame, actorId, style === 'relay', age < 18 ? Math.sin(Math.PI * age / 18) ** 2 : 0, reducedMotion);
  const samples = reducedMotion ? [] : events.filter(event => event.tick <= tick).slice(-cosmeticLimits.eventsPerFighter).flatMap(event => sampleCosmeticParticles(style, event, tick));
  for (let index = 0; index < cosmeticLimits.particlesPerFighter; index++) {
    const entity = frame.entities.find(entity => entity.id === `${actorId}:dust:${index}`);if (!entity) continue;
    const sample = samples[index];entity.visible = !!sample;entity.variantId = style;
    if (sample) { entity.position = sample.position;entity.rotation = sample.rotation;entity.scale = sample.scale; }
    else entity.scale = [0, 0, 0];
  }
}

/** Bounded history, one update per simulation tick. Restores/teleports clear stale world anchors. */
export function createCosmeticEmitter() {
  let events: CosmeticEvent[] = [], lastTick = -1, lastPoint: Point | undefined, wasGrounded = true, wasDash = false, nextStep = 0;
  return {
    get events(): readonly CosmeticEvent[] { return events; },
    step(input: { tick: number; point: Point; foot: Point; grounded: boolean; dash: boolean; enabled: boolean }) {
      const { tick, point, foot, grounded, dash, enabled } = input;
      const distance = lastPoint ? Math.hypot(point[0] - lastPoint[0], point[2] - lastPoint[2]) : 0;
      if (tick < lastTick || tick - lastTick > 8 || distance > 2 || tick === lastTick && distance > .001) { events = [];lastPoint = undefined;nextStep = tick;wasGrounded = grounded;wasDash = dash; }
      if (tick === lastTick && distance <= .001) return;
      events = events.filter(event => tick - event.tick < cosmeticLimits.maximumLifetime);
      if (lastPoint && enabled && grounded) {
        const moved = distance > .015, kind = !wasGrounded ? 'land' : dash && !wasDash ? 'dash' : moved && tick >= nextStep ? 'step' : undefined;
        if (kind) { events.push({ tick, point: [...foot], direction: [point[0] - lastPoint[0], 0, point[2] - lastPoint[2]], kind });nextStep = tick + (kind === 'dash' ? 12 : 10); }
      }
      events = events.slice(-cosmeticLimits.eventsPerFighter);lastTick = tick;lastPoint = [...point];wasGrounded = grounded;wasDash = dash;
    },
  };
}
