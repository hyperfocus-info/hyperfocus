import type { GameplaySnapshot3D, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';

type Frame = Hyperfocus3DEvaluatedFrame;
type Point = [number, number, number];

/** Reuse the authored pools: contact slashes, dash ribbons, timing rings and armor shards. */
export function presentCombatFeedback(frame: Frame, snapshot: GameplaySnapshot3D, reducedMotion = false) {
  const combat = snapshot.combat;
  if (!combat) return;
  for (const fighter of combat.state.fighters) {
    const root = frame.entities.find(entity => entity.id === fighter.id);
    if (!root) continue;
    const motion = combat.motion?.find(item => item.id === fighter.id);
    for (const part of frame.entities) {
      if (!part.visible) continue;
      if (part.id.startsWith(`${fighter.id}:spark:`) || part.id.startsWith(`${fighter.id}:trail:`) && motion?.dashCueKind === 1 && motion.dashCue > 0) {
        part.scale = [part.scale[0] * 1.2, part.scale[1] * 1.2, part.scale[2] * 1.2];
      }
    }
    const cue = combat.defenseFeedback?.find(item => item.id === fighter.id)?.cue;
    const age = cue ? combat.state.frame - cue.frame : 30;
    const success = cue?.result === 'perfect' && age >= 0 && age < 30;
    // Keep the existing white timing ring, adding long/short rays in the contact plane.
    if (success) {
      const t = age / 30, radius = reducedMotion ? .58 : .34 + (1 - (1 - t) ** 3) * .9;
      const center: Point = cue.contactPoint ? [cue.contactPoint.x, cue.contactPoint.y, cue.contactPoint.z] : [root.position[0] + fighter.facing.x * .65, root.position[1] + .35, root.position[2] + fighter.facing.z * .65];
      const normal = cue.action === 'tech' && cue.contactNormal ? cue.contactNormal : { x: frame.camera.position[0] - center[0], y: frame.camera.position[1] - center[1], z: frame.camera.position[2] - center[2] };
      const length = Math.hypot(normal.x, normal.y, normal.z) || 1, nx = normal.x / length, ny = normal.y / length, nz = normal.z / length;
      const h = Math.hypot(nx, nz), ux = h > .001 ? nz / h : 1, uz = h > .001 ? -nx / h : 0;
      const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
      // Tech brackets sit on the recovery surface; parry retains its forward radial burst.
      const tech = cue.action === 'tech', count = tech ? 8 : 12;
      for (let i = 0; i < 12; i++) {
        const part = frame.entities.find(entity => entity.id === `${fighter.id}:spark:${i}`);
        if (!part) continue;
        part.visible = i < count && (!reducedMotion || i % (tech ? 2 : 3) === 0);
        if (!part.visible) continue;
        const corner = Math.floor(i / 2), a = corner < 2 ? -1 : 1, b = corner % 2 ? -1 : 1;
        const angle = i * Math.PI / 6 + .18, c = Math.cos(angle), s = Math.sin(angle);
        const ray: Point = tech ? i % 2 ? [vx * -b, vy * -b, vz * -b] : [ux * -a, 0, uz * -a] : [ux * c + vx * s, vy * s, uz * c + vz * s];
        const radial: Point = tech ? [(ux * a + vx * b) * .65, vy * b * .65, (uz * a + vz * b) * .65] : ray;
        const start: Point = [center[0] + nx * .14 + radial[0] * radius, center[1] + ny * .14 + radial[1] * radius, center[2] + nz * .14 + radial[2] * radius];
        stroke(part, start, ray, (tech ? .32 : i % 3 ? .18 : .48) * (reducedMotion ? 1 : 1 - t), reducedMotion ? .025 : .025 * (1 - t) + .008);
        part.renderMaterialId = `${fighter.id}:timing`;
      }
    } else if (fighter.armorFrames > 0 && fighter.health > 0) {
      // Gold facets brace the shoulders and ribs, leaving the face and fists readable.
      for (let i = 0; i < 8; i++) {
        const part = frame.entities.find(entity => entity.id === `${fighter.id}:spark:${i}`);
        if (!part || part.visible) continue;
        const side = i % 2 ? -1 : 1, row = Math.floor(i / 2), phase = reducedMotion ? .5 : (combat.state.frame + row * 5) % 20 / 20;
        const start: Point = [root.position[0] + fighter.facing.z * side * (.42 + phase * .08), root.position[1] + .55 - row * .27, root.position[2] - fighter.facing.x * side * (.42 + phase * .08)];
        stroke(part, start, [fighter.facing.z * side * .25, .9, -fighter.facing.x * side * .25], .2 + phase * .15, .035);
        if (frame.materials.some(material => material.id === 'tod:gold')) part.renderMaterialId = 'tod:gold';
      }
    }
  }
}

function stroke(part: Frame['entities'][number], start: Point, direction: Point, length: number, width: number) {
  const [x, y, z] = direction, norm = Math.hypot(x, y, z) || 1, dx = x / norm, dy = y / norm, dz = z / norm;
  const q = Math.hypot(dz, dx, 1 + dy);
  part.position = [start[0] + dx * length * .5, start[1] + dy * length * .5, start[2] + dz * length * .5];
  part.rotation = q > .00001 ? [dz / q, 0, -dx / q, (1 + dy) / q] : [1, 0, 0, 0];
  part.scale = [width, length * .5, width];part.visible = true;
}
