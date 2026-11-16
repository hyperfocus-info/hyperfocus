import { clamp01 as unit } from "@hyperfocus/utilities/math";
import { map3 } from '@hyperfocus/utilities/tuples';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { createFrameRecordSelection } from '../../../frame/record-selection.ts';
import { atan2, cos, sin, sqrt } from '../../../math/simulation.ts';
import type { CombatEnvironment } from './config.ts';
import type { createCombatEnvironment } from './session.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
const positions = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity['position']>>();
const scales = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity['scale']>>();
const entityMaps = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity>>();


/** Bound authored dependencies; each frame still owns its mutable poses and rewind bases. */
export function createCombatEnvironmentPresenter(options: { definition: CombatEnvironment; entities: readonly { id: string }[] }) {
  const dependencies = new Set(options.definition.surfaces.flatMap(surface => [surface.entityId,
    ...(surface.revealIds ?? []), ...(surface.debrisIds ?? []), ...(surface.warningIds ?? []),
    ...(surface.hideIds ?? []), ...(surface.toolIds ?? []), ...(surface.stopMotionIds ?? [])]));
  const select = createFrameRecordSelection({ ids: options.entities.filter(entity => dependencies.has(entity.id)).map(entity => entity.id) });
  const frames = new WeakMap<Hyperfocus3DEvaluatedFrame, Hyperfocus3DEvaluatedFrame>();
  return (frame: Hyperfocus3DEvaluatedFrame, state: Parameters<typeof presentCombatEnvironment>[2]) => {
    let selected = frames.get(frame);
    if (!selected) { selected = { ...frame, entities: select(frame.entities) };frames.set(frame, selected); }
    presentCombatEnvironment(selected, options.definition, state);
  };
}

