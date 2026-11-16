import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentLegacyIntroPose } from '../appearance/legacy-intro.ts';
import { createAppearancePosePresenter3D } from '../appearance/pose.ts';
import type { ResolvedAppearancePose3D } from '../appearance/catalog.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];


/** Separate presentation memory only: repeated evaluation cannot accumulate pose offsets. */
export function createCombatIntroPose3D() {
  const cosmetic = createAppearancePosePresenter3D();
  const originals = new WeakMap<Hyperfocus3DEvaluatedFrame, Map<string, Entity>>();
  return (options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; progress: number; settle: number; poses?: readonly ResolvedAppearancePose3D[] }) => {
    const { frame, state, progress, settle } = options;
    let bases = originals.get(frame);
    if (!bases) {
      bases = new Map(frame.entities.filter(entity => state.fighters.some(fighter => entity.id === fighter.id || ['head', 'hair', 'face', 'left-hand', 'right-hand', 'left-arm', 'right-arm', 'left-forearm', 'right-forearm'].some(part => entity.id === `${fighter.id}:${part}`))).map(entity => [entity.id, structuredClone(entity)]));
      originals.set(frame, bases);
    }
    for (const entity of frame.entities) { const base = bases.get(entity.id); if (base) { entity.position = [...base.position]; entity.rotation = [...base.rotation]; entity.scale = [...base.scale]; } }
    const weight = smooth(progress / .12) * settle;
    if (weight <= 0) return;
    for (const [index, fighter] of state.fighters.entries()) {
      const style = options.poses?.find(pose => pose.actorId === fighter.id && pose.phase === 'intro')?.style;
      if (style && style !== 'default') { cosmetic({ frame, actorId: fighter.id, style, progress, settle });continue; }
      presentLegacyIntroPose(frame, fighter, index, progress, weight);
    }
  };
}
