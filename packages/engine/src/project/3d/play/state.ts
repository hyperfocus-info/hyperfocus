import { requiredPlayPhases, playNumber, playObject, playVector, type PlayDefinition3D, type PlayPhase, type PlayVector } from './contracts.ts';
import { readPlayStateStructure3D } from './snapshot.ts';

export type PlayState3D = {
  tick: number; position: PlayVector; velocity: PlayVector; facing: number; yaw: number; pitch: number; grounded: boolean;
  coyote: number; buffer: number; anticipation: number; phase: PlayPhase; phaseAge: number; previousPhase: PlayPhase; previousAge: number; distance: number;
  cooldown: number; reload: number; ammo: number; reserve: number; health: number[]; collected: boolean[]; checkpoint: boolean; finished: boolean; cells: boolean[]; edits: number;
};
export function initialPlayState(def: PlayDefinition3D, position: PlayVector): PlayState3D {
  return { tick: 0, position: [...position], velocity: [0, 0, 0], facing: def.camera.yaw + Math.PI, yaw: def.camera.yaw, pitch: def.camera.pitch, grounded: false, coyote: 0, buffer: 0, anticipation: 0, phase: 'idle', phaseAge: 0, previousPhase: 'idle', previousAge: 0, distance: 0, cooldown: 0, reload: 0, ammo: def.shooter?.magazine ?? 0, reserve: def.shooter?.reserve ?? 0, health: def.shooter?.targets.map(t => t.health) ?? [], collected: def.collectathon?.items.map(() => false) ?? [], checkpoint: false, finished: false, cells: def.sandbox?.cells.map(c => c.solid) ?? [], edits: 0 };
}
export function setPlayPhase(state: PlayState3D, phase: PlayPhase) {
  if (state.phase !== phase) { state.previousPhase = state.phase;state.previousAge = state.phaseAge;state.phase = phase;state.phaseAge = 0; }
}
export function readPlayState(value: unknown, def: PlayDefinition3D): PlayState3D {
  const template = initialPlayState(def, [0, 0, 0]), raw = playObject(value, Object.keys(template));
  for (const key of ['grounded', 'checkpoint', 'finished'] as const) { if (typeof raw[key] !== 'boolean') throw new Error('Invalid play flag');template[key] = raw[key]; }
  for (const key of ['position', 'velocity'] as const) template[key] = playVector(raw[key]);
  for (const key of ['facing', 'yaw', 'pitch', 'distance'] as const) template[key] = playNumber(raw[key]);
  if (template.pitch < -.7 || template.pitch > 1.2 || template.distance < 0) throw new Error('Invalid saved camera/distance');
  for (const key of ['tick', 'coyote', 'buffer', 'anticipation', 'phaseAge', 'previousAge', 'cooldown', 'reload', 'ammo', 'reserve', 'edits'] as const) template[key] = playNumber(raw[key], 0, Number.MAX_SAFE_INTEGER, true);
  for (const key of ['phase', 'previousPhase'] as const) { const phase = requiredPlayPhases(def.genre).find(p => p === raw[key]);if (!phase) throw new Error('Unknown saved animation phase for this genre');template[key] = phase; }
  for (const key of ['collected', 'cells'] as const) { const items = raw[key];if (!Array.isArray(items) || items.length !== template[key].length || items.some(v => typeof v !== 'boolean')) throw new Error('Saved play content mismatch');template[key] = items.map(v => v === true); }
  const health = raw.health;if (!Array.isArray(health) || health.length !== template.health.length) throw new Error('Saved target mismatch');template.health = health.map((n, i) => playNumber(n, 0, def.shooter!.targets[i]!.health, true));
  if (template.ammo > (def.shooter?.magazine ?? 0) || template.reserve > (def.shooter?.reserve ?? 0) || template.reload > (def.shooter?.reloadTicks ?? 0) || template.cooldown > Math.max(def.shooter?.fireTicks ?? 0, 12)) throw new Error('Invalid saved interaction state');
  return readPlayStateStructure3D(template);
}
