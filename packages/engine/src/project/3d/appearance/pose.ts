import { atan2, cos, sin } from '../../../math/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { AppearancePose3D } from './catalog.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import { presentLegacyIntroPose } from './legacy-intro.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];
type Vec = Entity['position'];
const smooth = (t: number) => t * t * (3 - 2 * t);
const blend = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const parts = ['', ':head', ':hair', ':face', ':left-hand', ':right-hand', ':left-arm', ':right-arm', ':left-forearm', ':right-forearm'];

/** Curated humanoid presentation on evaluated frames only. Fresh frames remain caller-owned. */
export function createAppearancePosePresenter3D() {
  const originals = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity>>();
  return (options: { frame: Hyperfocus3DEvaluatedFrame; actorId: string; style: AppearancePose3D['style']; progress: number; settle: number; phase?: AppearancePose3D['phase']; fighterIndex?: 0 | 1 }) => {
    const { frame, actorId, style, progress, settle } = options;
    if (![progress, settle].every(value => Number.isFinite(value) && value >= 0 && value <= 1) || !['default', 'bow', 'salute', 'fists-up'].includes(style)) throw new Error('Invalid appearance pose presentation.');
    let bases = originals.get(frame);if (!bases) { bases = new Map();originals.set(frame, bases); }
    const affected = frame.entities.filter(entity => parts.some(part => entity.id === actorId + part));
    for (const entity of affected) {
      if (!bases.has(entity.id)) bases.set(entity.id, structuredClone(entity));
      const base = bases.get(entity.id)!;entity.position = [...base.position];entity.rotation = [...base.rotation];entity.scale = [...base.scale];
    }
    if (style === 'default' && options.phase !== 'intro') return;
    const root = affected.find(entity => entity.id === actorId), head = affected.find(entity => entity.id === `${actorId}:head`);
    if (!root || !head) return;
    const weight = smooth(Math.min(1, progress / .12)) * settle;if (weight === 0) return;
    const [x, y, z, w] = root.rotation, yaw = atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    if (style === 'default') { presentLegacyIntroPose(frame, { id: actorId, facing: { x: sin(yaw), z: cos(yaw) } }, options.fighterIndex ?? 0, progress, weight);return; }
    const pitch = style === 'bow' ? .48 * weight : 0;
    const point = (local: Vec): Vec => [root.position[0] + local[0] * cos(yaw) + local[2] * sin(yaw), root.position[1] + local[1], root.position[2] - local[0] * sin(yaw) + local[2] * cos(yaw)];
    if (style === 'bow') {
      root.rotation = [sin(pitch / 2) * cos(yaw / 2), sin(yaw / 2) * cos(pitch / 2), -sin(yaw / 2) * sin(pitch / 2), cos(yaw / 2) * cos(pitch / 2)];
      for (const name of ['head', 'hair', 'face']) {
        const entity = affected.find(entity => entity.id === `${actorId}:${name}`);if (!entity) continue;
        entity.position = [entity.position[0] + .22 * weight * sin(yaw), entity.position[1] - .12 * weight, entity.position[2] + .22 * weight * cos(yaw)];entity.rotation = [...root.rotation];
      }
    }
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'left' : 'right', hand = affected.find(entity => entity.id === `${actorId}:${name}-hand`), arm = affected.find(entity => entity.id === `${actorId}:${name}-arm`), forearm = affected.find(entity => entity.id === `${actorId}:${name}-forearm`);
      if (!hand || !arm || !forearm) continue;
      const target: Vec = style === 'fists-up' ? [side * .48, .93, .12] : style === 'salute' && side > 0 ? [.28, .88, .23] : [side * .3, .04, .16];
      hand.position = blend(hand.position, point(target), weight);
      const shoulder = point([side * .32, .38, 0]);
      const baseElbow: Vec = [arm.position[0] + forearm.position[0] - (shoulder[0] + hand.position[0]) / 2, arm.position[1] + forearm.position[1] - (shoulder[1] + hand.position[1]) / 2, arm.position[2] + forearm.position[2] - (shoulder[2] + hand.position[2]) / 2];
      const elbow = blend(baseElbow, point([side * .58, style === 'fists-up' || style === 'salute' && side > 0 ? .5 : .16, .08]), weight);
      poseCombatLimb(arm, shoulder, elbow, .2);poseCombatLimb(forearm, elbow, hand.position, .18);
    }
  };
}
