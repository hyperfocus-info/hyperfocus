export type ContentScalar = string | number | boolean | null;
export type ContentValue = ContentScalar | ContentValue[] | { [key: string]: ContentValue };

export type ContentReference = {
  kind: "entity" | "scene" | "prefab";
  id: string;
};

export type ContentComponent = {
  id: string;
  type: string;
  enabled: boolean;
  data: { [key: string]: ContentValue };
  /** Explicit references are validated; strings inside opaque component data are not guessed. */
  references?: ContentReference[];
};

export type ContentPrefabVariant = {
  id: string;
  extends?: string;
  components?: ContentComponent[];
  removeComponentIds?: string[];
};

export type ContentPrefab = {
  id: string;
  extends?: string;
  components?: ContentComponent[];
  removeComponentIds?: string[];
  variants?: ContentPrefabVariant[];
};

export type ContentSceneEntity = {
  id: string;
  parentId?: string;
  prefabId?: string;
  variantIds?: string[];
  components?: ContentComponent[];
  removeComponentIds?: string[];
};

export type ContentScene = {
  id: string;
  entities: ContentSceneEntity[];
};

export type ScenePrefabSource = {
  prefabs?: ContentPrefab[];
  scenes: ContentScene[];
};

export type InstantiatedEntity = {
  id: string;
  parentId?: string;
  prefabId?: string;
  variantIds: string[];
  components: ContentComponent[];
};

export type InstantiatedScene = {
  version: 1;
  sceneId: string;
  entities: InstantiatedEntity[];
};

export type InstantiatePrefabOptions = {
  /** Required by design: the content layer never invents persistent IDs. */
  entityId: string;
  parentId?: string;
  variantIds?: string[];
  components?: ContentComponent[];
  removeComponentIds?: string[];
};

export type ScenePrefabLimits = {
  maxPrefabs?: number;
  maxScenes?: number;
  maxEntitiesPerScene?: number;
  maxComponentsPerEntity?: number;
  maxPrefabDepth?: number;
  maxParentDepth?: number;
  maxValueDepth?: number;
  maxValueNodesPerComponent?: number;
};

type ResolvedLimits = Required<ScenePrefabLimits>;

const DEFAULT_LIMITS: ResolvedLimits = {
  maxPrefabs: 4_096,
  maxScenes: 256,
  maxEntitiesPerScene: 10_000,
  maxComponentsPerEntity: 64,
  maxPrefabDepth: 32,
  maxParentDepth: 128,
  maxValueDepth: 64,
  maxValueNodesPerComponent: 10_000,
};

type ScenePrefabCatalogState = {
  source: ScenePrefabSource;
  limits: ResolvedLimits;
  prefabs: Map<string, ContentPrefab>;
  scenes: Map<string, ContentScene>;
  resolvedPrefabs: Map<string, ContentComponent[]>;
};

/** Validates immutable source data and creates a deterministic expansion catalog. */
export function createScenePrefabCatalog(source: ScenePrefabSource, limits: ScenePrefabLimits = {}) {
  const state: ScenePrefabCatalogState = {
    source: cloneSource(source),
    limits: resolveLimits(limits),
    prefabs: new Map(),
    scenes: new Map(),
    resolvedPrefabs: new Map(),
  };
  indexAndValidateCatalog(state);
  return Object.freeze({
    get sceneIds() { return [...state.scenes.keys()]; },
    get prefabIds() { return [...state.prefabs.keys()]; },
    instantiatePrefab: (prefabId: string, options: InstantiatePrefabOptions) => instantiateCatalogPrefab(state, prefabId, options),
    instantiateScene: (sceneId: string) => instantiateCatalogScene(state, sceneId),
    snapshotScene: (sceneId: string) => cloneScene(instantiateCatalogScene(state, sceneId)),
  });
}

export type ScenePrefabCatalog = ReturnType<typeof createScenePrefabCatalog>;

