import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { cos, sin } from '../../../math/simulation.ts';
import { poseCombatLimb } from './effects.ts';

type Point = [number, number, number];

/** Render-only articulated contact. Fixed-tick state supplies all timing. */
export function poseContactArm(frame: Hyperfocus3DEvaluatedFrame, id: string, side: number, yaw: number, point: Point, shoulderOverride?: Point) {
  const root = frame.entities.find(entity => entity.id === id);
  if (!root) return;
  const name = side < 0 ? 'left' : 'right';
  const hand = frame.entities.find(entity => entity.id === `${id}:${name}-hand`);
  const arm = frame.entities.find(entity => entity.id === `${id}:${name}-arm`);
  const forearm = frame.entities.find(entity => entity.id === `${id}:${name}-forearm`);
  const shoulder: Point = shoulderOverride ?? [root.position[0] + side * .32 * cos(yaw), root.position[1] + .38, root.position[2] - side * .32 * sin(yaw)];
  const elbow: Point = [(shoulder[0] + point[0]) / 2 + side * .12 * cos(yaw), (shoulder[1] + point[1]) / 2 - .12, (shoulder[2] + point[2]) / 2 - side * .12 * sin(yaw)];
  if (hand) { hand.position = point;hand.rotation = [0, sin(yaw / 2), 0, cos(yaw / 2)]; }
  if (arm) poseCombatLimb(arm, shoulder, forearm ? elbow : point, .2);
  if (forearm) poseCombatLimb(forearm, elbow, point, .18);
}

export function poseContactLeg(frame: Hyperfocus3DEvaluatedFrame, id: string, side: number, yaw: number, knee: Point, ankle: Point, hipOverride?: Point) {
  const root = frame.entities.find(entity => entity.id === id);
  if (!root) return;
  const name = side < 0 ? 'left' : 'right';
  const thigh = frame.entities.find(entity => entity.id === `${id}:${name}-thigh`);
  const shin = frame.entities.find(entity => entity.id === `${id}:${name}-shin`);
  const boot = frame.entities.find(entity => entity.id === `${id}:${name}-boot`);
  if (thigh) poseCombatLimb(thigh, hipOverride ?? [root.position[0] + side * .16 * cos(yaw), root.position[1] - .26, root.position[2] - side * .16 * sin(yaw)], knee, .22);
  if (shin) poseCombatLimb(shin, knee, ankle, .18);
  if (boot) { boot.position = ankle;boot.rotation = [0, sin(yaw / 2), 0, cos(yaw / 2)]; }
}
