import { cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { poseCombatLimb } from './effects.ts';
import { presentWallPose } from './wall-pose.ts';
import type { CombatConfig, CombatVector } from '../../../combat/config.ts';
import { presentDashPose } from './dash/pose.ts';

/** Cosmetic state belongs to the fixed-tick motion save; rendering never grants movement. */
export function presentCombatDash3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; config?: CombatConfig; walls?: ReadonlyMap<string, CombatVector>; motion: readonly { id: string; dashCue: number; dashCueKind: number; dx: number; dz: number; dashAirborne?: boolean; dashAge?: number; dashDuration?: number; dashCancelFrames?: number; dashCancelDuration?: number; dashCancelX?: number; dashCancelZ?: number; wallSliding?: boolean; wallRunning?: boolean }[] }) {
  const { frame, state } = options;
  for (const cue of options.motion) {
    const fighter = state.fighters.find(item => item.id === cue.id);
    const root = frame.entities.find(item => item.id === cue.id);
    if (fighter?.moveId && root && fighter.health > 0 && !fighter.stunFrames && !fighter.protectionFrames && (cue.dashCancelFrames ?? 0) > 0) {
      const move = options.config?.moves.find(move => move.id === fighter.moveId);
      if (move && fighter.moveFrame < move.startupFrames) {
        const remaining = Math.max(0, Math.min(1, cue.dashCancelFrames! / Math.max(1, cue.dashCancelDuration ?? 6)));
        presentDashPose(frame, { ...cue, dx: cue.dashCancelX ?? cue.dx, dz: cue.dashCancelZ ?? cue.dz, dashCue: Math.max(4, cue.dashCue), poseWeight: remaining * remaining * (3 - 2 * remaining) });
      }
      continue;
    }
    if (!fighter || !root || cue.dashCue <= 0 && !cue.wallSliding && !cue.wallRunning || fighter.health <= 0 || fighter.stunFrames > 0 || fighter.protectionFrames > 0 || fighter.moveId) continue;
    const [x, y, z] = root.position;
    const length = hypot(cue.dx, cue.dz) || 1, dx = cue.dx / length, dz = cue.dz / length;
    const fade = cue.wallSliding || cue.wallRunning ? 1 : Math.min(1, cue.dashCue / 4);
    if (cue.wallSliding || cue.wallRunning || cue.dashCueKind === 4 || cue.dashCueKind === 5) {
      for (const part of frame.entities) if (part.id === `${cue.id}:left-boot` || part.id === `${cue.id}:right-boot`) part.position[1] += .18 * fade;
    }
    if (cue.dashCueKind === 1 && !cue.wallRunning && !cue.wallSliding) presentDashPose(frame, cue);
    if (cue.wallRunning) {
      // Lean the entire articulated silhouette into its actual travel direction. The
      // mechanical body, facing and attack geometry remain untouched.
      for (const part of frame.entities) {
        if (part !== root && (!part.id.startsWith(`${cue.id}:`) || !/:(head|hair|face|belt|(?:left|right)-(?:hand|arm|forearm|thigh|shin|boot))$/.test(part.id))) continue;
        const angle = .48 * fade, cosine = cos(angle), sine = sin(angle);
        const px = part.position[0] - x, py = part.position[1] - y, pz = part.position[2] - z;
        const along = px * dx + pz * dz, change = along * (cosine - 1) + py * sine;
        part.position = [x + px + dx * change, y + py * cosine - along * sine, z + pz + dz * change];
        const [qx,qy,qz,qw] = part.rotation, ax = dz * sin(angle / 2), az = -dx * sin(angle / 2), w = cos(angle / 2);
        part.rotation = [w*qx+ax*qw-az*qy, w*qy+az*qx-ax*qz, w*qz+az*qw+ax*qy, w*qw-ax*qx-az*qz];
      }
    }
    const wall = options.walls?.get(cue.id);
    if (wall && (cue.wallRunning || cue.wallSliding)) presentWallPose(frame, cue.id, state.frame, wall, !!cue.wallRunning);
    for (let i = 0; i < 4; i++) {
      const trail = frame.entities.find(item => item.id === `${cue.id}:trail:${i}`);
      if (!trail) continue;
      if (cue.wallSliding || cue.wallRunning) {
        const side = (i % 2 ? -1 : 1) * .4, height = y - .65 + Math.floor(i / 2) * .3;
        poseCombatLimb(trail, [x + side, height, z], [x + side, height + .25, z], .045);
      } else if (cue.dashCueKind === 4 || cue.dashCueKind === 5) {
        const angle = i * Math.PI / 2, radius = .55 + (12 - cue.dashCue) * .035;
        poseCombatLimb(trail, [x + cos(angle) * radius, y - .8, z + sin(angle) * radius], [x + cos(angle + Math.PI / 2) * radius, y - .8, z + sin(angle + Math.PI / 2) * radius], .07 * fade);
      } else if (cue.dashCueKind === 1 || cue.wallRunning) {
        const side = (i % 2 ? 1 : -1) * .28, height = y + (i < 2 ? .25 : -.35);
        poseCombatLimb(trail, [x - dx * .3 - dz * side, height, z - dz * .3 + dx * side], [x - dx * (1.2 + i * .17) - dz * side, height, z - dz * (1.2 + i * .17) + dx * side], .065 * fade);
      } else if (cue.dashCueKind === 2) {
        // Camera-facing crossed strokes clear both shoulders, never overlaying
        // the similarly colored torso or collapsing edge-on as the camera turns.
        const side = i < 2 ? -1 : 1, slope = i % 2 ? -1 : 1;
        const ex = frame.camera.position[0] - x, ez = frame.camera.position[2] - z, cameraLength = hypot(ex, ez) || 1;
        const rightX = ez / cameraLength, rightZ = -ex / cameraLength;
        const a = side * .85 - .23, b = side * .85 + .23;
        poseCombatLimb(trail, [x + rightX * a, y + .28 - slope * .23, z + rightZ * a], [x + rightX * b, y + .28 + slope * .23, z + rightZ * b], .10 * fade);
      } else if (cue.dashCueKind === 3) {
        // Upward chevrons at the feet announce landing has rearmed the dash.
        const side = i < 2 ? -1 : 1, slope = i % 2 ? -1 : 1;
        poseCombatLimb(trail, [x + side * .38 + slope * .18, y - .78, z], [x + side * .38, y - .57, z], .055 * fade);
      }
    }
  }
}
