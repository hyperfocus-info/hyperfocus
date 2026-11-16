import { sampleArtMotion, type ArtMotion } from '../motion.ts';
import { blendArtMotion } from '../transition.ts';
import type { ReactionAction, InteractionAction } from './catalogue.ts';
import { clamp, mix, ready, smooth } from './curves.ts';

export function sampleReaction(action: ReactionAction, frame: number, duration = 45): ArtMotion {
  const pose = ready(frame), t = clamp(frame / duration), recoil = (1 - smooth(t)) * (.7 + .3 * smooth(frame / 3));
  pose.phase = action;
  if (action === 'hit-light' || action === 'hit-heavy' || action === 'air-hit') return sampleArtMotion({ kind: 'hit', frame, reactionFrames: duration, strength: action === 'hit-light' ? .48 : 1, elevation: action === 'air-hit' ? .5 : 0 });
  if (action === 'guard' || action === 'guard-walk' || action === 'block' || action === 'parry') {
    pose.left = [-.15, 1.63, .30]; pose.right = [.17, 1.59, .29]; pose.hip[1] -= .025; pose.twist = -.05;
    if (action === 'block') { pose.pitch -= .13 * recoil; pose.hip[2] -= .045 * recoil; }
    if (action === 'parry') { pose.left = [-.34 * recoil - .15 * (1 - recoil), 1.57, .32]; pose.twist -= .24 * recoil; }
    return pose;
  }
  if (action === 'guard-break' || action === 'parried') {
    pose.left = mix(pose.left, [-.44, 1.30, .16], recoil); pose.right = mix(pose.right, [.43, 1.22, .09], recoil);
    pose.pitch -= .23 * recoil; pose.twist += .2 * recoil; pose.hip[1] -= .09 * recoil;
    pose.head = { pitch: -.16 * recoil, twist: -.1 * recoil, roll: .04 * recoil }; return pose;
  }
  if (action === 'wall-impact') {
    pose.pitch = -.18 * recoil; pose.left = [-.41, 1.31, .1]; pose.right = [.4, 1.33, .1];
    pose.leftFoot[1] += .12 * recoil; pose.rightFoot[1] += .19 * recoil; return pose;
  }
  if (action === 'knockout' || action === 'floor-impact' || action === 'get-up' || action === 'surface-tech') {
    const prone = ready(); prone.phase = action; prone.hip = [0, .23, 0]; prone.pitch = -1.28; prone.twist = 0;
    prone.head = { pitch: -1.20, twist: -.10, roll: 0 };
    prone.left = [-.39, .20, -.36]; prone.right = [.36, .24, -.40]; prone.leftFoot = [-.18, .12, .79]; prone.rightFoot = [.25, .15, .72];
    const crouch = ready(); crouch.hip = [0, .64, .02]; crouch.pitch = .35; crouch.left = [-.24, .71, .48]; crouch.right = [.3, 1.06, .22]; crouch.rightFoot = [.23, .12, -.32];
    if (action === 'get-up' || action === 'surface-tech') {
      const split = action === 'surface-tech' ? .28 : .48;
      return frame < duration * split ? blendArtMotion({ from: prone, to: crouch, weight: smooth(t / split) }) : blendArtMotion({ from: crouch, to: ready(), weight: smooth((t - split) / (1 - split)) });
    }
    return blendArtMotion({ from: ready(), to: prone, weight: smooth(frame / (action === 'floor-impact' ? 8 : 25)) });
  }
  if (action === 'victory') { pose.left = [-.25, 1.07, .13]; pose.right = [.27, 1.15 + .1 * smooth(t), .2]; pose.pitch = 0; pose.head = { pitch: -.025, twist: .1 * Math.sin(t * Math.PI), roll: 0 }; }
  if (action === 'exhausted') { pose.pitch = .23; pose.hip[1] -= .08; pose.left = [-.23, 1.0, .28]; pose.right = [.23, 1.02, .27]; pose.hip[1] += .008 * Math.sin(frame / 6); }
  return pose;
}

export function sampleInteraction(action: InteractionAction, frame: number, duration = 60): ArtMotion {
  const pose = ready(), t = clamp(frame / duration), reach = Math.sin(Math.PI * t), commit = smooth(t / .5), recover = smooth((t - .55) / .45);
  pose.phase = action;
  if (action === 'pickup') {
    pose.hip[1] -= .22 * reach; pose.pitch += .44 * reach;
    pose.right = mix(pose.right, [.26, .72, .48], reach); pose.left = mix(pose.left, [-.27, 1.02, .23], reach);
  } else if (action === 'weapon-throw') {
    pose.twist += .30 * Math.sin(t * Math.PI * 2); pose.pitch += .1 * reach;
    pose.right = t < .5 ? mix([.27, 1.40, .28], [.34, 1.66, .03], smooth(t / .5)) : mix([.34, 1.66, .03], [.1, 1.39, .56], smooth((t - .5) / .22));
    pose.right = mix(pose.right, ready().right, recover);
  } else if (action === 'weapon-drop') { pose.right = mix(pose.right, [.32, 1.0, .16], reach); }
  else if (action.startsWith('grapple')) {
    pose.hip[1] -= .075 * reach; pose.pitch += .10 * reach;
    pose.left = [-.23, 1.40, .48]; pose.right = [.23, 1.32, .48];
    if (action === 'grapple-reach') { pose.left = mix(ready().left, pose.left, commit * (1 - recover)); pose.right = mix(ready().right, pose.right, commit * (1 - recover)); }
    if (action === 'grapple-held') { pose.pitch = .16; pose.left = [-.31, 1.36, .31]; pose.right = [.31, 1.37, .3]; }
    if (action === 'grapple-throw') { pose.twist = -.15 - .50 * reach; pose.hip[1] -= .12 * reach; pose.right[0] -= .3 * reach; pose.left[0] -= .16 * reach; pose.right[1] -= .16 * reach; }
    if (action === 'grapple-tech') { pose.left[0] -= .16 * reach; pose.right[0] += .16 * reach; pose.pitch -= .14 * reach; }
  }
  return pose;
}
