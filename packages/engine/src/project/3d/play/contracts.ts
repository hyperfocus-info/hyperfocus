import { requireText } from "@hyperfocus/utilities/text";
import { validateParticleRecipe3D, type ParticleRecipe3D } from '../../../effects/particles3d/contracts.ts';
import type { Hyperfocus3DDeclaration, Hyperfocus3DDiagnostic } from '../declaration.ts';

export type PlayVector = [number, number, number];
export const PLAY_PHASES = ['idle', 'start', 'move', 'stop', 'turn', 'anticipate', 'rise', 'fall', 'land', 'aim', 'aimMove', 'fire', 'reload', 'edit', 'celebrate'] as const;
export type PlayPhase = typeof PLAY_PHASES[number];
export const PLAY_EVENTS = ['jump', 'land', 'fire', 'hit', 'reload', 'break', 'place', 'collect', 'checkpoint', 'finish', 'reset'] as const;
export type PlayEvent = typeof PLAY_EVENTS[number];
export type PlayBox = { entityId: string; center: PlayVector; halfSize: PlayVector };
export type PlayDefinition3D = {
  version: 1; genre: 'shooter' | 'sandbox' | 'collectathon'; player: string;
  movement: { radius: number; height: number; speed: number; acceleration: number; gravity: number; jumpSpeed: number; anticipationTicks: number; coyoteTicks: number; bufferTicks: number; resetY: number };
  camera: { distance: number; height: number; shoulder: number; yaw: number; pitch: number; turnSpeed: number; clearance: number };
  colliders: PlayBox[];
  animation: { mode: 'proxy' } | { mode: 'clips'; clips: Partial<Record<PlayPhase, string>>; stride: number; blendTicks: number };
  shooter?: { targets: Array<{ entityId: string; halfSize: PlayVector; health: number }>; magazine: number; reserve: number; fireTicks: number; reloadTicks: number; range: number; muzzle: PlayVector };
  sandbox?: { origin: PlayVector; size: PlayVector; cellSize: number; cells: Array<{ entityId: string; cell: PlayVector; solid: boolean }>; reach: number };
  collectathon?: { items: string[]; checkpoint: string; destination: string; radius: number };
  effects: Array<{ id: string; event: PlayEvent; materialId: string; meshId?: string; facing: 'camera' | 'velocity' | 'mesh'; count: number; recipe: ParticleRecipe3D }>;
};
export function playObject(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a play object');
  if (keys) for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error('Unknown play field: ' + key);
  return Object.fromEntries(Object.entries(value));
}
export function playNumber(value: unknown, min = -100000, max = 100000, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) throw new Error('Play value must be finite and bounded');return value;
}
export function playVector(value: unknown, min = -100000, max = 100000, integer = false): PlayVector {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Expected a play vector');return [playNumber(value[0], min, max, integer), playNumber(value[1], min, max, integer), playNumber(value[2], min, max, integer)];
}
function text(value: unknown): string { return requireText(value, { min: 1, max: 160, message: "Expected a play identifier" }); }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error('Play list exceeds its budget');return value; }
function choice<T extends string>(value: unknown, choices: readonly T[]): T { for (const item of choices) if (value === item) return item;throw new Error('Unknown play choice: ' + value); }
function flag(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Expected a play boolean');return value; }
export function readPlayDefinition3D(input: unknown): PlayDefinition3D | undefined {
  if (input === undefined) return;
  const p = playObject(input, ['version', 'genre', 'player', 'movement', 'camera', 'colliders', 'animation', 'shooter', 'sandbox', 'collectathon', 'effects']);
  if (p.version !== 1) throw new Error('Unknown play version');
  const m = playObject(p.movement, ['radius', 'height', 'speed', 'acceleration', 'gravity', 'jumpSpeed', 'anticipationTicks', 'coyoteTicks', 'bufferTicks', 'resetY']);
  const c = playObject(p.camera, ['distance', 'height', 'shoulder', 'yaw', 'pitch', 'turnSpeed', 'clearance']);
  const a = playObject(p.animation, ['mode', 'clips', 'stride', 'blendTicks']);
  const animation: PlayDefinition3D['animation'] = a.mode === 'proxy' ? { mode: 'proxy' } : {
    mode: choice(a.mode, ['clips']), clips: readPhaseClips(a.clips), stride: playNumber(a.stride, .01, 20), blendTicks: playNumber(a.blendTicks, 1, 60, true),
  };
  if (a.mode === 'proxy' && Object.keys(a).length !== 1) throw new Error('Proxy animation has no authored clip fields');
  const result: PlayDefinition3D = {
    version: 1, genre: choice(p.genre, ['shooter', 'sandbox', 'collectathon']), player: text(p.player), animation,
    movement: { radius: playNumber(m.radius, .05, 5), height: playNumber(m.height, .1, 10), speed: playNumber(m.speed, .1, 40), acceleration: playNumber(m.acceleration, .1, 200), gravity: playNumber(m.gravity, .1, 100), jumpSpeed: playNumber(m.jumpSpeed, .1, 30), anticipationTicks: playNumber(m.anticipationTicks, 0, 30, true), coyoteTicks: playNumber(m.coyoteTicks, 0, 30, true), bufferTicks: playNumber(m.bufferTicks, 0, 30, true), resetY: playNumber(m.resetY) },
    camera: { distance: playNumber(c.distance, .5, 30), height: playNumber(c.height, .1, 10), shoulder: playNumber(c.shoulder, -3, 3), yaw: playNumber(c.yaw), pitch: playNumber(c.pitch, -.7, 1.2), turnSpeed: playNumber(c.turnSpeed, .1, 10), clearance: playNumber(c.clearance, .05, 1) },
    colliders: list(p.colliders, 4096).map(raw => { const b = playObject(raw, ['entityId', 'center', 'halfSize']);return { entityId: text(b.entityId), center: playVector(b.center), halfSize: playVector(b.halfSize, .001, 10000) }; }),
    effects: list(p.effects, 32).map(raw => {
      const e = playObject(raw, ['id', 'event', 'materialId', 'meshId', 'facing', 'count', 'recipe']);
      // Particle parser is shared by direct callers and portable project boundaries.
      return { id: text(e.id), event: choice(e.event, PLAY_EVENTS), materialId: text(e.materialId), ...(e.meshId === undefined ? {} : { meshId: text(e.meshId) }), facing: choice(e.facing, ['camera', 'velocity', 'mesh']), count: playNumber(e.count, 1, 65536, true), recipe: validateParticleRecipe3D(e.recipe) };
    }),
  };
  if (p.shooter !== undefined) {
    const s = playObject(p.shooter, ['targets', 'magazine', 'reserve', 'fireTicks', 'reloadTicks', 'range', 'muzzle']);
    result.shooter = { targets: list(s.targets, 256).map(raw => { const t = playObject(raw, ['entityId', 'halfSize', 'health']);return { entityId: text(t.entityId), halfSize: playVector(t.halfSize, .01, 50), health: playNumber(t.health, 1, 1000, true) }; }), magazine: playNumber(s.magazine, 1, 1000, true), reserve: playNumber(s.reserve, 0, 100000, true), fireTicks: playNumber(s.fireTicks, 1, 600, true), reloadTicks: playNumber(s.reloadTicks, 1, 600, true), range: playNumber(s.range, 1, 1000), muzzle: playVector(s.muzzle, -10, 10) };
    if (!result.shooter.targets.length) throw new Error('Shooter requires targets');
  }
  if (p.sandbox !== undefined) {
    const s = playObject(p.sandbox, ['origin', 'size', 'cellSize', 'cells', 'reach']);
    result.sandbox = { origin: playVector(s.origin), size: playVector(s.size, 1, 128, true), cellSize: playNumber(s.cellSize, .1, 10), reach: playNumber(s.reach, .1, 20), cells: list(s.cells, 4096).map(raw => { const c = playObject(raw, ['entityId', 'cell', 'solid']);return { entityId: text(c.entityId), cell: playVector(c.cell, 0, 127, true), solid: flag(c.solid) }; }) };
    const sbox = result.sandbox;
    if (sbox.size.reduce((a, b) => a * b, 1) > 4096 || sbox.cells.length !== sbox.size.reduce((a, b) => a * b, 1) || new Set(sbox.cells.map(c => c.cell.join(','))).size !== sbox.cells.length || sbox.cells.some(c => c.cell.some((v, i) => v >= sbox.size[i]!))) throw new Error('Sandbox needs exactly one unique authored cell per bounded grid location (max 4096)');
  }
  if (p.collectathon !== undefined) {
    const s = playObject(p.collectathon, ['items', 'checkpoint', 'destination', 'radius']);
    result.collectathon = { items: list(s.items, 1024).map(text), checkpoint: text(s.checkpoint), destination: text(s.destination), radius: playNumber(s.radius, .1, 5) };
    if (!result.collectathon.items.length) throw new Error('Collectathon requires items');
  }
  if (Boolean(result.shooter) !== (result.genre === 'shooter') || Boolean(result.sandbox) !== (result.genre === 'sandbox') || Boolean(result.collectathon) !== (result.genre === 'collectathon')) throw new Error('Genre requires exactly its matching gameplay module');
  if (new Set(result.effects.map(e => e.id)).size !== result.effects.length) throw new Error('Duplicate effect id');
  if (result.animation.mode === 'clips') for (const phase of requiredPlayPhases(result.genre)) if (!result.animation.clips[phase]) throw new Error('Missing required animation phase: ' + phase);
  if (result.effects.reduce((n, e) => n + e.recipe.capacity, 0) > 8192) throw new Error('Play effects exceed 8192 live particles');
  return result;
}
export function requiredPlayPhases(genre: PlayDefinition3D['genre']): PlayPhase[] {
  return ['idle', 'start', 'move', 'stop', 'turn', 'anticipate', 'rise', 'fall', 'land', 'celebrate', ...(genre === 'shooter' ? ['aim', 'aimMove', 'fire', 'reload'] as const : genre === 'sandbox' ? ['edit'] as const : [])];
}
function readPhaseClips(value: unknown): Partial<Record<PlayPhase, string>> {
  const raw = playObject(value, PLAY_PHASES);
  const clips: Partial<Record<PlayPhase, string>> = {};for (const phase of PLAY_PHASES) if (raw[phase] !== undefined) clips[phase] = text(raw[phase]);return clips;
}
export function auditPlayProject3D(project: unknown, declaration: Hyperfocus3DDeclaration | undefined, diagnostics: Hyperfocus3DDiagnostic[]) {
  if (!project || typeof project !== 'object' || !('extensions' in project) || !project.extensions || typeof project.extensions !== 'object' || !('hyperfocusPlay' in project.extensions)) return;
  try {
    if ('hyperfocusCombat' in project.extensions && project.extensions.hyperfocusCombat !== undefined) throw new Error('Play and combat cannot own the same runtime');
    const play = readPlayDefinition3D(project.extensions.hyperfocusPlay);if (play && declaration && !diagnostics.length) validatePlayBindings3D(play, declaration);
  } catch (error) { diagnostics.push({ severity: 'error', code: 'play-declaration', pointer: '/extensions/hyperfocusPlay', message: String(error) }); }
}
export function validatePlayBindings3D(play: PlayDefinition3D, declaration: Hyperfocus3DDeclaration) {
  const scene = declaration.scenes.find(s => s.id === declaration.activeSceneId)!;
  const requireEntity = (id: string) => { const e = scene.entities.find(e => e.id === id);if (!e) throw new Error('Unknown play entity: ' + id);return e; };
  const player = requireEntity(play.player);
  if (player.physics || player.animation) throw new Error('Play motor exclusively owns player movement; remove physics/automatic animation');
  const owned = [play.player, ...play.shooter?.targets.map(t => t.entityId) ?? [], ...play.sandbox?.cells.map(t => t.entityId) ?? [], ...play.collectathon ? [...play.collectathon.items, play.collectathon.checkpoint, play.collectathon.destination] : []];
  if (new Set(owned).size !== owned.length) throw new Error('Play roles must bind distinct entities');owned.forEach(requireEntity);
  for (const box of play.colliders) { const e = requireEntity(box.entityId);if (e.animation || e.physics?.type === 'dynamic') throw new Error('Play static colliders cannot bind moving entities'); }
  if (play.animation.mode === 'clips') {
    const rig = declaration.rigs?.find(r => r.id === player.skeleton?.rigId);
    if (!rig) throw new Error('Authored play animation requires a bound player rig');
    if (!rig.rootBoneId || !rig.bones?.some(b => b.id === rig.rootBoneId)) throw new Error('Authored play animation requires an explicit stable root bone');
    for (const clip of Object.values(play.animation.clips)) if (!rig.clips.some(c => c.id === clip)) throw new Error('Missing required animation clip: ' + clip);
  } else if (player.skeleton) throw new Error('Use explicit clip mapping for a rigged actor; proxy mode never substitutes authored animation');
  for (const effect of play.effects) {
    if (!declaration.materials.some(m => m.id === effect.materialId)) throw new Error('Missing effect material: ' + effect.materialId);
    if (effect.facing === 'mesh' && !effect.meshId) throw new Error('Mesh particles need a canonical mesh');
    if (effect.meshId && !declaration.meshes.some(m => m.id === effect.meshId && !m.skin)) throw new Error('Missing static particle mesh: ' + effect.meshId);
  }
  if (play.effects.reduce((n, e) => n + e.recipe.capacity, 0) > (scene.effectCapacity ?? 0)) throw new Error('Scene effect capacity does not cover all play emitters');
}
