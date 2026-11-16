import { resolveAppearance3D, type AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import type { ReplayAppearance } from '../replay/appearance.ts';

/** Recorded seat order, independent of local controls and current account. */
export function replayAppearanceActors(options: { appearance?: ReplayAppearance; fighters: readonly { entityId: string }[] }) {
  return (options.appearance?.fighters ?? []).flatMap((look, index) => {
    if (!look) return [];
    const actorId = options.fighters[index]?.entityId;
    if (!actorId) throw new Error('Replay appearance references a missing fighter.');
    return [{ actorId, look }];
  });
}

export function validateReplayCatalog(options: { appearance?: ReplayAppearance; fighters: readonly { entityId: string }[]; catalog: AppearanceCatalog3D }) {
  for (const { actorId, look } of replayAppearanceActors(options)) resolveAppearance3D({ catalog: options.catalog, actorId, selections: look.selections });
}
