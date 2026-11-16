import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';

/** Local presentation memory; never part of combat, replay or save state. */
export type CombatCameraOrbit3D = { yaw: number; time?: number };

/** Frame the live city beside the title column; mobile retains the centered fit. */
export function presentCombatTitleCamera3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; viewportAspect?: number }) {
  if (!options.frame.entities.some(entity => entity.id === 'tod:city:street')) return;
  presentCombatCamera3D({ ...options, reducedMotion: true });
  const aspect = options.viewportAspect ?? 1.7777777777777777;
  const shift = Math.min(3.1, Math.max(0, aspect - 1.1) * 6);
  options.frame.camera.position[0] -= shift;
  options.frame.camera.target[0] -= shift;
}

/** Fit both complete silhouettes and their overhead resources, even on narrow screens. */
export function presentCombatCamera3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; events?: readonly CombatEvent[]; reducedMotion?: boolean; viewportAspect?: number; orbit?: CombatCameraOrbit3D }) {
  const { frame, state, events = [] } = options;
  if (!frame.entities.some(entity => entity.id === 'tod:arena' || entity.id === 'tod:city:street')) return;
  const roots = frame.entities.filter(entity => state.fighters.some(fighter => fighter.id === entity.id));
  if (!roots.length) return;
  const x = roots.reduce((sum, root) => sum + root.position[0], 0) / roots.length;
  const y = roots.reduce((sum, root) => sum + root.position[1], 0) / roots.length;
  const z = roots.reduce((sum, root) => sum + root.position[2], 0) / roots.length;
  const city = frame.entities.some(entity => entity.id === 'tod:city:street');
  const yaw = city && options.orbit ? orbitYaw(roots, options.orbit, frame.timeSeconds) : 0;
  const yawCosine = cos(yaw), yawSine = sin(yaw);
  // Place close fighters slightly above center so floor-level prop clusters and
  // their approaches remain visible. The same fit still protects bodies/HUD.
  const targetY = y + (city ? -.10 : .55);
  const aspect = Math.max(.3, options.viewportAspect ?? 1.7777777777777777);
  const tangent = sin(frame.camera.fovYRadians / 2) / cos(frame.camera.fovYRadians / 2);
  const elevation = .42, cosine = cos(elevation), sine = sin(elevation);
  // Keep close exchanges large enough to read hands and contact. The fit below
  // still pulls back for separation, launch height, overhead resources and narrow screens.
  let distance = city ? 10.25 : 9.5;
  for (const root of roots) {
    const dx = root.position[0] - x, dy = root.position[1] - targetY, dz = root.position[2] - z;
    const horizontal = dx * yawCosine - dz * yawSine, forward = dx * yawSine + dz * yawCosine;
    const depth = dy * sine + forward * cosine;
    const vertical = dy * cosine - forward * sine;
    distance = Math.max(distance, depth + (Math.abs(horizontal) + 1.35) / (tangent * aspect * .8), depth + (Math.abs(vertical) + 2.15) / (tangent * .8));
  }
  let impact: CombatEvent | undefined;
  for (const event of events) if (['hit', 'parry', 'guard-break'].includes(event.kind) && state.frame - event.frame >= 0 && state.frame - event.frame < 12) impact = event;
  const age = impact ? state.frame - impact.frame : 12;
  const heavy = impact && (impact.damage >= 18 || impact.counter || impact.kind === 'guard-break');
  const impulse = impact && !options.reducedMotion ? (heavy ? .085 : .018) * (1 - age / 12) ** 2 : 0;
  // Push back slightly at contact, then settle. Never zoom through the fitting bound.
  const dolly = distance + impulse * 4;
  frame.camera.target = [x, targetY, z];
  frame.camera.position = [x + dolly * cosine * yawSine + sin(age * 2.7) * impulse * 8, targetY + dolly * sine + cos(age * 3.9) * impulse * 3.2, z + dolly * cosine * yawCosine];
  frame.renderGraph.exposure = 1.03;
  frame.renderGraph.bloom = { strength: .22 + (options.reducedMotion ? 0 : impulse * 1.5), radius: .25, threshold: .86 };
  frame.renderGraph.vignette = .24;
}

function orbitYaw(roots: Hyperfocus3DEvaluatedFrame['entities'], orbit: CombatCameraOrbit3D, time: number): number {
  const elapsed = Math.max(0, Math.min(.05, time - (orbit.time ?? time)));
  orbit.time = time;
  if (roots.length < 2) return orbit.yaw;
  const dx = roots[1]!.position[0] - roots[0]!.position[0], dz = roots[1]!.position[2] - roots[0]!.position[2];
  const separation = (angle: number) => Math.abs(dx * cos(angle) - dz * sin(angle));
  const length = hypot(dx, dz), goal = Math.min(1.9, length * .95);
  let target = orbit.yaw;
  if (length > .1 && separation(orbit.yaw) < Math.min(1.65, length * .85)) {
    // The two equivalent side views are pi apart. Keep the nearest branch so
    // crossing world x=0 cannot flip the camera to the opposite orbit side.
    let ideal = atan2(-dz, dx);
    while (ideal - orbit.yaw > Math.PI / 2) ideal -= Math.PI;
    while (ideal - orbit.yaw < -Math.PI / 2) ideal += Math.PI;
    let low = 0, high = 1;
    for (let index = 0; index < 12; index++) {
      const middle = (low + high) / 2;
      if (separation(orbit.yaw + (ideal - orbit.yaw) * middle) < goal) low = middle;else high = middle;
    }
    target = orbit.yaw + (ideal - orbit.yaw) * high;
  } else if (Math.abs(dx) > 2.3) {
    // Return only along a clear path. A direct reset can sweep back through
    // the same front/back alignment that prompted the orbit.
    let clear = true;
    for (let index = 1; index <= 8; index++) if (separation(orbit.yaw * (1 - index / 8)) < 1.8) clear = false;
    if (clear) target = 0;
  }
  const change = target - orbit.yaw;
  orbit.yaw += Math.max(-elapsed * 1.5, Math.min(elapsed * 1.5, change * Math.min(1, elapsed * 8)));
  return orbit.yaw;
}
