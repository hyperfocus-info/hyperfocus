import { artTorsoPoint, type ArtMotion } from '../motion.ts';
import { sampleUniversalCombat } from '../universal-combat.ts';
import { sampleUniversalLocomotion, universalLocomotionProfile, type UniversalLocomotionBank } from '../universal-locomotion.ts';
import { blendArtMotion } from '../transition.ts';
import type { TraversalAction } from './catalogue.ts';
import { clamp, smooth, ready } from './curves.ts';

/** Pose only: the simulation owns displacement, wall contact and air resources. */
export function sampleTraversal(bank: UniversalLocomotionBank, action: TraversalAction, frame: number, duration = 60): ArtMotion {
  const pose = ready(frame), t = clamp(frame / Math.max(1, duration)), cycle = frame / 60;
  pose.phase = action;
  if (action === 'idle') return sampleUniversalCombat(bank, { kind: 'idle', frame });
  if (action === 'walk' || action === 'run' || action === 'sprint') {
    const speed = action === 'walk' ? 1.6 : 3;
    const gait = sampleUniversalLocomotion(bank, { cycle: cycle * speed / universalLocomotionProfile(bank, speed).stride, speed, weight: 1 });
    // Sprint adds intention, not the rejected high-knee source amplitude.
    if (action === 'sprint') { gait.pitch += .035; gait.head = { pitch: .02, twist: 0, roll: 0 }; }
    return { ...gait, phase: action };
  }
  if (action.startsWith('wall-run')) {
    const sign = action === 'wall-run-left' ? -1 : 1, phase = frame * Math.PI / 19;
    pose.hip = [sign * .07, .91 + .015 * Math.sin(phase * 2), 0];
    pose.pitch = .13; pose.roll = -sign * .13; pose.twist = sign * .12;
    // Wall-side boot reaches the wall; the other leg cycles beneath the pelvis.
    const wallFoot: ArtMotion['leftFoot'] = [sign * .48, .35 + .07 * Math.sin(phase), .16 * Math.cos(phase)];
    const freeFoot: ArtMotion['leftFoot'] = [-sign * .13, .13 + .08 * Math.max(0, -Math.sin(phase)), -.20 * Math.cos(phase)];
    pose.leftFoot = sign < 0 ? wallFoot : freeFoot; pose.rightFoot = sign > 0 ? wallFoot : freeFoot;
    pose.left = [-.32, 1.31, .22 + .09 * Math.sin(phase)]; pose.right = [.32, 1.31, .22 - .09 * Math.sin(phase)];
    pose.head = { pitch: .02, twist: -sign * .04, roll: 0 };
    return pose;
  }
  if (action === 'wall-slide') {
    pose.hip = [0, .84, -.08]; pose.pitch = -.1;
    pose.left = [-.32, 1.38, -.23]; pose.right = [.32, 1.38, -.23];
    pose.leftFoot = [-.18, .18, .23]; pose.rightFoot = [.19, .29, .27];
    return pose;
  }
  if (action.startsWith('dash') || action === 'air-dash') {
    const side = action === 'dash-left' ? -1 : action === 'dash-right' ? 1 : 0;
    const back = action === 'dash-back', brake = action === 'dash-brake';
    const drive = brake ? 1 - smooth(t) : smooth(frame / Math.max(3, duration * .2)) * (1 - .3 * smooth((t - .65) / .35));
    pose.hip = [side * .09 * drive, .97 - .1 * drive, back ? -.07 * drive : .035 * drive];
    pose.pitch = .07 + (back || brake ? -.17 : .19) * drive; pose.roll = -side * .14 * drive;
    pose.leftFoot = [-.205 + side * .14 * drive, .10 + (action === 'air-dash' ? .11 : 0), .21 + (back ? -.30 : .11) * drive];
    pose.rightFoot = [.205 + side * .14 * drive, .10 + (action === 'air-dash' ? .16 : .03 * drive), -.25 - (back ? -.25 : .16) * drive];
    pose.left = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.23, .46, .30]);
    pose.right = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.25, .31, .20 - .05 * drive]);
    pose.elbows = { left: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.39, .22, -.07]), right: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.39, .22, -.07]) };
    pose.head = { pitch: .025, twist: 0, roll: 0 };
    return pose;
  }
  if (action === 'land-soft' || action === 'land-hard' || action === 'jump-start') {
    const compression = action === 'jump-start' ? Math.sin(t * Math.PI) : (1 - smooth(t)) * (action === 'land-hard' ? 1 : .5);
    pose.hip[1] -= .19 * compression; pose.pitch += .19 * compression;
    pose.left = [-.29, 1.43 - .2 * compression, .26]; pose.right = [.29, 1.36 - .2 * compression, .29];
    pose.head = { pitch: .06 * compression, twist: 0, roll: 0 };
    return pose;
  }
  const lift = action === 'jump-rise' || action === 'double-jump' || action === 'wall-jump';
  pose.hip = [0, .97, 0]; pose.pitch = lift ? .09 : -.035;
  pose.leftFoot = [-.19, lift ? .27 : .15, .23]; pose.rightFoot = [.19, lift ? .19 : .22, -.24];
  pose.left = [-.29, lift ? 1.53 : 1.40, .28]; pose.right = [.30, lift ? 1.41 : 1.34, .21];
  if (action === 'double-jump') { pose.leftFoot[1] += .10 * Math.sin(Math.PI * t); pose.twist = -.18 + .24 * Math.sin(Math.PI * t); }
  if (action === 'wall-jump') { pose.roll = .12 * (1 - t); pose.rightFoot = [.36, .34, -.13]; }
  return blendArtMotion({ from: ready(), to: pose, weight: action === 'air-steer' ? .65 : 1 });
}
