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

/**
 * Validated, immutable source data with deterministic prefab and scene expansion.
 * The catalog emits plain data and never generates source or wrapper files.
 */
export class ScenePrefabCatalog {
  private readonly source: ScenePrefabSource;
  private readonly limits: ResolvedLimits;
  private readonly prefabs = new Map<string, ContentPrefab>();
  private readonly scenes = new Map<string, ContentScene>();
  private readonly resolvedPrefabs = new Map<string, ContentComponent[]>();

  constructor(source: ScenePrefabSource, limits: ScenePrefabLimits = {}) {
    this.limits = resolveLimits(limits);
    this.source = cloneSource(source);
    this.indexAndValidate();
  }

  get sceneIds() { return [...this.scenes.keys()]; }
  get prefabIds() { return [...this.prefabs.keys()]; }

  instantiatePrefab(prefabId: string, options: InstantiatePrefabOptions): InstantiatedEntity {
    assertId(options.entityId, "Entity id");
    if (options.parentId !== undefined) assertId(options.parentId, "Parent entity id");
    const prefab = this.prefabs.get(prefabId);
    if (!prefab) throw new Error(`Unknown prefab: ${prefabId}`);
    const variantIds = options.variantIds ? [...options.variantIds] : [];
    assertUniqueIds(variantIds, `Variants selected for prefab ${prefabId}`);
    let components = cloneComponents(this.resolvePrefab(prefabId));
    const variants = this.effectiveVariants(prefabId);
    const appliedVariants = new Set<string>();
    for (const variantId of variantIds) components = this.applyVariant(prefabId, variantId, variants, components, appliedVariants, 0);
    components = applyComponents(components, options.removeComponentIds, options.components, `Entity ${options.entityId}`, this.limits);
    return {
      id: options.entityId,
      ...(options.parentId ? { parentId: options.parentId } : {}),
      prefabId,
      variantIds,
      components,
    };
  }

  instantiateScene(sceneId: string): InstantiatedScene {
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
    const entities = scene.entities.map((entity) => this.instantiateSceneEntity(entity));
    validateInstantiatedReferences(sceneId, entities, this.scenes, this.prefabs);
    return { version: 1, sceneId, entities };
  }

  /** Returns a detached snapshot; mutating it cannot affect later instantiation. */
  snapshotScene(sceneId: string): InstantiatedScene {
    return cloneScene(this.instantiateScene(sceneId));
  }

