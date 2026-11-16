import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import { atan2, cos, sin } from '../../../math/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
type Vec = Entity['position'];
const blend = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Shared legacy gesture leaf: callers own baseline restoration and phase gating. */
export function presentLegacyIntroPose(frame: Hyperfocus3DEvaluatedFrame, fighter: { id: string; facing: { x: number; z: number } }, index: number, progress: number, weight: number) {
const gesture = 1 - smooth((progress - .45) / .4);
      const root = frame.entities.find(entity => entity.id === fighter.id);
      if (!root || !frame.entities.some(entity => entity.id === `${fighter.id}:head`)) return;
      const yaw = atan2(fighter.facing.x, fighter.facing.z) + (index % 2 ? -.12 : .12) * gesture * weight;
      const pitch = (index % 2 ? .12 : -.08) * gesture * weight;
      const point = (local: Vec): Vec => {
        const y = local[1] * cos(pitch) - local[2] * sin(pitch), z = local[1] * sin(pitch) + local[2] * cos(pitch);
        return [root.position[0] + local[0] * cos(yaw) + z * sin(yaw), root.position[1] + y, root.position[2] - local[0] * sin(yaw) + z * cos(yaw)];
      };
      const rotation = (headPitch = pitch): Entity['rotation'] => [sin(headPitch / 2) * cos(yaw / 2), sin(yaw / 2) * cos(headPitch / 2), -sin(yaw / 2) * sin(headPitch / 2), cos(yaw / 2) * cos(headPitch / 2)];
      root.rotation = rotation();
      const nod = -.1 * sin(progress * Math.PI) * weight;
      const head = point([0, .78, 0]);
      for (const [name, offset] of [['head', [0, 0, 0]], ['hair', [0, .22, -.02]], ['face', [0, -.02, .22]]] as const) {
        const entity = frame.entities.find(item => item.id === `${fighter.id}:${name}`);
        if (!entity) continue;
        const dy = offset[1] * cos(pitch + nod) - offset[2] * sin(pitch + nod), dz = offset[1] * sin(pitch + nod) + offset[2] * cos(pitch + nod);
        entity.position = blend(entity.position, [head[0] + dz * sin(yaw), head[1] + dy, head[2] + dz * cos(yaw)], weight);
        entity.rotation = rotation(pitch + nod);
      }
      for (const side of [-1, 1]) {
        const name = side < 0 ? 'left' : 'right';
        const hand = frame.entities.find(entity => entity.id === `${fighter.id}:${name}-hand`);
        const arm = frame.entities.find(entity => entity.id === `${fighter.id}:${name}-arm`);
        const forearm = frame.entities.find(entity => entity.id === `${fighter.id}:${name}-forearm`);
        if (!hand || !arm || !forearm) continue;
        const ready: Vec = [side * .3, .44, .46];
        const signature: Vec = index % 2 ? side < 0 ? [.12, .48, .5] : [.38, .51, .22] : side > 0 ? [.3, .94, .18] : [-.3, .26, .45];
        hand.position = blend(hand.position, point(blend(ready, signature, gesture)), weight);
        const shoulder = point([side * .32, .38, 0]);
        const baseElbow: Vec = [arm.position[0] + forearm.position[0] - (shoulder[0] + hand.position[0]) / 2, arm.position[1] + forearm.position[1] - (shoulder[1] + hand.position[1]) / 2, arm.position[2] + forearm.position[2] - (shoulder[2] + hand.position[2]) / 2];
        const elbow = blend(baseElbow, point([side * (.48 + gesture * .07), .18 + gesture * (index % 2 ? .13 : side > 0 ? .35 : .08), .12]), weight);
        poseCombatLimb(arm, shoulder, elbow, .2); poseCombatLimb(forearm, elbow, hand.position, .18);
      }
}
