import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import { poseContactArm } from '../combat-visuals/contact-pose.ts';
import type { createCombatInteractions } from './session.ts';
import { GRAB_RELEASE_RECOVERY } from './grabs/attempts.ts';
import type { CombatInteractions } from './config.ts';

type State = ReturnType<ReturnType<typeof createCombatInteractions>['capture']>;

/** Grip, break and release derive only from the rollback-saved interaction trace. */
export function presentGrapplePose(frame: Hyperfocus3DEvaluatedFrame, state: State, tick: number, combat?: CombatSnapshot, definition?: CombatInteractions) {
  const occupied = new Set<string>();
  for (const attempt of state.attempts ?? []) {
    const root = frame.entities.find(entity => entity.id === attempt.attacker), actor = combat?.fighters.find(fighter => fighter.id === attempt.attacker);
    let start: State['trace'][number] | undefined;
    for (const event of state.trace) if (event.kind === 'grapple-windup' && event.actor === attempt.attacker) start = event;
    if (!root || !actor || !start) continue;
    const age = Math.max(0, tick - start.frame), progress = age / Math.max(1, age + attempt.remaining), yaw = atan2(actor.facing.x, actor.facing.z);
    poseUpperBody(frame, actor.id, yaw, .18 * progress);
    for (const side of [-1, 1]) poseContactArm(frame, actor.id, side, yaw, [root.position[0] + sin(yaw) * (.15 + .15 * progress) + cos(yaw) * side * .24, root.position[1] + .4, root.position[2] + cos(yaw) * (.15 + .15 * progress) - sin(yaw) * side * .24]);
    occupied.add(actor.id);
  }
  for (const event of state.trace) {
    const age = tick - event.frame;
    const duration = definition?.grappleWhiffFrames ?? 18;
    if (event.kind !== 'grapple-whiff' || age < 0 || age >= duration) continue;
    const actor = combat?.fighters.find(fighter => fighter.id === event.actor);
    const root = frame.entities.find(entity => entity.id === event.actor);
    if (!root || actor && (actor.health <= 0 || actor.moveId)) continue;
    const extension = .3 + .65 * sin(Math.PI * age / duration), yaw = event.value;
    poseUpperBody(frame, event.actor, yaw, .22 * sin(Math.PI * age / duration));
    for (const side of [-1, 1]) poseContactArm(frame, event.actor, side, yaw, [root.position[0] + sin(yaw) * extension + cos(yaw) * side * .24, root.position[1] + .4, root.position[2] + cos(yaw) * extension - sin(yaw) * side * .24]);
    occupied.add(event.actor);
  }
  for (const grip of state.grapples) {
    let start: State['trace'][number] | undefined;
    for (const row of state.trace) if (row.kind === 'grapple-start' && row.actor === grip.attacker && row.target === grip.target) start = row;
    const reach = Math.min(1, ((start?.value ?? 12) - grip.remaining + 1) / 3);
    posePair(frame, grip.attacker, grip.target, reach, 0, false);
    occupied.add(grip.attacker);occupied.add(grip.target);
  }
  for (let index = state.trace.length - 1; index >= 0; index--) {
    const event = state.trace[index]!, age = tick - event.frame;
    const duration = event.kind === 'grapple-tech' ? 12 : definition?.grappleRecoveryFrames ?? GRAB_RELEASE_RECOVERY;
    if (age < 0 || age >= duration || event.kind !== 'grapple-throw' && event.kind !== 'grapple-tech') continue;
    if (occupied.has(event.actor) || occupied.has(event.target)) continue;
    // Followthrough must yield immediately when either player chooses a new action.
    if (combat?.fighters.some(fighter => (fighter.id === event.actor || fighter.id === event.target) && (fighter.moveId || fighter.guarding || fighter.health <= 0))) continue;
    const tech = event.kind === 'grapple-tech';
    posePair(frame, tech ? event.target : event.actor, tech ? event.actor : event.target, 1 - age / duration, age / duration, tech);
    occupied.add(event.actor);occupied.add(event.target);
  }
}

function posePair(frame: Hyperfocus3DEvaluatedFrame, attacker: string, target: string, weight: number, release: number, tech: boolean) {
  const a = frame.entities.find(entity => entity.id === attacker), b = frame.entities.find(entity => entity.id === target);
  if (!a || !b) return;
  const distance = hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]) || 1;
  const dx = (b.position[0] - a.position[0]) / distance, dz = (b.position[2] - a.position[2]) / distance;
  const yaw = atan2(dx, dz), extension = Math.min(1.05, distance * .5) * weight;
  poseUpperBody(frame, attacker, yaw, .3 * weight);
  if (!release || tech) poseUpperBody(frame, target, yaw + Math.PI, -.15 * weight);
  for (const side of [-1, 1]) {
    const spread = side * (tech ? .25 + release * .55 : .23);
    const point: [number, number, number] = [a.position[0] + dx * extension + dz * spread, a.position[1] + .45 - (tech ? 0 : release * .65), a.position[2] + dz * extension - dx * spread];
    poseContactArm(frame, attacker, side, yaw, point);
    // During the grip the defender visibly contests the wrists; a successful tech
    // splays both hands out. A thrown body uses its existing physical hit pose.
    if (!release || tech) poseContactArm(frame, target, -side, yaw + Math.PI, [point[0] + dx * .1, point[1] + .08, point[2] + dz * .1]);
  }
}

function poseUpperBody(frame: Hyperfocus3DEvaluatedFrame, id: string, yaw: number, pitch: number) {
  const root = frame.entities.find(entity => entity.id === id)!;
  root.rotation = [cos(yaw / 2) * sin(pitch / 2), sin(yaw / 2) * cos(pitch / 2), -sin(yaw / 2) * sin(pitch / 2), cos(yaw / 2) * cos(pitch / 2)];
  for (const [name, height, front] of [['head', .78, 0], ['hair', 1, -.02], ['face', .76, .22], ['belt', -.17, 0]] as const) {
    const entity = frame.entities.find(item => item.id === `${id}:${name}`);
    if (!entity) continue;
    const y = height * cos(pitch) - front * sin(pitch), z = height * sin(pitch) + front * cos(pitch);
    entity.position = [root.position[0] + z * sin(yaw), root.position[1] + y, root.position[2] + z * cos(yaw)];entity.rotation = [...root.rotation];
  }
}
