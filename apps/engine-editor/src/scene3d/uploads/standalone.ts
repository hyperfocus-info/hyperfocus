import { roomUploadIdentity } from './policy.ts';
import { readAppearanceCatalog3D, type CombatProject3D, type createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import type { createCombatConnection } from '../network/connection.ts';
import { createEquippedUploads } from './equipped.ts';
import { createUploadRequestQueue } from './request-queue.ts';

/** Room identity and visibility belong to the application, not the portable renderer. */
export function createStandaloneUploads(options: {
  project: { extensions?: Record<string, unknown> }; runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>>;
  combat?: CombatProject3D; network(): ReturnType<typeof createCombatConnection> | undefined;
  visibility(): { hidden: boolean; blocked: string[] } | undefined;
}) {
  const catalog = readAppearanceCatalog3D(options.project.extensions?.hyperfocusAppearance, options.runtime.declaration);
  const identity = () => roomUploadIdentity(options.network()?.state);
  const request = createUploadRequestQueue({ identity, request: command => options.network()!.requestUpload(command) });
  const equipment = catalog ? createEquippedUploads({ catalog, runtime: options.runtime, request }) : undefined;
  return {
    request, textureSlots: catalog?.textureSlots,
    invalidate(ownerId: string) { equipment?.invalidate(ownerId); },
    render(replay: boolean) {
      if (!equipment) return;
      const state = options.network()?.state, actors: Array<{ actorId: string; ownerId: string }> = [];
      for (const [index, playerId] of (state?.matchSeats ?? []).entries()) {
        const actorId = options.combat?.fighters[index]?.entityId, ownerId = state?.profileBindings.find(binding => binding.playerId === playerId)?.userId;
        if (actorId && ownerId) actors.push({ actorId, ownerId });
      }
      if (!actors.length) {
        const actorId = options.combat?.fighters.find(fighter => fighter.control === 'player')?.entityId;
        const ownerId = state?.profileBindings.find(binding => binding.playerId === state.playerId)?.userId;
        if (actorId && ownerId) actors.push({ actorId, ownerId });
      }
      const visibility = options.visibility();
      const blocked = [...new Set([...(visibility?.blocked ?? []), ...(state?.quickPlay?.blockedUserIds ?? []), ...(state?.social?.blocked ?? []), ...(state?.roomImages.blockedUserIds ?? [])])];
      equipment.sync({ identity: identity(), active: !!identity() && !replay, actors, hidden: visibility?.hidden ?? false, blocked });
    },
    apply: equipment?.apply,
    emblem: (actorId: string) => equipment?.emblem(actorId),
    get state() { return equipment?.state; },
    dispose() { equipment?.dispose(); },
  };
}
