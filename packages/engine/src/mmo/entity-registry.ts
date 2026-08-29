import type {
  MmoEncodedEntitySnapshot,
  MmoEntityData,
  MmoEntityPatch,
  MmoEntityRecord,
  MmoEntitySnapshot,
  MmoEntityVisibility,
  MmoInterestEntity,
  MmoReplicatedEntity
} from "./types.ts";

export type MmoEntityRegistryConfig<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  initialEntities?: Iterable<MmoEntityRecord<TPublic, TOwner, TPrivate>>;
  defaultVisibility?: MmoEntityVisibility;
};

export type MmoEntitySnapshotOptions<TMeta = unknown> = {
  ids?: Iterable<string>;
  meta?: TMeta;
};

export type MmoEntityRegistry<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  upsert(entity: MmoEntityRecord<TPublic, TOwner, TPrivate>): MmoEntityRecord<TPublic, TOwner, TPrivate>;
  patch(id: string, patch: MmoEntityPatch<TPublic, TOwner, TPrivate>): boolean;
  remove(id: string): boolean;
  clear(): void;
  get(id: string): MmoEntityRecord<TPublic, TOwner, TPrivate> | undefined;
  all(): Array<MmoEntityRecord<TPublic, TOwner, TPrivate>>;
  has(id: string): boolean;
  size(): number;
  revision(): number;
  canSee(viewerId: string | undefined, id: string): boolean;
  snapshot<TMeta = unknown>(viewerId?: string, options?: MmoEntitySnapshotOptions<TMeta>): MmoEntitySnapshot<TPublic, TOwner, TMeta>;
  encodeSnapshot<TMeta = unknown>(snapshot: MmoEntitySnapshot<TPublic, TOwner, TMeta>): MmoEncodedEntitySnapshot<TPublic, TOwner, TMeta>;
  decodeSnapshot<TMeta = unknown>(snapshot: MmoEncodedEntitySnapshot<TPublic, TOwner, TMeta>): MmoEntitySnapshot<TPublic, TOwner, TMeta>;
  applySnapshot(snapshot: MmoEntitySnapshot<TPublic, TOwner>): void;
  toInterestEntities(ids?: Iterable<string>): MmoInterestEntity[];
  forEachVisibleReadable?(
    viewerId: string | undefined,
    visit: (entity: Readonly<MmoEntityRecord<TPublic, TOwner, TPrivate>>) => void
  ): void;
};

