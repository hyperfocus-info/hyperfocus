import { hypot } from '../../../math/simulation.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { CombatProject3D } from '../combat-declaration.ts';
import type { CombatAudioEmitter } from './emitter.ts';
import type { CombatAudioCue3D } from '../combat-audio-config.ts';

/** Only real nearby moving sources emit finite grains; there is no global city bed. */
export function createCombatEnvironmentAudio(options: { definition: CombatProject3D; runtime: Hyperfocus3DRuntime; emitter: CombatAudioEmitter; inactive?: (id: string) => boolean }) {
  const { definition, runtime, emitter } = options;
  const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
  const traffic = new Set(definition.environment?.traffic?.map(item => item.entityId));
  // A nontraffic stop-motion root declares a powered machine and its linked
  // parts. Generic animated props, lift scenery and vehicle cabins are not motors.
  const machines = definition.environment?.surfaces.filter(surface => surface.stopMotionIds?.length && !traffic.has(surface.entityId)).map(surface => scene.entities.find(entity => entity.id === surface.entityId)).filter(entity => entity?.animation && entity.physics?.type === 'static') ?? [];
  let lastFrame = -1;
  const vehicles = new Map<string, { x: number; y: number; z: number; speed: number; brakeAt: number }>();
  const motors = new Map<string, { x: number; y: number; z: number }>();
  const capture = () => ({ lastFrame, vehicles: [...vehicles].map(([id, memory]) => ({ id, ...memory })), motors: [...motors].map(([id, memory]) => ({ id, ...memory })) });
  return { capture,
    restore(saved: ReturnType<typeof capture>) { lastFrame = saved.lastFrame;vehicles.clear();motors.clear();for (const { id, ...memory } of saved.vehicles) vehicles.set(id, memory);for (const { id, ...memory } of saved.motors) motors.set(id, memory); },
    reset() { lastFrame = -1;vehicles.clear();motors.clear(); },
    step(state: CombatSnapshot, phase: string) {
      if (state.frame <= lastFrame || phase !== 'fighting' && phase !== 'practice') return;
      const elapsed = lastFrame < 0 ? 1 : state.frame - lastFrame;lastFrame = state.frame;
      const listener = emitter.listener(state.fighters, definition.fighters.find(binding => binding.control === 'player')?.entityId);
      if (!listener) return;
      const grains: Array<{ id: string; key: CombatAudioCue3D; distance: number; radius: number; strength: number }> = [];
      for (const id of traffic) {
        const body = runtime.physics.body(id);if (!body) continue;
        const memory = vehicles.get(id), speed = memory ? hypot(body.x - memory.x, body.y - memory.y, body.z - memory.z) * 60 / elapsed : hypot(body.velocityX, body.velocityY, body.velocityZ);
        const distance = hypot(body.x - listener.position.x, body.y - listener.position.y, body.z - listener.position.z), nearby = distance < 16 && body.collisionMask !== 0 && !options.inactive?.(id);
        const brakeAt = memory?.brakeAt ?? -Infinity;
        if (nearby && memory && memory.speed >= 3 && speed < .5 && state.frame - brakeAt >= 90 && emitter.has('trafficBrake')) grains.push({ id, key: 'trafficBrake', distance, radius: 16, strength: .3 });
        else if (nearby && speed >= 2 && state.frame % 30 === 0 && emitter.has('trafficPass')) grains.push({ id, key: 'trafficPass', distance, radius: 16, strength: .22 });
        vehicles.set(id, { x: body.x, y: body.y, z: body.z, speed, brakeAt: nearby && memory && memory.speed >= 3 && speed < .5 ? state.frame : brakeAt });
      }
      for (const entity of machines) {
        if (!entity) continue;
        const body = runtime.physics.body(entity.id);if (!body) continue;
        const previous = motors.get(entity.id), moving = previous && hypot(body.x - previous.x, body.y - previous.y, body.z - previous.z) > .0001 * elapsed;
        motors.set(entity.id, { x: body.x, y: body.y, z: body.z });
        if (!moving || body.collisionMask === 0 || options.inactive?.(entity.id) || state.frame % 60 !== 0 || !emitter.has('machinery')) continue;
        const distance = hypot(body.x - listener.position.x, body.y - listener.position.y, body.z - listener.position.z);
        if (distance < 12) grains.push({ id: entity.id, key: 'machinery', distance, radius: 12, strength: .35 });
      }
      grains.sort((a, b) => a.distance - b.distance || ((a.id ?? '') < (b.id ?? '') ? -1 : (a.id ?? '') > (b.id ?? '') ? 1 : 0));
      for (const grain of grains.slice(0, 2)) emitter.ambient(grain.key, grain.id, grain.strength * (1 - grain.distance / grain.radius) ** 2);
    },
  };
}