  private indexAndValidate() {
    if (!this.source || !Array.isArray(this.source.scenes) || !Array.isArray(this.source.prefabs)) throw new Error("Scene/prefab source is invalid.");
    if (this.source.scenes.length > this.limits.maxScenes) throw new Error(`Scene count exceeds the limit of ${this.limits.maxScenes}.`);
    if (this.source.prefabs.length > this.limits.maxPrefabs) throw new Error(`Prefab count exceeds the limit of ${this.limits.maxPrefabs}.`);
    for (const prefab of this.source.prefabs) {
      assertId(prefab.id, "Prefab id");
      if (this.prefabs.has(prefab.id)) throw new Error(`Duplicate prefab id: ${prefab.id}`);
      this.prefabs.set(prefab.id, prefab);
      validateComponentList(prefab.components, `Prefab ${prefab.id}`, this.limits);
      validateRemovalList(prefab.removeComponentIds, `Prefab ${prefab.id}`);
      const localVariants = new Set<string>();
      for (const variant of prefab.variants ?? []) {
        assertId(variant.id, `Variant id on prefab ${prefab.id}`);
        if (localVariants.has(variant.id)) throw new Error(`Duplicate variant id on prefab ${prefab.id}: ${variant.id}`);
        localVariants.add(variant.id);
        validateComponentList(variant.components, `Variant ${prefab.id}/${variant.id}`, this.limits);
        validateRemovalList(variant.removeComponentIds, `Variant ${prefab.id}/${variant.id}`);
      }
    }
    for (const prefab of this.prefabs.values()) {
      if (prefab.extends && !this.prefabs.has(prefab.extends)) throw new Error(`Prefab ${prefab.id} extends missing prefab ${prefab.extends}.`);
      this.assertPrefabAcyclic(prefab.id, []);
      this.resolvePrefab(prefab.id);
    }
    for (const scene of this.source.scenes) {
      assertId(scene.id, "Scene id");
      if (this.scenes.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
      if (!Array.isArray(scene.entities) || scene.entities.length > this.limits.maxEntitiesPerScene) throw new Error(`Scene ${scene.id} exceeds the entity limit of ${this.limits.maxEntitiesPerScene}.`);
      this.scenes.set(scene.id, scene);
    }
    // Scene and prefab references are validated only after every ID has been indexed.
    for (const prefab of this.prefabs.values()) {
      const variants = this.effectiveVariants(prefab.id);
      for (const variantId of variants.keys()) this.applyVariant(prefab.id, variantId, variants, cloneComponents(this.resolvePrefab(prefab.id)), new Set(), 0);
      this.validateReusableReferences(prefab);
    }
    for (const scene of this.scenes.values()) this.validateScene(scene);
  }

  private assertPrefabAcyclic(prefabId: string, path: string[]) {
    if (path.includes(prefabId)) throw new Error(`Prefab inheritance cycle: ${[...path, prefabId].join(" -> ")}`);
    if (path.length >= this.limits.maxPrefabDepth) throw new Error(`Prefab ${prefabId} exceeds inheritance depth ${this.limits.maxPrefabDepth}.`);
    const parent = this.prefabs.get(prefabId)?.extends;
    if (parent) this.assertPrefabAcyclic(parent, [...path, prefabId]);
  }

  private resolvePrefab(prefabId: string, path: string[] = []): ContentComponent[] {
    const cached = this.resolvedPrefabs.get(prefabId);
    if (cached) return cached;
    if (path.includes(prefabId)) throw new Error(`Prefab inheritance cycle: ${[...path, prefabId].join(" -> ")}`);
    if (path.length >= this.limits.maxPrefabDepth) throw new Error(`Prefab ${prefabId} exceeds inheritance depth ${this.limits.maxPrefabDepth}.`);
    const prefab = this.prefabs.get(prefabId);
    if (!prefab) throw new Error(`Unknown prefab: ${prefabId}`);
    const inherited = prefab.extends ? this.resolvePrefab(prefab.extends, [...path, prefabId]) : [];
    const resolved = applyComponents(inherited, prefab.removeComponentIds, prefab.components, `Prefab ${prefab.id}`, this.limits);
    this.resolvedPrefabs.set(prefabId, resolved);
    return resolved;
  }

  private effectiveVariants(prefabId: string): Map<string, ContentPrefabVariant> {
    const chain: ContentPrefab[] = [];
    let cursor = this.prefabs.get(prefabId);
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.extends ? this.prefabs.get(cursor.extends) : undefined;
    }
    const variants = new Map<string, ContentPrefabVariant>();
    for (const prefab of chain) {
      for (const variant of prefab.variants ?? []) {
        if (variants.has(variant.id)) throw new Error(`Prefab ${prefabId} inherits duplicate variant id ${variant.id}.`);
        variants.set(variant.id, variant);
      }
    }
    for (const variant of variants.values()) {
      if (variant.extends && !variants.has(variant.extends)) throw new Error(`Variant ${prefabId}/${variant.id} extends missing variant ${variant.extends}.`);
      this.assertVariantAcyclic(prefabId, variant.id, variants, [], 0);
    }
    return variants;
  }

  private assertVariantAcyclic(prefabId: string, variantId: string, variants: ReadonlyMap<string, ContentPrefabVariant>, path: string[], depth: number) {
    if (path.includes(variantId)) throw new Error(`Variant inheritance cycle on prefab ${prefabId}: ${[...path, variantId].join(" -> ")}`);
    if (depth >= this.limits.maxPrefabDepth) throw new Error(`Variant ${prefabId}/${variantId} exceeds inheritance depth ${this.limits.maxPrefabDepth}.`);
    const parent = variants.get(variantId)?.extends;
    if (parent) this.assertVariantAcyclic(prefabId, parent, variants, [...path, variantId], depth + 1);
  }

