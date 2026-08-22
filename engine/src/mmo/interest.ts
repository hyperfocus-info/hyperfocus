import type { MmoEntityData, MmoEntityRecord, MmoEntitySnapshot, MmoInterestTarget } from "./types.ts";
import type { MmoEntityRegistry } from "./entity-registry.ts";

export type MmoInterestSnapshotterConfig<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  registry: MmoEntityRegistry<TPublic, TOwner, TPrivate>;
  defaultRadius?: number;
  maxEntities?: number;
  includeGlobal?: boolean;
  useReadableViews?: boolean;
  filter?: (entity: MmoEntityRecord<TPublic, TOwner, TPrivate>, viewerId: string | undefined) => boolean;
};

export type MmoInterestSnapshot<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TMeta = unknown
> = {
  target: MmoInterestTarget;
  visibleIds: string[];
  entered: string[];
  left: string[];
  overflow: number;
  snapshot: MmoEntitySnapshot<TPublic, TOwner, TMeta>;
};

export type MmoInterestSnapshotter<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  snapshotFor<TMeta = unknown>(viewerId: string | undefined, target: Partial<MmoInterestTarget>, meta?: TMeta): MmoInterestSnapshot<TPublic, TOwner, TMeta>;
  visibleIdsFor(viewerId: string | undefined, target: Partial<MmoInterestTarget>): string[];
  clearViewer(viewerId: string): void;
};

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

type CandidateEntity<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
> = Readonly<MmoEntityRecord<TPublic, TOwner, TPrivate>>;

function normalizeTarget(target: Partial<MmoInterestTarget>, defaultRadius: number): MmoInterestTarget {
  return {
    x: Number.isFinite(target.x) ? Number(target.x) : 0,
    y: Number.isFinite(target.y) ? Number(target.y) : 0,
    radius: Number.isFinite(target.radius) && Number(target.radius) >= 0 ? Number(target.radius) : defaultRadius,
    zoneId: target.zoneId
  };
}

export function createMmoInterestSnapshotter<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
>(config: MmoInterestSnapshotterConfig<TPublic, TOwner, TPrivate>): MmoInterestSnapshotter<TPublic, TOwner, TPrivate> {
  const defaultRadius = config.defaultRadius ?? 512;
  const maxEntities = config.maxEntities ?? 256;
  if (!Number.isFinite(defaultRadius) || defaultRadius < 0) throw new RangeError("interest defaultRadius must be a non-negative finite number");
  if (!Number.isSafeInteger(maxEntities) || maxEntities < 0) throw new RangeError("interest maxEntities must be a non-negative safe integer");
  const includeGlobal = config.includeGlobal ?? true;
  const previousVisible = new Map<string, Set<string>>();

  function candidates(viewerId: string | undefined, target: MmoInterestTarget) {
    const radiusSq = target.radius * target.radius;
    const selected: Array<{ entity: CandidateEntity<TPublic, TOwner, TPrivate>; distanceSq: number }> = [];
    const collect = (entity: CandidateEntity<TPublic, TOwner, TPrivate>) => {
      if (target.zoneId && entity.zoneId && entity.zoneId !== target.zoneId && !entity.global) return;
      if (includeGlobal && entity.global) {
        selected.push({ entity, distanceSq: -1 });
        return;
      }
      const entityRadius = entity.radius ?? 0;
      const candidateDistanceSq = distanceSq(target.x, target.y, entity.x, entity.y);
      if (candidateDistanceSq <= (target.radius + entityRadius) * (target.radius + entityRadius) || radiusSq === Infinity) {
        selected.push({ entity, distanceSq: candidateDistanceSq });
      }
    };

    if (config.useReadableViews !== false && !config.filter && config.registry.forEachVisibleReadable) {
      config.registry.forEachVisibleReadable(viewerId, collect);
    } else {
      for (const entity of config.registry.all()) {
        if (!config.registry.canSee(viewerId, entity.id)) continue;
        if (config.filter && !config.filter(entity, viewerId)) continue;
        collect(entity);
      }
    }

    return selected.sort((a, b) => {
      const priority = (b.entity.priority ?? 0) - (a.entity.priority ?? 0);
      if (priority !== 0) return priority;
      const distance = a.distanceSq - b.distanceSq;
      if (distance !== 0) return distance;
      return a.entity.id.localeCompare(b.entity.id);
    });
  }

  return {
    snapshotFor(viewerId, partialTarget, meta) {
      const target = normalizeTarget(partialTarget, defaultRadius);
      const selected = candidates(viewerId, target);
      const visibleIds = selected.slice(0, maxEntities).map((candidate) => candidate.entity.id);
      const previous = previousVisible.get(viewerId ?? "") ?? new Set<string>();
      const next = new Set(visibleIds);
      const entered = visibleIds.filter((id) => !previous.has(id));
      const left = [...previous].filter((id) => !next.has(id));
      previousVisible.set(viewerId ?? "", next);
      return {
        target,
        visibleIds,
        entered,
        left,
        overflow: Math.max(0, selected.length - visibleIds.length),
        snapshot: config.registry.snapshot(viewerId, { ids: visibleIds, meta })
      };
    },
    visibleIdsFor(viewerId, target) {
      return candidates(viewerId, normalizeTarget(target, defaultRadius))
        .slice(0, maxEntities)
        .map((candidate) => candidate.entity.id);
    },
    clearViewer(viewerId) {
      previousVisible.delete(viewerId);
    }
  };
}
