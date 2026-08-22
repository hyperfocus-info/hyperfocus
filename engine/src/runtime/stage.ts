export type StageEntity = {
  active?: boolean;
  visible?: boolean;
  layer?: number;
  order?: number;
  update?: (entity: StageEntity, delta: number) => void;
  render?: (entity: StageEntity, target: unknown, alpha: number) => void;
};

export type StageOptions<T extends StageEntity = StageEntity> = {
  updateEntity?: (entity: T, delta: number) => void;
  renderEntity?: (entity: T, target: unknown, alpha: number) => void;
  serializeEntity?: (entity: T) => unknown;
  deserializeEntity?: (snapshot: unknown) => T;
};

export type StageSnapshot<TSnapshot = unknown> = {
  version: 1;
  nextOrder: number;
  entities: TSnapshot[];
};

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultSerializeEntity<T extends StageEntity>(entity: T) {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === "update" || key === "render") continue;
    snapshot[key] = value;
  }
  return cloneSerializable(snapshot);
}

export function createStage<T extends StageEntity = StageEntity>({
  updateEntity,
  renderEntity,
  serializeEntity = defaultSerializeEntity,
  deserializeEntity = (snapshot) => cloneSerializable(snapshot) as T
}: StageOptions<T> = {}) {
  const entities: T[] = [];
  const entityMembership = new Set<T>();
  const updateQueue: T[] = [];
  const updateOrders: Array<number | undefined> = [];
  const renderQueue: T[] = [];
  const renderOrders: Array<number | undefined> = [];
  let nextOrder = 1;
  let renderOrderDirty = false;
  let updating = false;
  let rendering = false;

  function requireLayer(layer: number) {
    if (!Number.isFinite(layer)) throw new RangeError("stage layer must be finite");
  }

  function sortForRender() {
    if (!renderOrderDirty) return;
    entities.sort((a, b) => {
      const layerDelta = (a.layer || 0) - (b.layer || 0);
      if (layerDelta !== 0) return layerDelta;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    renderOrderDirty = false;
  }

  function spawn(entity: T, options: Pick<StageEntity, "active" | "layer"> = {}) {
    if (entityMembership.has(entity)) throw new Error("stage cannot spawn the same entity more than once");
    if (nextOrder >= Number.MAX_SAFE_INTEGER) throw new Error("stage entity order exceeds the safe integer range");
    const layer = options.layer ?? entity.layer ?? 0;
    requireLayer(layer);
    entity.active = options.active ?? entity.active ?? true;
    entity.layer = layer;
    entity.order = nextOrder;
    nextOrder += 1;
    entities.push(entity);
    entityMembership.add(entity);
    renderOrderDirty = true;
    return entity;
  }

  function remove(entity: T) {
    const index = entities.indexOf(entity);
    if (index === -1) return false;
    entities.splice(index, 1);
    entityMembership.delete(entity);
    return true;
  }

  function setLayer(entity: T, layer: number) {
    requireLayer(layer);
    if (entity.layer === layer) return;
    entity.layer = layer;
    renderOrderDirty = true;
  }

  function update(delta: number) {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError("stage update delta must be a non-negative finite number");
    if (updating) throw new Error("stage update cannot be reentrant");
    updating = true;
    updateQueue.length = entities.length;
    updateOrders.length = entities.length;
    for (let index = 0; index < entities.length; index += 1) {
      updateQueue[index] = entities[index];
      updateOrders[index] = entities[index].order;
    }
    try {
      for (let index = 0; index < updateQueue.length; index += 1) {
        const entity = updateQueue[index];
        if (!entityMembership.has(entity) || entity.order !== updateOrders[index] || entity.active === false) continue;
        if (entity.update) {
          entity.update(entity, delta);
        } else if (updateEntity) {
          updateEntity(entity, delta);
        }
      }
    } finally {
      updateQueue.length = 0;
      updateOrders.length = 0;
      updating = false;
    }
  }

  function render(target: unknown, alpha = 1) {
    if (!Number.isFinite(alpha)) throw new RangeError("stage render alpha must be finite");
    if (rendering) throw new Error("stage render cannot be reentrant");
    sortForRender();
    rendering = true;
    renderQueue.length = entities.length;
    renderOrders.length = entities.length;
    for (let index = 0; index < entities.length; index += 1) {
      renderQueue[index] = entities[index];
      renderOrders[index] = entities[index].order;
    }
    try {
      for (let index = 0; index < renderQueue.length; index += 1) {
        const entity = renderQueue[index];
        if (!entityMembership.has(entity) || entity.order !== renderOrders[index] || entity.active === false || entity.visible === false) continue;
        if (entity.render) {
          entity.render(entity, target, alpha);
        } else if (renderEntity) {
          renderEntity(entity, target, alpha);
        }
      }
    } finally {
      renderQueue.length = 0;
      renderOrders.length = 0;
      rendering = false;
    }
  }

  return {
    spawn,
    remove,
    setLayer,
    update,
    render,
    serialize(): StageSnapshot {
      return {
        version: 1,
        nextOrder,
        entities: entities.map((entity) => serializeEntity(entity))
      };
    },
    deserialize(snapshot: StageSnapshot) {
      if (typeof snapshot !== "object" || snapshot === null || snapshot.version !== 1) throw new Error("invalid stage snapshot");
      if (!Number.isSafeInteger(snapshot.nextOrder) || snapshot.nextOrder < 1) throw new Error("stage snapshot next order must be a positive safe integer");
      if (!Array.isArray(snapshot.entities)) throw new Error("stage snapshot entities must be an array");
      const restored = snapshot.entities.map((entity) => deserializeEntity(entity));
      const restoredMembership = new Set<T>();
      for (const entity of restored) {
        if (typeof entity !== "object" || entity === null) throw new Error("stage snapshot entity must be an object");
        if (restoredMembership.has(entity)) throw new Error("stage snapshot contains a duplicate entity");
        if (entity.layer !== undefined) requireLayer(entity.layer);
        if (entity.order !== undefined && (!Number.isSafeInteger(entity.order) || entity.order < 0 || entity.order >= snapshot.nextOrder)) {
          throw new Error("stage snapshot entity order is invalid");
        }
        restoredMembership.add(entity);
      }
      entities.length = 0;
      for (const entity of restored) entities.push(entity);
      entityMembership.clear();
      for (const entity of restoredMembership) entityMembership.add(entity);
      nextOrder = snapshot.nextOrder;
      renderOrderDirty = true;
    },
    clear() {
      entities.length = 0;
      entityMembership.clear();
      nextOrder = 1;
      renderOrderDirty = false;
    },
    entities() {
      return entities.slice();
    },
    count() {
      return entities.length;
    }
  };
}