function cloneValue<T>(value: T): T {
  assertStructuredCloneValue(value);
  try {
    return structuredClone(value);
  } catch (cause) {
    throw new TypeError(`MMO entity data contains a non-cloneable value: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function assertStructuredCloneValue(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === "function" || typeof value === "symbol") throw new TypeError("MMO entity data contains a non-cloneable value");
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      assertStructuredCloneValue(key, seen);
      assertStructuredCloneValue(entry, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const entry of value) assertStructuredCloneValue(entry, seen);
    return;
  }
  for (const entry of Object.values(value)) assertStructuredCloneValue(entry, seen);
}

function cloneData<TData extends MmoEntityData>(data: TData | undefined): TData | undefined {
  return data === undefined ? undefined : cloneValue(data);
}

function emptyEntityMap<TEntity>(): Record<string, TEntity> {
  const entities: Record<string, TEntity> = Object.create(null);
  return entities;
}

function setEntity<TEntity>(entities: Record<string, TEntity>, id: string, entity: TEntity) {
  Object.defineProperty(entities, id, {
    value: entity,
    configurable: true,
    enumerable: true,
    writable: true
  });
}

function compareEntityIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneEntity<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
>(entity: MmoEntityRecord<TPublic, TOwner, TPrivate>): MmoEntityRecord<TPublic, TOwner, TPrivate> {
  const clone = {
    ...entity,
    tags: entity.tags ? [...entity.tags] : undefined,
    publicData: cloneData(entity.publicData),
    ownerData: cloneData(entity.ownerData),
    privateData: cloneData(entity.privateData)
  };
  if (entity.visibility === "owner") return { ...clone, visibility: "owner", ownerId: entity.ownerId };
  if (entity.visibility === "private") return { ...clone, visibility: "private", ownerId: entity.ownerId };
  return { ...clone, visibility: entity.visibility, ownerId: entity.ownerId };
}

type MmoEntityCandidate<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
> = Omit<MmoEntityRecord<TPublic, TOwner, TPrivate>, "visibility" | "ownerId"> & {
  visibility?: MmoEntityVisibility;
  ownerId?: string;
};

function normalizeEntity<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
>(
  entity: MmoEntityCandidate<TPublic, TOwner, TPrivate>,
  defaultVisibility: MmoEntityVisibility,
  revision: number
): MmoEntityRecord<TPublic, TOwner, TPrivate> {
  if (typeof entity.id !== "string" || !entity.id) throw new Error("MMO entity id is required");
  if (typeof entity.type !== "string" || !entity.type) throw new Error(`MMO entity ${entity.id} type is required`);
  if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) throw new Error(`MMO entity ${entity.id} position must be finite`);
  if (entity.zoneId !== undefined && typeof entity.zoneId !== "string") throw new Error(`MMO entity ${entity.id} zoneId must be a string`);
  if (entity.ownerId !== undefined && typeof entity.ownerId !== "string") throw new Error(`MMO entity ${entity.id} ownerId must be a string`);
  if (entity.radius !== undefined && (!Number.isFinite(entity.radius) || entity.radius < 0)) {
    throw new Error(`MMO entity ${entity.id} radius must be a non-negative finite number`);
  }
  if (entity.priority !== undefined && !Number.isFinite(entity.priority)) throw new Error(`MMO entity ${entity.id} priority must be finite`);
  if (entity.global !== undefined && typeof entity.global !== "boolean") throw new Error(`MMO entity ${entity.id} global must be boolean`);
  if (entity.visibility !== undefined && entity.visibility !== "public" && entity.visibility !== "owner" && entity.visibility !== "private") {
    throw new Error(`MMO entity ${entity.id} visibility is invalid`);
  }
  const visibility = entity.visibility ?? defaultVisibility;
  const ownerId = entity.ownerId;
  if (entity.tags !== undefined && (!Array.isArray(entity.tags) || entity.tags.some((tag) => typeof tag !== "string"))) {
    throw new Error(`MMO entity ${entity.id} tags must be strings`);
  }
  const normalized = {
    ...entity,
    tags: entity.tags ? [...entity.tags] : undefined,
    revision,
    publicData: cloneData(entity.publicData),
    ownerData: cloneData(entity.ownerData),
    privateData: cloneData(entity.privateData)
  };
  if (visibility === "owner") {
    if (!ownerId) throw new Error(`MMO entity ${entity.id} owner visibility requires ownerId`);
    return { ...normalized, visibility, ownerId };
  }
  if (visibility === "private") return { ...normalized, visibility, ownerId };
  return { ...normalized, visibility, ownerId };
}

function isOwner(viewerId: string | undefined, ownerId: string | undefined) {
  return Boolean(viewerId && ownerId && viewerId === ownerId);
}

function entityVisibleTo<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
>(entity: MmoEntityRecord<TPublic, TOwner, TPrivate>, viewerId: string | undefined) {
  const visibility = entity.visibility ?? "public";
  if (visibility === "private") return false;
  if (visibility === "owner") return isOwner(viewerId, entity.ownerId);
  return true;
}

function replicateEntity<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
>(entity: MmoEntityRecord<TPublic, TOwner, TPrivate>, viewerId: string | undefined): MmoReplicatedEntity<TPublic, TOwner> | undefined {
  if (!entityVisibleTo(entity, viewerId)) return undefined;
  const ownerCanSee = isOwner(viewerId, entity.ownerId);
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
    ownerData: ownerCanSee ? cloneData(entity.ownerData) : undefined
  };
  if (entity.visibility === "owner") return { ...replicated, visibility: "owner", ownerId: entity.ownerId };
  return { ...replicated, visibility: "public", ownerId: entity.ownerId };
}

export function createMmoEntityRegistry<
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
>(config: MmoEntityRegistryConfig<TPublic, TOwner, TPrivate> = {}): MmoEntityRegistry<TPublic, TOwner, TPrivate> {
  const entities = new Map<string, MmoEntityRecord<TPublic, TOwner, TPrivate>>();
  const defaultVisibility = config.defaultVisibility ?? "public";
  if (defaultVisibility !== "public" && defaultVisibility !== "owner" && defaultVisibility !== "private") {
    throw new Error("MMO entity registry defaultVisibility is invalid");
  }
  let currentRevision = 0;

  function nextRevision() {
    if (currentRevision >= Number.MAX_SAFE_INTEGER) throw new Error("MMO entity registry revision exceeds the safe integer range");
    return currentRevision + 1;
  }

  function requireRevision(value: unknown, label = "snapshot revision"): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`MMO entity registry ${label} must be a non-negative safe integer`);
    }
  }

  const registry: MmoEntityRegistry<TPublic, TOwner, TPrivate> = {
    upsert(entity) {
      const revision = nextRevision();
      const stored = normalizeEntity(entity, defaultVisibility, revision);
      entities.set(stored.id, stored);
      currentRevision = revision;
      return cloneEntity(stored);
    },
    patch(id, patch) {
      const current = entities.get(id);
      if (!current) return false;
      const revision = nextRevision();
      const next = normalizeEntity({ ...current, ...patch, id }, defaultVisibility, revision);
      entities.set(id, next);
      currentRevision = revision;
      return true;
    },
    remove(id) {
      if (!entities.has(id)) return false;
      const revision = nextRevision();
      entities.delete(id);
      currentRevision = revision;
      return true;
    },
    clear() {
      if (entities.size === 0) return;
      const revision = nextRevision();
      entities.clear();
      currentRevision = revision;
    },
    get(id) {
      const entity = entities.get(id);
      return entity ? cloneEntity(entity) : undefined;
    },
    all() {
      return [...entities.values()].map(cloneEntity);
    },
    has(id) {
      return entities.has(id);
    },
    size() {
      return entities.size;
    },
    revision() {
      return currentRevision;
    },
    canSee(viewerId, id) {
      const entity = entities.get(id);
      return Boolean(entity && entityVisibleTo(entity, viewerId));
    },
    snapshot(viewerId, options = {}) {
      const ids = options.ids ? [...options.ids] : [...entities.keys()].sort(compareEntityIds);
      const snapshotEntities = emptyEntityMap<MmoReplicatedEntity<TPublic, TOwner>>();
      const visibleIds: string[] = [];
      const omittedIds: string[] = [];
      for (const id of ids) {
        const entity = entities.get(id);
        if (!entity) continue;
        const replicated = replicateEntity(entity, viewerId);
        if (!replicated) {
          omittedIds.push(id);
          continue;
        }
        setEntity(snapshotEntities, id, replicated);
        visibleIds.push(id);
      }
      return { revision: currentRevision, meta: cloneValue(options.meta), visibleIds, omittedIds, entities: snapshotEntities };
    },
    encodeSnapshot(snapshot) {
      return {
        revision: snapshot.revision,
        meta: cloneValue(snapshot.meta),
        visibleIds: [...snapshot.visibleIds],
        omittedIds: [...snapshot.omittedIds],
        entities: Object.keys(snapshot.entities)
          .sort(compareEntityIds)
          .map((id) => {
            const entity = snapshot.entities[id];
            return {
              ...entity,
              tags: entity.tags ? [...entity.tags] : undefined,
              publicData: cloneData(entity.publicData),
              ownerData: entity.ownerData ? cloneData(entity.ownerData) : undefined
            };
          })
      };
    },
    decodeSnapshot(snapshot) {
      const decoded = emptyEntityMap<MmoReplicatedEntity<TPublic, TOwner>>();
      for (const entity of snapshot.entities) {
        setEntity(decoded, entity.id, {
          ...entity,
          tags: entity.tags ? [...entity.tags] : undefined,
          publicData: cloneData(entity.publicData),
          ownerData: entity.ownerData ? cloneData(entity.ownerData) : undefined
        });
      }
      return {
        revision: snapshot.revision,
        meta: cloneValue(snapshot.meta),
        visibleIds: [...snapshot.visibleIds],
        omittedIds: [...snapshot.omittedIds],
        entities: decoded
      };
    },
    applySnapshot(snapshot) {
      requireRevision(snapshot.revision);
      if (typeof snapshot.entities !== "object" || snapshot.entities === null) {
        throw new Error("MMO entity registry snapshot entities must be an object");
      }
      const restored = new Map<string, MmoEntityRecord<TPublic, TOwner, TPrivate>>();
      for (const [key, entity] of Object.entries(snapshot.entities)) {
        if (typeof entity !== "object" || entity === null) throw new Error(`MMO entity registry snapshot entity ${key} is invalid`);
        requireRevision(entity.revision, `entity ${key} revision`);
        if (entity.revision > snapshot.revision) throw new Error(`MMO entity registry entity ${key} revision exceeds snapshot revision`);
        if (key !== entity.id) throw new Error(`MMO entity registry snapshot key ${key} does not match entity id ${String(entity.id)}`);
        const visibility: unknown = Reflect.get(entity, "visibility");
        if (visibility === "private") throw new Error(`MMO entity registry snapshot entity ${key} cannot be private`);
        const candidate: MmoEntityCandidate<TPublic, TOwner, TPrivate> = {
          ...entity,
          privateData: undefined
        };
        const stored = normalizeEntity(candidate, defaultVisibility, entity.revision);
        restored.set(stored.id, stored);
      }
      entities.clear();
      for (const [id, entity] of restored) entities.set(id, entity);
      currentRevision = snapshot.revision;
    },
    toInterestEntities(ids) {
      const sourceIds = ids ? [...ids] : [...entities.keys()];
      const result: MmoInterestEntity[] = [];
      for (const id of sourceIds) {
        const entity = entities.get(id);
        if (!entity) continue;
        result.push({
          id: entity.id,
          type: entity.type,
          x: entity.x,
          y: entity.y,
          zoneId: entity.zoneId,
          radius: entity.radius,
          priority: entity.priority,
          global: entity.global
        });
      }
      return result;
    },
    forEachVisibleReadable(viewerId, visit) {
      for (const entity of entities.values()) {
        if (entityVisibleTo(entity, viewerId)) visit(entity);
      }
    }
  };

  for (const entity of config.initialEntities ?? []) registry.upsert(entity);
  return registry;
}
