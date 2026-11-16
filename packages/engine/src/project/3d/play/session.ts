import { createVoxelVolume3D } from '../../../content/voxel-volume.ts';
import { canonicalSaveJson } from '../../../save/index.ts';
import { createParticleSystem3D } from '../../../effects/particles3d/emitter.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import { readPlayDefinition3D, validatePlayBindings3D, type PlayEvent, type PlayVector } from './contracts.ts';
import { sandboxBoxes, stepPlayInteractions } from './interactions.ts';
import { stepPlayMotor } from './motor.ts';
import { playHud, presentPlayFrame } from './presentation.ts';
import { overlapPlayBox, sweepPlayBoxes } from './spatial.ts';
import { initialPlayState, readPlayState } from './state.ts';

/** Shared by Editor Play, standalone builds, deterministic verification and saved games. */
export function createProjectPlay3D(extension: unknown, runtime: Hyperfocus3DRuntime) {
  const parsed = readPlayDefinition3D(extension);if (!parsed) return;
  const def = parsed;validatePlayBindings3D(def, runtime.declaration);
  const scene = runtime.declaration.scenes.find(s => s.id === runtime.declaration.activeSceneId)!;
  const positions = new Map(scene.entities.map(e => [e.id, e.position])), spawn = positions.get(def.player)!;
  let state = initialPlayState(def, spawn), boxes = [...def.colliders, ...sandboxBoxes(def, state)];
  const volume = def.sandbox ? createVoxelVolume3D({ size: def.sandbox.size, cellSize: def.sandbox.cellSize }) : undefined;
  const systems = def.effects.map(e => createParticleSystem3D(e.recipe, { sweep: (from, to, radius) => sweepPlayBoxes(from, to, boxes, [radius, radius, radius]) }));
  const initialSystems = systems.map(s => s.snapshot()), signature = canonicalSaveJson(JSON.parse(JSON.stringify(def)));
  function refresh() {
    if (volume) for (const [i, cell] of def.sandbox!.cells.entries()) volume.edit({ min: cell.cell, max: [cell.cell[0] + 1, cell.cell[1] + 1, cell.cell[2] + 1], solid: state.cells[i]! });
    boxes = [...def.colliders, ...sandboxBoxes(def, state)];
  }
  refresh();
  if (boxes.some(box => overlapPlayBox([spawn[0], spawn[1] + def.movement.height / 2, spawn[2]], [def.movement.radius, def.movement.height / 2, def.movement.radius], box))) throw new Error('Player spawn intersects an authored play collider');
  function emit(event: PlayEvent, position: PlayVector) { for (const [i, e] of def.effects.entries()) if (e.event === event) { systems[i]!.setTransform({ position });systems[i]!.emit(e.count, { position }); } }
  function reset() { state = initialPlayState(def, spawn);systems.forEach(s => s.reset());refresh(); }
  function capture() { return { version: 1 as const, signature, state: structuredClone(state), particles: systems.map(s => s.snapshot()) }; }
  function validate(value: unknown) {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('signature' in value) || value.signature !== signature || !('state' in value) || !('particles' in value) || !Array.isArray(value.particles) || value.particles.length !== systems.length) throw new Error('Saved play definition mismatch');
    const next = readPlayState(value.state, def);
    // Validate on disposable emitters so failed imports cannot partially change live simulation.
    const particles = value.particles.map((saved, i) => { const system = createParticleSystem3D(def.effects[i]!.recipe, { sweep: () => undefined });system.restore(saved);return system.snapshot(); });
    return { state: next, particles };
  }
  return {
    definition: def, capture, validate, reset,
    restore(value: unknown) { const next = validate(value);state = next.state;systems.forEach((s, i) => s.restore(next.particles[i]!));refresh(); },
    step(held: ReadonlySet<string>, pressed: readonly string[]) {
      const newly = new Set(pressed);if (newly.has('reset')) reset();
      stepPlayMotor(state, def, held, newly, boxes, emit);
      stepPlayInteractions({ def, state, held, pressed: newly, boxes, positions, emit, edit(index, solid) { state.cells[index] = solid;refresh(); } });
      if (state.position[1] < def.movement.resetY) {
        const point = state.checkpoint && def.collectathon ? positions.get(def.collectathon.checkpoint)! : spawn;
        state.position = [point[0], point[1] + (state.checkpoint ? def.movement.height / 2 : 0), point[2]];state.velocity = [0, 0, 0];state.grounded = false;state.phase = 'idle';emit('reset', [...state.position]);
      }
      for (const system of systems) system.step(0.016666666666666666);
      runtime.applyCommands({ commands: [{ type: 'teleport', entityId: def.player, position: [...state.position], rotationY: state.facing }] });
      return new Set([def.player]);
    },
    presentFrame(frame: Hyperfocus3DEvaluatedFrame, options: { reducedMotion?: boolean; effects?: boolean } = {}) {
      if (def.animation.mode === 'clips') {
        frame.performances = frame.performances.filter(p => p.entityId !== def.player);
        const entity = scene.entities.find(e => e.id === def.player)!;
        const rig = runtime.declaration.rigs!.find(r => r.id === entity.skeleton!.rigId)!;
        frame.performances.push({ entityId: def.player, rigId: entity.skeleton!.rigId, clipId: def.animation.clips.idle!, timeSeconds: 0, sourceStartSeconds: 0, loop: true, rootMotion: { mode: 'extract-xyz', loopBoundary: 'reset', rootBoneId: rig.rootBoneId! }, externalRoot: true });
      }
      presentPlayFrame(def, state, frame, boxes, systems, options);
      if (def.animation.mode === 'clips') {
        const performance = frame.performances.find(p => p.entityId === def.player)!, rig = runtime.declaration.rigs!.find(r => r.id === performance.rigId)!;
        if (state.phase === 'move' || state.phase === 'aimMove') performance.timeSeconds *= rig.clips.find(c => c.id === performance.clipId)!.durationSeconds;
        if (performance.blend && (state.previousPhase === 'move' || state.previousPhase === 'aimMove')) performance.blend.timeSeconds *= rig.clips.find(c => c.id === performance.blend!.clipId)!.durationSeconds;
      }
    },
    presentation: () => playHud(def, state),
    resetState() { reset();systems.forEach((s, i) => s.restore(initialSystems[i]!)); },
    voxelSnapshot: () => volume?.snapshot(),
  };
}
