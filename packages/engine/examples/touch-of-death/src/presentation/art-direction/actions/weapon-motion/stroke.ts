import type { CombatMove } from '@hyperfocus/engine/combat';
import { artTorsoPoint, type ArtMotion } from '../../motion.ts';
import { blendArtMotion } from '../../transition.ts';
import type { DirectedFamily } from '../../../city/weapons/direction/grammar.ts';
import { weaponIntent } from '../../../city/weapons/direction/intent.ts';
import { strikeClock } from '../attacks.ts';
import { arc, clamp, mix, ready, smooth, type Point } from '../curves.ts';
import { weaponStroke } from './paths.ts';

export const angleAxis = (angles: Point): Point => [Math.sin(angles[0]) * Math.cos(angles[1]), Math.sin(angles[1]), Math.cos(angles[0]) * Math.cos(angles[1])];

export function sampleDirectedStroke(move: CombatMove, family: DirectedFamily, frame: number): ArtMotion {
  const clock = strikeClock(move, frame), pose = directedPose(move, family, frame);
  if (clock.strike > 0 && clock.frame < Math.min(3, clock.startup)) {
    const boundary = frame - clock.frame;
    const previous = sampleDirectedStroke(move, family, boundary - .001);
    return blendArtMotion({ from: previous, to: pose, weight: smooth(clock.frame / Math.min(3, clock.startup)) });
  }
  return pose;
}

function directedPose(move: CombatMove, family: DirectedFamily, frame: number): ArtMotion {
  const heavy = move.weaponAttack === 'heavy' || move.id === 'weapon-heavy-heavy';
  const intent = weaponIntent(move), clock = strikeClock(move, frame), p = weaponStroke(family, intent, heavy), pose = ready();
  const s = Math.max(1, clock.startup), a = clock.active, r = clock.recovery;
  const load = smooth(clock.frame / Math.max(1, s * .55));
  const commitmentFrames = Math.min(s, Math.max(5, s * .43));
  const commit = clock.strike > 0 ? smooth(clock.frame / s) : smooth((clock.frame - s + commitmentFrames) / commitmentFrames);
  const follow = smooth((clock.frame - s) / Math.max(1, a + Math.min(6, r * .22)));
  const recover = smooth((clock.frame - s - a - Math.min(6, r * .22)) / Math.max(1, r - Math.min(6, r * .22)));
  const coil = load * (1 - commit), force = commit * (1 - recover);
  const alternate = clock.strike % 2 === 1;
  if (alternate) { for (const point of [p.coil, p.contact, p.finish]) point[0] *= -1; for (const axis of p.axes) axis[0] *= -1; p.turn *= -1; }
  if (clock.strike > 0) { p.turn *= .45; p.crouch *= .4; p.coil = mix([.23, 1.28, .33], p.coil, .5); }
  const drive = move.drive ? 1.12 : 1;
  pose.hip = [-.035 * coil + .025 * force, .97 - p.crouch * coil - .04 * force, -.075 * coil + (intent === 'withdraw' || intent === 'evade' ? -.07 : .10) * force];
  pose.pitch = .07 - .10 * coil + p.lean * force;
  pose.twist = -.15 + p.turn * coil * drive - p.turn * .75 * force;
  pose.head = { pitch: .02, twist: pose.twist * .1, roll: 0 };
  const guard: Point = [.23, 1.28, .33], held = mix(guard, p.coil, load);
  const control: Point = [(p.coil[0] + p.contact[0]) / 2 + (alternate ? -.09 : .09), intent === 'anti-air' ? p.coil[1] : (p.coil[1] + p.contact[1]) / 2 + .08, p.contact[2] * .7];
  const strike = arc(held, control, p.contact, commit), exit = mix(strike, p.finish, follow);
  pose.right = mix(exit, guard, recover);
  pose.left = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.23, .44, .30]);
  pose.elbows = { left: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.65, .20, -.14]), right: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.65, .20, -.14]) };
  const angle = mix(mix(mix([.2, .9, 0], p.axes[0], load), p.axes[1], commit), p.axes[2], follow);
  pose.weapon = { axis: angleAxis(mix(angle, [.2, .9, 0], recover)), grip: -.7 };
  // Pivot about a planted rear toe; physics still owns all approach displacement.
  const pivot = clamp(force * (heavy ? .35 : .18));
  pose.feet = { leftPitch: 0, rightPitch: pivot };
  pose.rightFoot = [.205, .012 + .088 * Math.cos(pivot) + .188 * Math.sin(pivot), -.062 + .088 * Math.sin(pivot) - .188 * Math.cos(pivot)];
  pose.phase = clock.frame < s * .12 ? 'read' : clock.frame < s * .57 ? 'anticipation' : clock.frame < s ? 'commitment' : clock.frame < s + a ? 'impact' : recover < .01 ? 'follow-through' : 'recovery';
  return pose;
}