/** Cosmetic debris/tool motion; collision removal belongs entirely to the deterministic session. */
export function presentCombatEnvironment(frame: Hyperfocus3DEvaluatedFrame, definition: CombatEnvironment, state: ReturnType<ReturnType<typeof createCombatEnvironment>['capture']>) {
  let entities = entityMaps.get(frame);
  if (!entities) { entities = new Map(frame.entities.map(entity => [entity.id, entity]));entityMaps.set(frame, entities); }
  for (const stop of state.vehicleStops ?? []) {
    const surface = definition.surfaces.find(surface => surface.entityId === stop.entityId), root = entities.get(stop.entityId);
    if (!surface?.stopMotionIds || !root) continue;
    const from = [...root.position];
    const angle = stop.rotationY === undefined ? 0 : stop.rotationY - atan2(root.rotation[1], root.rotation[3]) * 2, c = cos(angle), s = sin(angle), q = sin(angle / 2), w = cos(angle / 2);
    for (const id of [root.id, ...surface.stopMotionIds]) {
      const part = entities.get(id);if (!part) continue;
      const dx = part.position[0] - from[0]!, dz = part.position[2] - from[2]!;
      part.position = [stop.position[0] + dx * c + dz * s, stop.position[1] + part.position[1] - from[1]!, stop.position[2] - dx * s + dz * c];
      const [x, y, z, qw] = part.rotation;part.rotation = [w * x + q * z, w * y + q * qw, w * z - q * x, w * qw - q * y];
    }
  }
  const phases = new Map(state.surfaces.map(surface => [surface.entityId, surface.phase]));
  let bases = positions.get(frame);
  if (!bases) { bases = new Map(frame.entities.map(entity => [entity.id, [...entity.position]]));positions.set(frame, bases); }
  let sizes = scales.get(frame);
  if (!sizes) { sizes = new Map(definition.surfaces.flatMap(surface => surface.debrisIds ?? []).flatMap((id): Array<[string, Entity['scale']]> => { const entity = entities.get(id);return entity ? [[id, [...entity.scale]]] : []; }));scales.set(frame, sizes); }
  for (const surface of definition.surfaces) {
    const phase = phases.get(surface.entityId)!;
    const entity = entities.get(surface.entityId);
    const removed = state.trace.find(event => event.entityId === surface.entityId && event.kind === 'removed');
    // Old snapshots without a trace show the settled state rather than repeatedly starting a burst.
    const age = removed ? Math.max(0, state.frame - removed.frame) : Infinity;
    let struck: (typeof state.trace)[number] | undefined;
    for (let index = state.trace.length - 1; index >= 0; index--) { const event = state.trace[index]!;if (event.entityId === surface.entityId && event.cause === 'impact' && event.kind === 'warning') { struck = event;break; } }
    if (entity && surface.trigger.kind === 'impact' && !surface.stopMotionIds) entity.position = [...bases.get(entity.id)!];
    if (entity && surface.trigger.kind === 'impact' && phase === 'warning' && struck) {
      const elapsed = state.frame - struck.frame;
      if (!surface.stopMotionIds) entity.position = [...bases.get(entity.id)!];
      if (elapsed >= 0 && elapsed < 10) entity.position[1] += (elapsed % 2 ? -.025 : .025) * (1 - elapsed / 10);
    }
    if (entity) entity.visible = phase !== 'removed' || !!surface.stopMotionIds;
    for (const id of surface.revealIds ?? []) {
      const feedback = entities.get(id);
      if (feedback) feedback.visible = phase === 'removed';
    }
    for (const [index, id] of (surface.debrisIds ?? []).entries()) {
      const debris = entities.get(id);
      if (!debris) continue;
      debris.visible = phase === 'removed' || surface.trigger.kind === 'impact' && phase === 'warning' && index < 3;
      const scale = sizes.get(id)!;debris.scale = phase === 'warning' ? map3(scale, value => value * .25) : [...scale];
      const rest = bases.get(id)!;
      debris.position = [...rest];
      if (entity && phase === 'removed' && age < 54) animateDebris(debris, entity, rest, index, surface.debrisIds!.length, age);
    }
    const tools = (surface.toolIds ?? []).flatMap(id => { const tool = entities.get(id);return tool ? [tool] : []; });
    const trigger = surface.trigger;
    if (entity && trigger.kind === 'scheduled' && tools.length) {
      const bottom = Math.min(...tools.map(tool => bases.get(tool.id)![1] - tool.scale[1]));
      const travel = Math.max(0, bottom - entity.position[1]);
      const cut = phase === 'intact' ? 0 : phase === 'warning' ? unit((state.frame - trigger.warningFrame) / (trigger.removeFrame - trigger.warningFrame)) : 1 - unit(age / 36);
      for (const tool of tools) tool.position[1] = bases.get(tool.id)![1] - travel * cut;
    }
    for (const id of surface.hideIds ?? []) {
      const hidden = entities.get(id);
      if (hidden) hidden.visible = phase !== 'removed';
    }
    for (const id of surface.warningIds ?? []) {
      const warning = entities.get(id);
      if (warning) warning.visible = surface.trigger.kind === 'impact' ? phase !== 'removed' : phase === 'warning' && state.frame % 30 < 22;
    }
  }
}

function animateDebris(debris: Entity, surface: Entity, rest: Entity['position'], index: number, count: number, age: number) {
  const axes = [0, 1, 2].sort((a, b) => surface.scale[b]! - surface.scale[a]!);
  const columns = Math.ceil(sqrt(count)), rows = Math.ceil(count / columns);
  const local: Entity['position'] = [0, 0, 0];
  local[axes[0]!] = ((index % columns + .5) / columns * 2 - 1) * surface.scale[axes[0]!] * .85;
  local[axes[1]!] = ((Math.floor(index / columns) + .5) / rows * 2 - 1) * surface.scale[axes[1]!] * .85;
  const [x, y, z, w] = surface.rotation, [lx, ly, lz] = local;
  const tx = 2 * (y * lz - z * ly), ty = 2 * (z * lx - x * lz), tz = 2 * (x * ly - y * lx);
  const start: Entity['position'] = [surface.position[0] + lx + w * tx + y * tz - z * ty, surface.position[1] + ly + w * ty + z * tx - x * tz, surface.position[2] + lz + w * tz + x * ty - y * tx];
  const duration = Math.max(18, Math.min(54, sqrt(2 * Math.max(.1, start[1] - rest[1]) / 9.81) * 60));
  const t = unit(age / duration), spread = 1 - (1 - t) * (1 - t);
  debris.position = [start[0] + (rest[0] - start[0]) * spread, start[1] + (rest[1] - start[1]) * t * t + 1.2 * t * (1 - t), start[2] + (rest[2] - start[2]) * spread];
}