function instantiateCatalogPrefab(state: ScenePrefabCatalogState, prefabId: string, options: InstantiatePrefabOptions): InstantiatedEntity {
  assertId(options.entityId, "Entity id");
  if (options.parentId !== undefined) assertId(options.parentId, "Parent entity id");
  if (!state.prefabs.has(prefabId)) throw new Error(`Unknown prefab: ${prefabId}`);
  const variantIds = options.variantIds ? [...options.variantIds] : [];
  assertUniqueIds(variantIds, `Variants selected for prefab ${prefabId}`);
  let components = cloneComponents(resolveCatalogPrefab(state, prefabId));
  const variants = effectiveCatalogVariants(state, prefabId);
  const appliedVariants = new Set<string>();
  for (const variantId of variantIds) components = applyCatalogVariant(state, prefabId, variantId, variants, components, appliedVariants, 0);
  components = applyComponents(components, options.removeComponentIds, options.components, `Entity ${options.entityId}`, state.limits);
  return { id: options.entityId, ...(options.parentId ? { parentId: options.parentId } : {}), prefabId, variantIds, components };
}

function instantiateCatalogScene(state: ScenePrefabCatalogState, sceneId: string): InstantiatedScene {
  const scene = state.scenes.get(sceneId);
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  const entities = scene.entities.map((entity) => instantiateCatalogSceneEntity(state, entity));
  validateInstantiatedReferences(sceneId, entities, state.scenes, state.prefabs);
  return { version: 1, sceneId, entities };
}

