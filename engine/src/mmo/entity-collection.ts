import type { MmoEntityData, MmoEntityRecord, MmoEntityVisibility, MmoReplicatedEntity } from "./types.ts";

export type MmoEntityCollectionSource<TEntity> = Record<string, TEntity> | Iterable<TEntity> | (() => Record<string, TEntity> | Iterable<TEntity>);

export type MmoEntityCollectionVisibleEntity<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = MmoReplicatedEntity<TPublic, TOwner>;

export type MmoEntityCollectionSelectOptions<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = {
  viewerId?: string;
  filter?: (entity: MmoEntityCollectionVisibleEntity<TPublic, TOwner>) => boolean;
  sort?: (a: MmoEntityCollectionVisibleEntity<TPublic, TOwner>, b: MmoEntityCollectionVisibleEntity<TPublic, TOwner>) => number;
};

export type MmoEntityCollectionBridge<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  all(options?: MmoEntityCollectionSelectOptions<TPublic, TOwner>): Array<MmoEntityCollectionVisibleEntity<TPublic, TOwner>>;
  ids(options?: MmoEntityCollectionSelectOptions<TPublic, TOwner>): string[];
  get(id: string, options?: Pick<MmoEntityCollectionSelectOptions<TPublic, TOwner>, "viewerId">): MmoEntityCollectionVisibleEntity<TPublic, TOwner> | undefined;
  select<TView>(
    selector: (
      entity: MmoEntityCollectionVisibleEntity<TPublic, TOwner>,
      context: { viewerId: string | undefined; owner: boolean }
    ) => TView | undefined,
    options?: MmoEntityCollectionSelectOptions<TPublic, TOwner>
  ): TView[];
  selectOne<TView>(
    selector: (
      entity: MmoEntityCollectionVisibleEntity<TPublic, TOwner>,
      context: { viewerId: string | undefined; owner: boolean }
    ) => TView | undefined,
    options?: MmoEntityCollectionSelectOptions<TPublic, TOwner>
  ): TView | undefined;
};

export type MmoEntityCollectionBridgeConfig<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  entities: MmoEntityCollectionSource<MmoEntityRecord<TPublic, TOwner, TPrivate>>;
  defaultVisibility?: MmoEntityVisibility;
};

const emptyData = Object.freeze({}) as MmoEntityData;

function cloneData<TData extends MmoEntityData>(data: TData | undefined): TData {
  return (data ? { ...data } : emptyData) as TData;
}

function isOwner(viewerId: string | undefined, ownerId: string | undefined) {
  return Boolean(viewerId && ownerId && viewerId === ownerId);
}

function sourceValues<TEntity>(source: MmoEntityCollectionSource<TEntity>) {
  const value = typeof source === "function" ? source() : source;
  if (typeof (value as Iterable<TEntity>)[Symbol.iterator] === "function") return [...(value as Iterable<TEntity>)];
  return Object.values(value as Record<string, TEntity>);
}

function visibleEntity<TPublic extends MmoEntityData, TOwner extends MmoEntityData, TPrivate extends MmoEntityData>(
  entity: MmoEntityRecord<TPublic, TOwner, TPrivate>,
  viewerId: string | undefined,
  defaultVisibility: MmoEntityVisibility
): MmoEntityCollectionVisibleEntity<TPublic, TOwner> | undefined {
  const visibility = entity.visibility ?? defaultVisibility;
  const owner = isOwner(viewerId, entity.ownerId);
  if (visibility === "private") return undefined;
  if (visibility === "owner" && !owner) return undefined;
  return {
    id: entity.id,
    type: entity.type,
    x: entity.x,
    y: entity.y,
    zoneId: entity.zoneId,
    ownerId: entity.ownerId,
    visibility: visibility === "owner" ? "owner" : "public",
    radius: entity.radius,
    priority: entity.priority,
    global: entity.global,
    tags: entity.tags ? [...entity.tags] : undefined,
    revision: entity.revision ?? 0,
    publicData: cloneData(entity.publicData),
    ownerData: owner ? cloneData(entity.ownerData) : undefined
  };
}

export function createMmoEntityCollectionBridge<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
>(
  config: MmoEntityCollectionBridgeConfig<TPublic, TOwner, TPrivate>
): MmoEntityCollectionBridge<TPublic, TOwner, TPrivate> {
  const defaultVisibility = config.defaultVisibility ?? "public";

  function all(options: MmoEntityCollectionSelectOptions<TPublic, TOwner> = {}) {
    const views = sourceValues(config.entities)
      .map((entity) => visibleEntity(entity, options.viewerId, defaultVisibility))
      .filter((entity): entity is MmoEntityCollectionVisibleEntity<TPublic, TOwner> => Boolean(entity))
      .filter((entity) => !options.filter || options.filter(entity));
    return views.sort(options.sort ?? ((a, b) => a.id.localeCompare(b.id)));
  }

  return {
    all,
    ids(options) {
      return all(options).map((entity) => entity.id);
    },
    get(id, options) {
      return all(options).find((entity) => entity.id === id);
    },
    select(selector, options = {}) {
      const result: unknown[] = [];
      for (const entity of all(options)) {
        const selected = selector(entity, { viewerId: options.viewerId, owner: isOwner(options.viewerId, entity.ownerId) });
        if (selected !== undefined) result.push(selected);
      }
      return result as Exclude<ReturnType<typeof selector>, undefined>[];
    },
    selectOne(selector, options = {}) {
      for (const entity of all(options)) {
        const selected = selector(entity, { viewerId: options.viewerId, owner: isOwner(options.viewerId, entity.ownerId) });
        if (selected !== undefined) return selected;
      }
      return undefined;
    }
  };
}
