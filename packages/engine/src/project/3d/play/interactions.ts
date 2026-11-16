import type { PlayBox, PlayDefinition3D, PlayEvent, PlayVector } from './contracts.ts';
import { overlapPlayBox, playCamera, sweepPlayBoxes } from './spatial.ts';
import { setPlayPhase, type PlayState3D } from './state.ts';

export function sandboxBoxes(def: PlayDefinition3D, state: PlayState3D): PlayBox[] {
  const sandbox = def.sandbox;if (!sandbox) return [];
  return sandbox.cells.flatMap((cell, i): PlayBox[] => state.cells[i] ? [{ entityId: cell.entityId, center: cellCenter(def, i), halfSize: [sandbox.cellSize / 2, sandbox.cellSize / 2, sandbox.cellSize / 2] }] : []);
}
export function cellCenter(def: PlayDefinition3D, index: number): PlayVector {
  const s = def.sandbox!, c = s.cells[index]!.cell;return [s.origin[0] + (c[0] + .5) * s.cellSize, s.origin[1] + (c[1] + .5) * s.cellSize, s.origin[2] + (c[2] + .5) * s.cellSize];
}
export function stepPlayInteractions(options: { def: PlayDefinition3D; state: PlayState3D; held: ReadonlySet<string>; pressed: ReadonlySet<string>; boxes: PlayBox[]; positions: ReadonlyMap<string, PlayVector>; emit: (event: PlayEvent, position: PlayVector) => void; edit: (index: number, solid: boolean) => void }) {
  const { def, state, held, pressed, boxes, positions, emit } = options;
  if (state.cooldown) state.cooldown--;
  if (['fire', 'edit', 'reload'].includes(state.phase) && !state.reload && state.phaseAge > 10) setPlayPhase(state, 'idle');
  const camera = playCamera(state.position, state.yaw, state.pitch, def.camera, boxes), direction: PlayVector = [-Math.sin(state.yaw) * Math.cos(state.pitch), -Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch)];
  const endpoint = (origin: PlayVector, range: number): PlayVector => [origin[0] + direction[0] * range, origin[1] + direction[1] * range, origin[2] + direction[2] * range];
  const shooter = def.shooter;
  if (shooter) {
    if (state.reload && --state.reload === 0) { const amount = Math.min(shooter.magazine - state.ammo, state.reserve);state.ammo += amount;state.reserve -= amount;emit('reload', [...state.position]); }
    if (pressed.has('reload') && !state.reload && state.ammo < shooter.magazine && state.reserve > 0) { state.reload = shooter.reloadTicks;setPlayPhase(state, 'reload'); }
    if (held.has('fire') && !state.cooldown && !state.reload && state.ammo && !state.finished) {
      state.ammo--;state.cooldown = shooter.fireTicks;setPlayPhase(state, 'fire');
      const muzzle: PlayVector = [state.position[0] + Math.cos(state.yaw) * shooter.muzzle[0] + Math.sin(state.yaw) * shooter.muzzle[2], state.position[1] + shooter.muzzle[1], state.position[2] - Math.sin(state.yaw) * shooter.muzzle[0] + Math.cos(state.yaw) * shooter.muzzle[2]];
      const targets = shooter.targets.flatMap((t, i) => state.health[i]! > 0 ? [{ entityId: t.entityId, center: positions.get(t.entityId)!, halfSize: t.halfSize }] : []);
      // First choose the camera aim point, then test the physical muzzle path. Cover can block the shot.
      const surfaces = [...boxes, ...targets], far = endpoint(camera.position, shooter.range), aim = sweepPlayBoxes(camera.position, far, surfaces);
      const point: PlayVector = [camera.position[0] + (far[0] - camera.position[0]) * (aim?.fraction ?? 1), camera.position[1] + (far[1] - camera.position[1]) * (aim?.fraction ?? 1), camera.position[2] + (far[2] - camera.position[2]) * (aim?.fraction ?? 1)];
      const hit = sweepPlayBoxes(muzzle, point.map((v, i) => v + (v - muzzle[i]!) * .0001), surfaces);
      emit('fire', muzzle);
      if (hit) {
        const index = shooter.targets.findIndex(t => t.entityId === hit.entityId);if (index >= 0) state.health[index]!--;
        emit('hit', [muzzle[0] + (point[0] - muzzle[0]) * hit.fraction, muzzle[1] + (point[1] - muzzle[1]) * hit.fraction, muzzle[2] + (point[2] - muzzle[2]) * hit.fraction]);
      }
      if (state.health.every(n => n === 0)) { state.finished = true;setPlayPhase(state, 'celebrate');emit('finish', [...state.position]); }
    }
  }
  if (def.sandbox && (pressed.has('break') || pressed.has('place')) && !state.cooldown) {
    const s = def.sandbox, origin: PlayVector = [state.position[0], state.position[1] + def.camera.height, state.position[2]], hit = sweepPlayBoxes(origin, endpoint(origin, s.reach), boxes);
    if (hit) {
      const index = s.cells.findIndex(c => c.entityId === hit.entityId);
      if (index >= 0 && pressed.has('break')) { options.edit(index, false);state.edits++;state.cooldown = 8;setPlayPhase(state, 'edit');emit('break', cellCenter(def, index)); }
      else if (pressed.has('place')) {
        const point = endpoint(origin, s.reach * hit.fraction), cell = point.map((v, i) => Math.floor((v + hit.normal[i]! * .001 - s.origin[i]!) / s.cellSize)), at = s.cells.findIndex(c => c.cell.every((v, i) => v === cell[i]));
        if (at >= 0 && !state.cells[at]) {
          const box: PlayBox = { entityId: s.cells[at]!.entityId, center: cellCenter(def, at), halfSize: [s.cellSize / 2, s.cellSize / 2, s.cellSize / 2] };
          if (!overlapPlayBox([state.position[0], state.position[1] + def.movement.height / 2, state.position[2]], [def.movement.radius, def.movement.height / 2, def.movement.radius], box) && !def.colliders.some(other => overlapPlayBox(box.center, box.halfSize, other))) { options.edit(at, true);state.edits++;state.cooldown = 8;setPlayPhase(state, 'edit');emit('place', box.center); }
        }
      }
    }
  }
  const collect = def.collectathon;
  if (collect) {
    const near = (id: string) => { const p = positions.get(id)!;return Math.hypot(state.position[0] - p[0], state.position[1] + def.movement.height / 2 - p[1], state.position[2] - p[2]) <= collect.radius; };
    for (const [index, id] of collect.items.entries()) if (!state.collected[index] && near(id)) { state.collected[index] = true;emit('collect', [...positions.get(id)!]); }
    if (!state.checkpoint && near(collect.checkpoint)) { state.checkpoint = true;emit('checkpoint', [...positions.get(collect.checkpoint)!]); }
    if (!state.finished && state.collected.every(Boolean) && near(collect.destination)) { state.finished = true;setPlayPhase(state, 'celebrate');emit('finish', [...positions.get(collect.destination)!]); }
  }
}