function indexAndValidateCatalog(state: ScenePrefabCatalogState) {
  const { source, limits, prefabs, scenes } = state;
  if (!source || !Array.isArray(source.scenes) || !Array.isArray(source.prefabs)) throw new Error("Scene/prefab source is invalid.");
  if (source.scenes.length > limits.maxScenes) throw new Error(`Scene count exceeds the limit of ${limits.maxScenes}.`);
  if (source.prefabs.length > limits.maxPrefabs) throw new Error(`Prefab count exceeds the limit of ${limits.maxPrefabs}.`);
  for (const prefab of source.prefabs) {
    assertId(prefab.id, "Prefab id");
    if (prefabs.has(prefab.id)) throw new Error(`Duplicate prefab id: ${prefab.id}`);
    prefabs.set(prefab.id, prefab);
    validateComponentList(prefab.components, `Prefab ${prefab.id}`, limits);
    validateRemovalList(prefab.removeComponentIds, `Prefab ${prefab.id}`);
    validatePrefabVariants(prefab, limits);
  }
  for (const prefab of prefabs.values()) {
    if (prefab.extends && !prefabs.has(prefab.extends)) throw new Error(`Prefab ${prefab.id} extends missing prefab ${prefab.extends}.`);
    assertCatalogPrefabAcyclic(state, prefab.id, []);
    resolveCatalogPrefab(state, prefab.id);
  }
  for (const scene of source.scenes) {
    assertId(scene.id, "Scene id");
    if (scenes.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
    if (!Array.isArray(scene.entities) || scene.entities.length > limits.maxEntitiesPerScene) throw new Error(`Scene ${scene.id} exceeds the entity limit of ${limits.maxEntitiesPerScene}.`);
    scenes.set(scene.id, scene);
  }
  for (const prefab of prefabs.values()) validateCatalogPrefab(state, prefab);
  for (const scene of scenes.values()) validateCatalogScene(state, scene);
}

function validatePrefabVariants(prefab: ContentPrefab, limits: ResolvedLimits) {
  const localVariants = new Set<string>();
  for (const variant of prefab.variants ?? []) {
    assertId(variant.id, `Variant id on prefab ${prefab.id}`);
    if (localVariants.has(variant.id)) throw new Error(`Duplicate variant id on prefab ${prefab.id}: ${variant.id}`);
    localVariants.add(variant.id);
    validateComponentList(variant.components, `Variant ${prefab.id}/${variant.id}`, limits);
    validateRemovalList(variant.removeComponentIds, `Variant ${prefab.id}/${variant.id}`);
  }
}

function validateCatalogPrefab(state: ScenePrefabCatalogState, prefab: ContentPrefab) {
  const variants = effectiveCatalogVariants(state, prefab.id);
  for (const variantId of variants.keys()) applyCatalogVariant(state, prefab.id, variantId, variants, cloneComponents(resolveCatalogPrefab(state, prefab.id)), new Set(), 0);
  const lists = [prefab.components ?? [], ...(prefab.variants ?? []).map((variant) => variant.components ?? [])];
  for (const components of lists) for (const component of components) for (const reference of component.references ?? []) {
    if (reference.kind === "scene" && !state.scenes.has(reference.id)) throw new Error(`Component ${component.id} on prefab ${prefab.id} references missing scene ${reference.id}.`);
    if (reference.kind === "prefab" && !state.prefabs.has(reference.id)) throw new Error(`Component ${component.id} on prefab ${prefab.id} references missing prefab ${reference.id}.`);
  }
}

function assertCatalogPrefabAcyclic(state: ScenePrefabCatalogState, prefabId: string, path: string[]) {
  if (path.includes(prefabId)) throw new Error(`Prefab inheritance cycle: ${[...path, prefabId].join(" -> ")}`);
  if (path.length >= state.limits.maxPrefabDepth) throw new Error(`Prefab ${prefabId} exceeds inheritance depth ${state.limits.maxPrefabDepth}.`);
  const parent = state.prefabs.get(prefabId)?.extends;
  if (parent) assertCatalogPrefabAcyclic(state, parent, [...path, prefabId]);
}

function resolveCatalogPrefab(state: ScenePrefabCatalogState, prefabId: string, path: string[] = []): ContentComponent[] {
  const cached = state.resolvedPrefabs.get(prefabId);
  if (cached) return cached;
  if (path.includes(prefabId)) throw new Error(`Prefab inheritance cycle: ${[...path, prefabId].join(" -> ")}`);
  if (path.length >= state.limits.maxPrefabDepth) throw new Error(`Prefab ${prefabId} exceeds inheritance depth ${state.limits.maxPrefabDepth}.`);
  const prefab = state.prefabs.get(prefabId);
  if (!prefab) throw new Error(`Unknown prefab: ${prefabId}`);
  const inherited = prefab.extends ? resolveCatalogPrefab(state, prefab.extends, [...path, prefabId]) : [];
  const resolved = applyComponents(inherited, prefab.removeComponentIds, prefab.components, `Prefab ${prefab.id}`, state.limits);
  state.resolvedPrefabs.set(prefabId, resolved);
  return resolved;
}

function effectiveCatalogVariants(state: ScenePrefabCatalogState, prefabId: string): Map<string, ContentPrefabVariant> {
  const chain: ContentPrefab[] = [];
  let cursor = state.prefabs.get(prefabId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.extends ? state.prefabs.get(cursor.extends) : undefined;
  }
  const variants = new Map<string, ContentPrefabVariant>();
  for (const prefab of chain) for (const variant of prefab.variants ?? []) {
    if (variants.has(variant.id)) throw new Error(`Prefab ${prefabId} inherits duplicate variant id ${variant.id}.`);
    variants.set(variant.id, variant);
  }
  for (const variant of variants.values()) {
    if (variant.extends && !variants.has(variant.extends)) throw new Error(`Variant ${prefabId}/${variant.id} extends missing variant ${variant.extends}.`);
    assertCatalogVariantAcyclic(state, prefabId, variant.id, variants, [], 0);
  }
  return variants;
}

function assertCatalogVariantAcyclic(state: ScenePrefabCatalogState, prefabId: string, variantId: string, variants: ReadonlyMap<string, ContentPrefabVariant>, path: string[], depth: number) {
  if (path.includes(variantId)) throw new Error(`Variant inheritance cycle on prefab ${prefabId}: ${[...path, variantId].join(" -> ")}`);
  if (depth >= state.limits.maxPrefabDepth) throw new Error(`Variant ${prefabId}/${variantId} exceeds inheritance depth ${state.limits.maxPrefabDepth}.`);
  const parent = variants.get(variantId)?.extends;
  if (parent) assertCatalogVariantAcyclic(state, prefabId, parent, variants, [...path, variantId], depth + 1);
}

function applyCatalogVariant(state: ScenePrefabCatalogState, prefabId: string, variantId: string, variants: ReadonlyMap<string, ContentPrefabVariant>, initial: ContentComponent[], applied: Set<string>, depth: number): ContentComponent[] {
  if (applied.has(variantId)) return initial;
  if (depth >= state.limits.maxPrefabDepth) throw new Error(`Variant ${prefabId}/${variantId} exceeds inheritance depth ${state.limits.maxPrefabDepth}.`);
  const variant = variants.get(variantId);
  if (!variant) throw new Error(`Unknown variant ${variantId} on prefab ${prefabId}.`);
  let components = initial;
  if (variant.extends) components = applyCatalogVariant(state, prefabId, variant.extends, variants, components, applied, depth + 1);
  components = applyComponents(components, variant.removeComponentIds, variant.components, `Variant ${prefabId}/${variant.id}`, state.limits);
  applied.add(variantId);
  return components;
}

function instantiateCatalogSceneEntity(state: ScenePrefabCatalogState, entity: ContentSceneEntity): InstantiatedEntity {
  if (entity.prefabId) return instantiateCatalogPrefab(state, entity.prefabId, {
    entityId: entity.id,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
    variantIds: entity.variantIds,
    components: entity.components,
    removeComponentIds: entity.removeComponentIds,
  });
  if (entity.variantIds?.length) throw new Error(`Entity ${entity.id} selects variants without a prefab.`);
  return { id: entity.id, ...(entity.parentId ? { parentId: entity.parentId } : {}), variantIds: [], components: applyComponents([], entity.removeComponentIds, entity.components, `Entity ${entity.id}`, state.limits) };
}

function validateCatalogScene(state: ScenePrefabCatalogState, scene: ContentScene) {
  const ids = new Set<string>();
  for (const entity of scene.entities) {
    assertId(entity.id, `Entity id in scene ${scene.id}`);
    if (ids.has(entity.id)) throw new Error(`Duplicate entity id in scene ${scene.id}: ${entity.id}`);
    ids.add(entity.id);
    if (entity.prefabId && !state.prefabs.has(entity.prefabId)) throw new Error(`Entity ${entity.id} references missing prefab ${entity.prefabId}.`);
    validateComponentList(entity.components, `Entity ${entity.id}`, state.limits);
    validateRemovalList(entity.removeComponentIds, `Entity ${entity.id}`);
  }
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]));
  for (const entity of scene.entities) validateCatalogParentage(state, scene.id, entity, byId);
  instantiateCatalogScene(state, scene.id);
}

