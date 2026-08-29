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
  _TPrivate extends MmoEntityData = MmoEntityData
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

function cloneData<TData extends MmoEntityData>(data: TData | undefined): TData | undefined {
  return data === undefined ? undefined : { ...data };
}

function isOwner(viewerId: string | undefined, ownerId: string | undefined) {
  return Boolean(viewerId && ownerId && viewerId === ownerId);
}

function isIterable<TEntity>(value: Record<string, TEntity> | Iterable<TEntity>): value is Iterable<TEntity> {
  const iterator: unknown = Reflect.get(value, Symbol.iterator);
  return typeof iterator === "function";
}

function sourceValues<TEntity>(source: MmoEntityCollectionSource<TEntity>): TEntity[] {
  const value = typeof source === "function" ? source() : source;
  if (isIterable(value)) return [...value];
  return Object.values(value);
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
  const replicated = {
    id: entity.id,
    type: entity.type,
    x: entity.x,
    y: entity.y,
    zoneId: entity.zoneId,
    radius: entity.radius,
    priority: entity.priority,
    global: entity.global,
    tags: entity.tags ? [...entity.tags] : undefined,
    revision: entity.revision ?? 0,
    publicData: cloneData(entity.publicData),
    ownerData: owner ? cloneData(entity.ownerData) : undefined
  };
  if (visibility === "owner") {
    const ownerId = entity.ownerId;
    if (ownerId === undefined) return undefined;
    return { ...replicated, visibility: "owner", ownerId };
  }
  return { ...replicated, visibility: "public", ownerId: entity.ownerId };
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

  function select<TView>(
    selector: (
      entity: MmoEntityCollectionVisibleEntity<TPublic, TOwner>,
      context: { viewerId: string | undefined; owner: boolean }
    ) => TView | undefined,
    options: MmoEntityCollectionSelectOptions<TPublic, TOwner> = {}
  ): TView[] {
    const result: TView[] = [];
    for (const entity of all(options)) {
      const selected = selector(entity, { viewerId: options.viewerId, owner: isOwner(options.viewerId, entity.ownerId) });
      if (selected !== undefined) result.push(selected);
    }
    return result;
  }

  function selectOne<TView>(
    selector: (
      entity: MmoEntityCollectionVisibleEntity<TPublic, TOwner>,
      context: { viewerId: string | undefined; owner: boolean }
    ) => TView | undefined,
    options: MmoEntityCollectionSelectOptions<TPublic, TOwner> = {}
  ): TView | undefined {
    for (const entity of all(options)) {
      const selected = selector(entity, { viewerId: options.viewerId, owner: isOwner(options.viewerId, entity.ownerId) });
      if (selected !== undefined) return selected;
    }
    return undefined;
  }

  return {
    all,
    select,
    selectOne,
    ids(options) {
      return all(options).map((entity) => entity.id);
    },
    get(id, options) {
      return all(options).find((entity) => entity.id === id);
    }
  };
}
