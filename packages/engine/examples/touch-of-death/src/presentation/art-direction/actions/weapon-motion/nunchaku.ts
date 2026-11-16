import type { CombatMove } from '@hyperfocus/engine/combat';
import { artTorsoPoint, solveArtArm, type ArtMotion } from '../../motion.ts';
import { clamp, mix, smooth, type Point } from '../curves.ts';
import { angleAxis } from './stroke.ts';
import { map3 } from '@hyperfocus/utilities/tuples';

const unit = (v: Point): Point => { const length = Math.hypot(...v); return length < .00001 ? [0, 0, 1] : map3(v, n => n / length); };
const negative = (v: Point): Point => [-v[0], -v[1], -v[2]];
const add = (a: Point, b: Point, weight: number): Point => [a[0] + b[0] * weight, a[1] + b[1] * weight, a[2] + b[2] * weight];
const catchRight: Point = [.23, 1.31, .39], catchAxis: Point = [0, 1, 0], catchChain: Point = [-1, 0, 0], catchTail: Point = [-.8, -.6, 0];
const catchLeft = add(add(add(catchRight, catchAxis, .24), catchChain, .14), catchTail, .24);

/** Physical handle identities are stable even when the held end changes. */
export function nunchakuEndpoints(pose: ArtMotion) {
  const weapon = pose.weapon!;
  const wrist = solveArtArm({ pose, side: weapon.hand ?? 'right' }).end;
  const start = add(wrist, unit(weapon.axis), -.1), end = add(start, unit(weapon.axis), .34);
  const chainEnd = add(end, unit(weapon.chain ?? weapon.follow ?? [0, -1, 0]), .14);
  const tailEnd = add(chainEnd, unit(weapon.follow ?? [0, -1, 0]), .34);
  return weapon.hand === 'left' ? { a0: tailEnd, a1: chainEnd, b0: end, b1: start } : { a0: start, a1: end, b0: chainEnd, b1: tailEnd };
}

/** Both handles keep their identity through a reachable catch; grip changes never teleport them. */
export function articulateNunchaku(pose: ArtMotion, move: CombatMove, frame: number) {
  const s = move.startupFrames, a = move.activeFrames, r = move.recoveryFrames;
  const multi = (move.strikeFrames?.length ?? 0) > 1;
  const catchAt = multi ? s + (move.strikeFrames?.[1] ?? 6) + 1 : s + a + r * .18;
  const returnAt = s + a + r * .72;
  const leftHand = frame >= catchAt && frame < returnAt;
  const end = s + a + r, idle = frame >= end;
  if (leftHand) {
    const u = clamp((frame - catchAt) / Math.max(1, returnAt - catchAt)), swing = Math.sin(u * Math.PI);
    pose.left = add(catchLeft, [-.08, -.04, .15], swing);
    pose.right = mix(catchRight, [.32, 1.19, .24], swing);
    pose.weapon = { grip: 0, hand: 'left',
      axis: unit(mix(negative(catchTail), [0, .15, 1], swing)),
      chain: unit(mix(negative(catchChain), [-.35, .1, 1], swing)),
      follow: unit(mix(negative(catchAxis), angleAxis([-.4 - 2.5 * u, .45 * Math.sin(u * Math.PI), 0]), swing)),
    };
    pose.phase = u < .12 || u > .88 ? 'catch-transfer' : 'left-hand-orbit';
  } else {
    const close = frame < catchAt ? smooth((frame - catchAt + 5) / 5) : 1 - smooth((frame - returnAt) / Math.max(1, end - returnAt));
    const contact = clamp((frame - s * .58) / Math.max(1, s * .42));
    const orbit = (frame - s) / Math.max(6, a) * Math.PI;
    const settle = smooth((frame - returnAt) / Math.max(1, end - returnAt));
    pose.right = mix(pose.right, catchRight, close);
    pose.left = mix(pose.left, catchLeft, close);
    const axis = angleAxis([.30 - .5 * contact, 1.1 - .9 * contact, 0]);
    const chain = angleAxis([.4 - orbit * .4, .2 + .25 * Math.sin(orbit), 0]);
    const tail = angleAxis([.8 - orbit * .9, -.8 + .7 * Math.sin(orbit - .4), 0]);
    pose.weapon = { grip: 0, hand: 'right', axis: unit(mix(mix(axis, [.2, .9, .38], settle), catchAxis, close)),
      chain: unit(mix(mix(chain, [0, -1, .15], settle), catchChain, close)),
      follow: unit(mix(mix(tail, [0, -1, 0], settle), catchTail, close)) };
    if (close > .8) pose.phase = 'catch-transfer';
  }
  // Explicit bend targets travel with the held wrists, including the receiving hand.
  pose.elbows = { left: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.65, .20, -.14]), right: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.65, .20, -.14]) };
  pose.left = solveArtArm({ pose, side: 'left' }).end;
  pose.right = solveArtArm({ pose, side: 'right' }).end;
  if (idle) pose.phase = 'weapon-ready';
  return pose;
}