function validateCatalogParentage(state: ScenePrefabCatalogState, sceneId: string, entity: ContentSceneEntity, byId: ReadonlyMap<string, ContentSceneEntity>) {
  if (entity.parentId && !byId.has(entity.parentId)) throw new Error(`Entity ${entity.id} references missing parent ${entity.parentId}.`);
  const ancestry = new Set([entity.id]);
  let parentId = entity.parentId;
  let depth = 0;
  while (parentId) {
    if (ancestry.has(parentId)) throw new Error(`Entity parenting cycle in scene ${sceneId} includes ${entity.id}.`);
    if (++depth > state.limits.maxParentDepth) throw new Error(`Entity ${entity.id} exceeds parent depth ${state.limits.maxParentDepth}.`);
    ancestry.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
}

export type SceneLifecycleStatus = "idle" | "loading" | "active" | "transitioning" | "unloading";

export type SceneLifecycleSnapshot = {
  version: 1;
  status: SceneLifecycleStatus;
  revision: number;
  activeSceneId?: string;
  pendingSceneId?: string;
};

export type SceneLifecycleHooks = {
  load?: (scene: InstantiatedScene) => void | Promise<void>;
  unload?: (scene: InstantiatedScene) => void | Promise<void>;
};

type SceneLifecycleState = {
  catalog: ScenePrefabCatalog;
  hooks: SceneLifecycleHooks;
  status: SceneLifecycleStatus;
  active: InstantiatedScene | undefined;
  pendingSceneId: string | undefined;
  revision: number;
  operationActive: boolean;
};

/** Creates a serialized async scene lifecycle with rollback-safe internal state. */
export function createSceneLifecycle(catalog: ScenePrefabCatalog, hooks: SceneLifecycleHooks = {}) {
  const state: SceneLifecycleState = { catalog, hooks, status: "idle", active: undefined, pendingSceneId: undefined, revision: 0, operationActive: false };
  return Object.freeze({
    get status() { return state.status; },
    get activeSceneId() { return state.active?.sceneId; },
    get revision() { return state.revision; },
    snapshot: () => snapshotSceneLifecycle(state),
    activeSceneSnapshot: () => state.active ? cloneScene(state.active) : undefined,
    restore: (snapshot: SceneLifecycleSnapshot) => restoreSceneLifecycle(state, snapshot),
    load: (sceneId: string) => loadSceneLifecycle(state, sceneId),
    unload: () => unloadSceneLifecycle(state),
    transition: (sceneId: string) => transitionSceneLifecycle(state, sceneId),
  });
}

export type SceneLifecycle = ReturnType<typeof createSceneLifecycle>;

function snapshotSceneLifecycle(state: SceneLifecycleState): SceneLifecycleSnapshot {
  return {
    version: 1,
    status: state.status,
    revision: state.revision,
    ...(state.active ? { activeSceneId: state.active.sceneId } : {}),
    ...(state.pendingSceneId ? { pendingSceneId: state.pendingSceneId } : {}),
  };
}

function restoreSceneLifecycle(state: SceneLifecycleState, snapshot: SceneLifecycleSnapshot) {
  assertSceneLifecycleAvailable(state);
  if (snapshot.version !== 1 || (snapshot.status !== "idle" && snapshot.status !== "active")) throw new Error("Only stable idle or active scene lifecycle snapshots can be restored.");
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("Scene lifecycle snapshot revision is invalid.");
  if (snapshot.status === "idle") {
    if (snapshot.activeSceneId || snapshot.pendingSceneId) throw new Error("Idle scene lifecycle snapshot cannot reference a scene.");
    state.active = undefined;
  } else {
    if (!snapshot.activeSceneId || snapshot.pendingSceneId) throw new Error("Active scene lifecycle snapshot is incomplete.");
    state.active = state.catalog.instantiateScene(snapshot.activeSceneId);
  }
  state.status = snapshot.status;
  state.pendingSceneId = undefined;
  state.revision = snapshot.revision;
  return snapshotSceneLifecycle(state);
}

async function loadSceneLifecycle(state: SceneLifecycleState, sceneId: string) {
  assertSceneLifecycleAvailable(state);
  if (state.active || state.status !== "idle") throw new Error("A scene is already active; use transition().");
  const target = state.catalog.instantiateScene(sceneId);
  state.operationActive = true;
  state.status = "loading";
  state.pendingSceneId = sceneId;
  try {
    await state.hooks.load?.(cloneScene(target));
    state.active = target;
    state.pendingSceneId = undefined;
    state.status = "active";
    state.revision += 1;
    return cloneScene(target);
  } catch (error) {
    state.pendingSceneId = undefined;
    state.status = "idle";
    throw error;
  } finally {
    state.operationActive = false;
  }
}

async function unloadSceneLifecycle(state: SceneLifecycleState) {
  assertSceneLifecycleAvailable(state);
  if (!state.active || state.status !== "active") throw new Error("No active scene can be unloaded.");
  const previous = state.active;
  state.operationActive = true;
  state.status = "unloading";
  try {
    await state.hooks.unload?.(cloneScene(previous));
    state.active = undefined;
    state.status = "idle";
    state.revision += 1;
  } catch (error) {
    state.status = "active";
    throw error;
  } finally {
    state.operationActive = false;
  }
}

async function transitionSceneLifecycle(state: SceneLifecycleState, sceneId: string) {
  assertSceneLifecycleAvailable(state);
  if (!state.active || state.status !== "active") throw new Error("A transition requires an active scene.");
  if (state.active.sceneId === sceneId) return cloneScene(state.active);
  const previous = state.active;
  const target = state.catalog.instantiateScene(sceneId);
  state.operationActive = true;
  state.status = "transitioning";
  state.pendingSceneId = sceneId;
  let targetLoaded = false;
  try {
    await state.hooks.load?.(cloneScene(target));
    targetLoaded = true;
    await state.hooks.unload?.(cloneScene(previous));
    state.active = target;
    state.pendingSceneId = undefined;
    state.status = "active";
    state.revision += 1;
    return cloneScene(target);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (targetLoaded) {
      try { await state.hooks.unload?.(cloneScene(target)); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    state.active = previous;
    state.pendingSceneId = undefined;
    state.status = "active";
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Scene transition failed and target cleanup also failed.");
    throw error;
  } finally {
    state.operationActive = false;
  }
}

function assertSceneLifecycleAvailable(state: SceneLifecycleState) {
  if (state.operationActive) throw new Error("A scene lifecycle operation is already in progress.");
}

function applyComponents(base: readonly ContentComponent[], removals: readonly string[] | undefined, additions: readonly ContentComponent[] | undefined, context: string, limits: ResolvedLimits) {
  const components = cloneComponents(base);
  const byId = new Map(components.map((component, index) => [component.id, index]));
  for (const id of removals ?? []) {
    const index = byId.get(id);
    if (index === undefined) throw new Error(`${context} removes unknown component ${id}.`);
    components.splice(index, 1);
    byId.clear();
    components.forEach((component, componentIndex) => byId.set(component.id, componentIndex));
  }
  for (const addition of additions ?? []) {
    const index = byId.get(addition.id);
    if (index === undefined) {
      byId.set(addition.id, components.length);
      components.push(cloneComponent(addition));
      continue;
    }
    const inherited = components[index]!;
    if (inherited.type !== addition.type) throw new Error(`${context} changes component ${addition.id} type from ${inherited.type} to ${addition.type}.`);
    components[index] = {
      id: inherited.id,
      type: inherited.type,
      enabled: addition.enabled,
      data: mergeData(inherited.data, addition.data),
      ...(addition.references !== undefined
        ? { references: addition.references.map((reference) => ({ ...reference })) }
        : inherited.references ? { references: inherited.references.map((reference) => ({ ...reference })) } : {}),
    };
  }
  if (components.length > limits.maxComponentsPerEntity) throw new Error(`${context} exceeds the component limit of ${limits.maxComponentsPerEntity}.`);
  return components;
}

function validateInstantiatedReferences(sceneId: string, entities: readonly InstantiatedEntity[], scenes: ReadonlyMap<string, ContentScene>, prefabs: ReadonlyMap<string, ContentPrefab>) {
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const entity of entities) {
    for (const component of entity.components) {
      for (const reference of component.references ?? []) {
        const exists = reference.kind === "entity" ? entityIds.has(reference.id) : reference.kind === "scene" ? scenes.has(reference.id) : prefabs.has(reference.id);
        if (!exists) throw new Error(`Component ${component.id} on entity ${entity.id} in scene ${sceneId} references missing ${reference.kind} ${reference.id}.`);
      }
    }
  }
}

function validateComponentList(components: readonly ContentComponent[] | undefined, context: string, limits: ResolvedLimits) {
  if (components === undefined) return;
  if (!Array.isArray(components) || components.length > limits.maxComponentsPerEntity) throw new Error(`${context} has an invalid component list.`);
  const ids = new Set<string>();
  for (const component of components) {
    assertId(component.id, `${context} component id`);
    assertId(component.type, `${context} component type`);
    if (ids.has(component.id)) throw new Error(`${context} has duplicate component id ${component.id}.`);
    ids.add(component.id);
    if (typeof component.enabled !== "boolean" || !isRecord(component.data)) throw new Error(`${context} component ${component.id} is invalid.`);
    validateContentValue(component.data, limits, `${context} component ${component.id}`);
    if (component.references !== undefined) {
      if (!Array.isArray(component.references)) throw new Error(`${context} component ${component.id} references are invalid.`);
      for (const reference of component.references) {
        if (!reference || (reference.kind !== "entity" && reference.kind !== "scene" && reference.kind !== "prefab")) throw new Error(`${context} component ${component.id} has an invalid reference.`);
        assertId(reference.id, `${context} component reference id`);
      }
    }
  }
}

function validateContentValue(root: ContentValue, limits: ResolvedLimits, context: string) {
  const pending: Array<{ value: ContentValue; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > limits.maxValueNodesPerComponent) throw new Error(`${context} exceeds the data node limit of ${limits.maxValueNodesPerComponent}.`);
    if (depth > limits.maxValueDepth) throw new Error(`${context} exceeds the data depth limit of ${limits.maxValueDepth}.`);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${context} contains a non-finite number.`);
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") continue;
    if (Array.isArray(value)) {
      for (const child of value) pending.push({ value: child, depth: depth + 1 });
      continue;
    }
    if (!isRecord(value)) throw new Error(`${context} contains a non-portable value.`);
    for (const [key, child] of Object.entries(value)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`${context} contains unsafe key ${key}.`);
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

function validateRemovalList(ids: readonly string[] | undefined, context: string) {
  if (ids === undefined) return;
  if (!Array.isArray(ids)) throw new Error(`${context} component removal list is invalid.`);
  assertUniqueIds(ids, `${context} component removals`);
}

function resolveLimits(limits: ScenePrefabLimits): ResolvedLimits {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  }
  return resolved;
}

function cloneSource(source: ScenePrefabSource): ScenePrefabSource {
  if (!source || typeof source !== "object") throw new Error("Scene/prefab source is invalid.");
  return {
    prefabs: (source.prefabs ?? []).map((prefab) => ({
      id: prefab.id,
      ...(prefab.extends ? { extends: prefab.extends } : {}),
      ...(prefab.components ? { components: cloneComponents(prefab.components) } : {}),
      ...(prefab.removeComponentIds ? { removeComponentIds: [...prefab.removeComponentIds] } : {}),
      ...(prefab.variants ? { variants: prefab.variants.map((variant) => ({
        id: variant.id,
        ...(variant.extends ? { extends: variant.extends } : {}),
        ...(variant.components ? { components: cloneComponents(variant.components) } : {}),
        ...(variant.removeComponentIds ? { removeComponentIds: [...variant.removeComponentIds] } : {}),
      })) } : {}),
    })),
    scenes: Array.isArray(source.scenes) ? source.scenes.map((scene) => ({
      id: scene.id,
      entities: Array.isArray(scene.entities) ? scene.entities.map((entity) => ({
        id: entity.id,
        ...(entity.parentId ? { parentId: entity.parentId } : {}),
        ...(entity.prefabId ? { prefabId: entity.prefabId } : {}),
        ...(entity.variantIds ? { variantIds: [...entity.variantIds] } : {}),
        ...(entity.components ? { components: cloneComponents(entity.components) } : {}),
        ...(entity.removeComponentIds ? { removeComponentIds: [...entity.removeComponentIds] } : {}),
      })) : [],
    })) : [],
  };
}

function cloneScene(scene: InstantiatedScene): InstantiatedScene {
  return { version: 1, sceneId: scene.sceneId, entities: scene.entities.map((entity) => ({
    id: entity.id,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
    ...(entity.prefabId ? { prefabId: entity.prefabId } : {}),
    variantIds: [...entity.variantIds],
    components: cloneComponents(entity.components),
  })) };
}

function cloneComponents(components: readonly ContentComponent[]): ContentComponent[] {
  return components.map(cloneComponent);
}

function cloneComponent(component: ContentComponent): ContentComponent {
  return {
    id: component.id,
    type: component.type,
    enabled: component.enabled,
    data: cloneRecord(component.data),
    ...(component.references ? { references: component.references.map((reference) => ({ ...reference })) } : {}),
  };
}

function mergeData(base: { [key: string]: ContentValue }, override: { [key: string]: ContentValue }) {
  const merged = cloneRecord(base);
  for (const key of Object.keys(override).sort()) {
    const next = override[key]!;
    const previous = merged[key];
    merged[key] = isRecord(previous) && isRecord(next) ? mergeData(previous, next) : cloneValue(next);
  }
  return merged;
}

function cloneRecord(value: { [key: string]: ContentValue }) {
  const result: { [key: string]: ContentValue } = {};
  for (const key of Object.keys(value).sort()) result[key] = cloneValue(value[key]!);
  return result;
}

function cloneValue(value: ContentValue): ContentValue {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) return cloneRecord(value);
  return value;
}

function isRecord(value: unknown): value is { [key: string]: ContentValue } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function assertId(value: string, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) throw new Error(`${label} is invalid: ${String(value)}`);
}

function assertUniqueIds(ids: readonly string[], context: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    assertId(id, context);
    if (seen.has(id)) throw new Error(`${context} contains duplicate id ${id}.`);
    seen.add(id);
  }
}