  private applyVariant(prefabId: string, variantId: string, variants: ReadonlyMap<string, ContentPrefabVariant>, initial: ContentComponent[], applied: Set<string>, depth: number): ContentComponent[] {
    if (applied.has(variantId)) return initial;
    if (depth >= this.limits.maxPrefabDepth) throw new Error(`Variant ${prefabId}/${variantId} exceeds inheritance depth ${this.limits.maxPrefabDepth}.`);
    const variant = variants.get(variantId);
    if (!variant) throw new Error(`Unknown variant ${variantId} on prefab ${prefabId}.`);
    let components = initial;
    if (variant.extends) components = this.applyVariant(prefabId, variant.extends, variants, components, applied, depth + 1);
    components = applyComponents(components, variant.removeComponentIds, variant.components, `Variant ${prefabId}/${variant.id}`, this.limits);
    applied.add(variantId);
    return components;
  }

  private instantiateSceneEntity(entity: ContentSceneEntity): InstantiatedEntity {
    if (entity.prefabId) {
      return this.instantiatePrefab(entity.prefabId, {
        entityId: entity.id,
        ...(entity.parentId ? { parentId: entity.parentId } : {}),
        variantIds: entity.variantIds,
        components: entity.components,
        removeComponentIds: entity.removeComponentIds,
      });
    }
    if (entity.variantIds?.length) throw new Error(`Entity ${entity.id} selects variants without a prefab.`);
    return {
      id: entity.id,
      ...(entity.parentId ? { parentId: entity.parentId } : {}),
      variantIds: [],
      components: applyComponents([], entity.removeComponentIds, entity.components, `Entity ${entity.id}`, this.limits),
    };
  }

