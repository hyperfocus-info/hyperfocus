import { particleFacingQuaternion } from '../../../render/three/particle-scene.ts';
import type { ParticleSystem3D } from '../../../effects/particles3d/emitter.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { GameplayPresentation3D } from '../gameplay-contracts.ts';
import type { PlayBox, PlayDefinition3D } from './contracts.ts';
import { cellCenter } from './interactions.ts';
import { playCamera } from './spatial.ts';
import type { PlayState3D } from './state.ts';

export function presentPlayFrame(def: PlayDefinition3D, state: PlayState3D, frame: Hyperfocus3DEvaluatedFrame, boxes: PlayBox[], systems: ParticleSystem3D[], options: { reducedMotion?: boolean; effects?: boolean } = {}) {
  const camera = playCamera(state.position, state.yaw, state.pitch, { ...def.camera, distance: def.camera.distance * (state.phase === 'aim' || state.phase === 'aimMove' ? .72 : 1) }, boxes);
  frame.camera.position = camera.position;frame.camera.target = camera.target;
  const player = frame.entities.find(e => e.id === def.player)!;player.position = [...state.position];player.rotation = [0, Math.sin(state.facing / 2), 0, Math.cos(state.facing / 2)];
  if (def.animation.mode === 'clips') {
    const animation = def.animation, existing = frame.performances.find(p => p.entityId === def.player);
    // rigId is supplied by the bound declaration through the session; every phase is validated before Play.
    if (!existing) throw new Error('Missing play rig performance binding');
    const moving = state.phase === 'move' || state.phase === 'aimMove', phaseTime = moving ? state.distance / animation.stride : state.phaseAge / 60;
    existing.clipId = animation.clips[state.phase]!;existing.timeSeconds = phaseTime;existing.sourceStartSeconds = 0;existing.loop = ['idle', 'move', 'aim', 'aimMove'].includes(state.phase);
    if (state.phaseAge < animation.blendTicks && state.previousPhase !== state.phase) existing.blend = { clipId: animation.clips[state.previousPhase]!, timeSeconds: state.previousPhase === 'move' || state.previousPhase === 'aimMove' ? state.distance / animation.stride : (state.previousAge + state.phaseAge) / 60, sourceStartSeconds: 0, loop: ['idle', 'move', 'aim', 'aimMove'].includes(state.previousPhase), weight: state.phaseAge / animation.blendTicks, rootMotion: existing.rootMotion };
    else delete existing.blend;
  }
  // No fabricated skeleton in proxy mode. Grounded scale response is visibly an authoring proxy.
  if (def.animation.mode === 'proxy' && !options.reducedMotion) {
    const squash = state.phase === 'anticipate' ? .88 : state.phase === 'land' ? 1 - .12 * Math.max(0, 1 - state.phaseAge / 10) : 1;
    player.scale[1] *= squash;player.scale[0] /= Math.sqrt(squash);player.scale[2] /= Math.sqrt(squash);
  }
  for (const [i, target] of (def.shooter?.targets ?? []).entries()) frame.entities.find(e => e.id === target.entityId)!.visible = state.health[i]! > 0;
  for (const [i, id] of (def.collectathon?.items ?? []).entries()) frame.entities.find(e => e.id === id)!.visible = !state.collected[i];
  for (const [i, cell] of (def.sandbox?.cells ?? []).entries()) { const entity = frame.entities.find(e => e.id === cell.entityId)!;entity.position = cellCenter(def, i);entity.visible = state.cells[i]!; }
  if (options.effects === false) return;
  for (const [index, effect] of def.effects.entries()) {
    const particles: Hyperfocus3DEvaluatedFrame['effects'][number]['particles'] = [];
    systems[index]!.forEach(p => {
      if (p.color[3] <= 0 || p.size <= 0 || options.reducedMotion && p.slot % 4 !== 0) return;
      const rotation = effect.facing === 'mesh' ? [Math.sin(p.rotation / 2) * .5773502691896258, Math.sin(p.rotation / 2) * .5773502691896258, Math.sin(p.rotation / 2) * .5773502691896258, Math.cos(p.rotation / 2)] : particleFacingQuaternion(p.position, camera.position, effect.facing === 'velocity' ? p.velocity : [0, 1, 0], effect.facing === 'velocity' ? 0 : p.rotation);
      particles.push({ id: effect.id + '-' + p.slot, position: [...p.position], rotation: [rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!], scale: [p.size, effect.facing === 'velocity' ? Math.min(p.size * 6, Math.max(p.size, Math.hypot(...p.velocity) * .025)) : p.size, p.size], color: [...p.color], uvRect: [...p.uv], oriented: true });
    });
    frame.effects.push({ id: effect.id, kind: 'sparks', presentation: effect.meshId ? 'model' : 'billboard', meshId: effect.meshId, materialId: effect.materialId, particles });
  }
}
export function playHud(def: PlayDefinition3D, state: PlayState3D): GameplayPresentation3D {
  const actions = [{ action: 'jump', label: 'Jump', held: true }, { action: 'reset', label: 'Restart' }];
  if (def.shooter) actions.unshift({ action: 'fire', label: 'Fire', held: true }, { action: 'aim', label: 'Aim', held: true }, { action: 'reload', label: 'Reload' });
  if (def.sandbox) actions.unshift({ action: 'break', label: 'Remove block' }, { action: 'place', label: 'Place block' });
  return { reticle: Boolean(def.shooter || def.sandbox), title: state.finished ? 'Complete' : def.genre === 'shooter' ? 'Target range' : def.genre === 'sandbox' ? 'Build and explore' : 'Collect and explore', objective: def.shooter ? 'Clear the targets' : def.sandbox ? 'Remove and place blocks within the marked volume' : 'Collect every token and reach the destination', hint: 'WASD move · arrows look · Space jump' + (def.shooter ? ' · F fire · Q aim · R reload' : def.sandbox ? ' · F remove · E place' : '') + ' · Backspace restart', status: def.animation.mode === 'proxy' ? 'ROUGH · proxy character motion' : state.phase, actions, metrics: def.shooter ? [{ label: 'Ammo', value: `${state.ammo} / ${state.reserve}` }, { label: 'Targets', value: `${state.health.filter(n => n === 0).length} / ${state.health.length}` }, { label: 'Reload', value: state.reload ? `${(state.reload / 60).toFixed(1)}s` : 'Ready' }] : def.sandbox ? [{ label: 'Edits', value: String(state.edits) }] : [{ label: 'Collected', value: `${state.collected.filter(Boolean).length} / ${state.collected.length}` }, { label: 'Checkpoint', value: state.checkpoint ? 'Saved' : 'Ahead' }] };
}