  private validateScene(scene: ContentScene) {
    const ids = new Set<string>();
    for (const entity of scene.entities) {
      assertId(entity.id, `Entity id in scene ${scene.id}`);
      if (ids.has(entity.id)) throw new Error(`Duplicate entity id in scene ${scene.id}: ${entity.id}`);
      ids.add(entity.id);
      if (entity.prefabId && !this.prefabs.has(entity.prefabId)) throw new Error(`Entity ${entity.id} references missing prefab ${entity.prefabId}.`);
      validateComponentList(entity.components, `Entity ${entity.id}`, this.limits);
      validateRemovalList(entity.removeComponentIds, `Entity ${entity.id}`);
    }
    const byId = new Map(scene.entities.map((entity) => [entity.id, entity]));
    for (const entity of scene.entities) {
      if (entity.parentId && !byId.has(entity.parentId)) throw new Error(`Entity ${entity.id} references missing parent ${entity.parentId}.`);
      const ancestry = new Set([entity.id]);
      let parentId = entity.parentId;
      let depth = 0;
      while (parentId) {
        if (ancestry.has(parentId)) throw new Error(`Entity parenting cycle in scene ${scene.id} includes ${entity.id}.`);
        if (++depth > this.limits.maxParentDepth) throw new Error(`Entity ${entity.id} exceeds parent depth ${this.limits.maxParentDepth}.`);
        ancestry.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }
    // Full expansion catches invalid variant and removal references transactionally.
    this.instantiateScene(scene.id);
  }

  private validateReusableReferences(prefab: ContentPrefab) {
    const lists = [prefab.components ?? [], ...(prefab.variants ?? []).map((variant) => variant.components ?? [])];
    for (const components of lists) {
      for (const component of components) {
        for (const reference of component.references ?? []) {
          if (reference.kind === "scene" && !this.scenes.has(reference.id)) throw new Error(`Component ${component.id} on prefab ${prefab.id} references missing scene ${reference.id}.`);
          if (reference.kind === "prefab" && !this.prefabs.has(reference.id)) throw new Error(`Component ${component.id} on prefab ${prefab.id} references missing prefab ${reference.id}.`);
        }
      }
    }
  }
}

export function createScenePrefabCatalog(source: ScenePrefabSource, limits?: ScenePrefabLimits) {
  return new ScenePrefabCatalog(source, limits);
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

/** Async scene lifecycle with serialized operations and rollback-safe internal state. */
export class SceneLifecycle {
  private statusValue: SceneLifecycleStatus = "idle";
  private active?: InstantiatedScene;
  private pendingSceneId?: string;
  private revisionValue = 0;
  private operationActive = false;

  constructor(private readonly catalog: ScenePrefabCatalog, private readonly hooks: SceneLifecycleHooks = {}) {}

  get status() { return this.statusValue; }
  get activeSceneId() { return this.active?.sceneId; }
  get revision() { return this.revisionValue; }

  snapshot(): SceneLifecycleSnapshot {
    return {
      version: 1,
      status: this.statusValue,
      revision: this.revisionValue,
      ...(this.active ? { activeSceneId: this.active.sceneId } : {}),
      ...(this.pendingSceneId ? { pendingSceneId: this.pendingSceneId } : {}),
    };
  }

  activeSceneSnapshot(): InstantiatedScene | undefined {
    return this.active ? cloneScene(this.active) : undefined;
  }

  /** Restores stable lifecycle metadata; external resources remain the host's responsibility. */
  restore(snapshot: SceneLifecycleSnapshot) {
    this.assertAvailable();
    if (snapshot.version !== 1 || (snapshot.status !== "idle" && snapshot.status !== "active")) throw new Error("Only stable idle or active scene lifecycle snapshots can be restored.");
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("Scene lifecycle snapshot revision is invalid.");
    if (snapshot.status === "idle") {
      if (snapshot.activeSceneId || snapshot.pendingSceneId) throw new Error("Idle scene lifecycle snapshot cannot reference a scene.");
      this.active = undefined;
    } else {
      if (!snapshot.activeSceneId || snapshot.pendingSceneId) throw new Error("Active scene lifecycle snapshot is incomplete.");
      this.active = this.catalog.instantiateScene(snapshot.activeSceneId);
    }
    this.statusValue = snapshot.status;
    this.pendingSceneId = undefined;
    this.revisionValue = snapshot.revision;
    return this.snapshot();
  }

  async load(sceneId: string) {
    this.assertAvailable();
    if (this.active || this.statusValue !== "idle") throw new Error("A scene is already active; use transition().");
    const target = this.catalog.instantiateScene(sceneId);
    this.operationActive = true;
    this.statusValue = "loading";
    this.pendingSceneId = sceneId;
    try {
      await this.hooks.load?.(cloneScene(target));
      this.active = target;
      this.pendingSceneId = undefined;
      this.statusValue = "active";
      this.revisionValue += 1;
      return cloneScene(target);
    } catch (error) {
      this.pendingSceneId = undefined;
      this.statusValue = "idle";
      throw error;
    } finally {
      this.operationActive = false;
    }
  }

  async unload() {
    this.assertAvailable();
    if (!this.active || this.statusValue !== "active") throw new Error("No active scene can be unloaded.");
    const previous = this.active;
    this.operationActive = true;
    this.statusValue = "unloading";
    try {
      await this.hooks.unload?.(cloneScene(previous));
      this.active = undefined;
      this.statusValue = "idle";
      this.revisionValue += 1;
    } catch (error) {
      this.statusValue = "active";
      throw error;
    } finally {
      this.operationActive = false;
    }
  }

  async transition(sceneId: string) {
    this.assertAvailable();
    if (!this.active || this.statusValue !== "active") throw new Error("A transition requires an active scene.");
    if (this.active.sceneId === sceneId) return cloneScene(this.active);
    const previous = this.active;
    const target = this.catalog.instantiateScene(sceneId);
    this.operationActive = true;
    this.statusValue = "transitioning";
    this.pendingSceneId = sceneId;
    let targetLoaded = false;
    try {
      await this.hooks.load?.(cloneScene(target));
      targetLoaded = true;
      await this.hooks.unload?.(cloneScene(previous));
      this.active = target;
      this.pendingSceneId = undefined;
      this.statusValue = "active";
      this.revisionValue += 1;
      return cloneScene(target);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      if (targetLoaded) {
        try { await this.hooks.unload?.(cloneScene(target)); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      this.active = previous;
      this.pendingSceneId = undefined;
      this.statusValue = "active";
      if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Scene transition failed and target cleanup also failed.");
      throw error;
    } finally {
      this.operationActive = false;
    }
  }

  private assertAvailable() {
    if (this.operationActive) throw new Error("A scene lifecycle operation is already in progress.");
  }
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
