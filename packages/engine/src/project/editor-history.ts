import { isRecord as isObject } from "@hyperfocus/utilities/records";
import type { EditorEntityData, EditorProject } from "./editor.ts";
import { migrateProject, stableProjectJson, validateProject } from "./editor.ts";
import { validatePlayableSaveProject2D } from "./runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "./runtime-story-2d.ts";
import { createSectionedSerializer, sortJsonKeys } from "./sectioned-serializer.ts";

export const MAX_SCENES = 128;

export const MAX_ENTITIES = 10_000;

export const TARGET_PROFILES = ["desktop", "mobile", "low-power"] as const;

export const ENTITY_KINDS = ["prop", "actor", "hostile"] as const;

export const COMPONENT_TYPES = ["transform", "sprite", "collider", "input", "behavior", "camera", "audio", "ui"] as const;

export type HistoryEntry = {
  label: string;
  at: string;
};

export type StoredSnapshot = HistoryEntry & {
  kind: "snapshot";
  project: EditorProject;
  serialized: string;
  version: number;
};

export type ProjectDeltaMutation = {
  dirtySections: readonly string[];
  apply(project: EditorProject): boolean | void;
  revert(project: EditorProject): void;
  /** Defaults to full-project validation. Use only when the mutation boundary proves a narrower validator is sufficient. */
  validate?(project: EditorProject): void;
};

export type ProjectSectionTransaction = {
  label: string;
  dirtySections: readonly (keyof EditorProject & string)[];
  update(project: EditorProject): void;
};

export type StoredDelta = HistoryEntry & {
  kind: "delta";
  mutation: ProjectDeltaMutation;
  beforeUpdatedAt: string;
  afterUpdatedAt: string;
  beforeVersion: number;
  afterVersion: number;
};

export type StoredHistory = StoredSnapshot | StoredDelta;

export type ProjectHistoryOptions = {
  limit?: number;
  /** Full undo checkpoint cadence for delta edits. Use `0` to keep only inverse deltas. */
  deltaCheckpointInterval?: number;
  /**
   * `clone` isolates undo snapshots from references held by callers. `reference`
   * avoids a second full-project clone when the owner treats returned projects as
   * borrowed read-only snapshots and writes only through `transact`.
   */
  snapshotStrategy?: "clone" | "reference";
};

export function validateProjectScenes(project: EditorProject) {
  assertText(project.activeSceneId, "Active scene id", 128);
  if (!Array.isArray(project.scenes) || project.scenes.length === 0 || project.scenes.length > MAX_SCENES) throw new Error(`A project must contain 1–${MAX_SCENES} scenes.`);
  const sceneIds = new Set<string>();
  const entityIds = new Set<string>();
  let entityCount = 0;
  for (const scene of project.scenes) {
    if (!isObject(scene)) throw new Error("Scene data is invalid.");
    assertText(scene.id, "Scene id", 128);
    assertText(scene.name, "Scene name", 256);
    if (sceneIds.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    if (!Array.isArray(scene.entities)) throw new Error(`Scene ${scene.id} has invalid entities.`);
    entityCount += scene.entities.length;
    if (entityCount > MAX_ENTITIES) throw new Error(`Projects may contain at most ${MAX_ENTITIES} entities.`);
    const localIds = new Set<string>();
    for (const candidate of scene.entities) {
      validateEntity(candidate);
      if (entityIds.has(candidate.id)) throw new Error(`Duplicate entity id: ${candidate.id}`);
      entityIds.add(candidate.id);
      localIds.add(candidate.id);
    }
    const parents = new Map(scene.entities.map((entity) => [entity.id, entity.parentId]));
    for (const candidate of scene.entities) {
      if (candidate.parentId && !localIds.has(candidate.parentId)) throw new Error(`Entity ${candidate.id} references a missing parent.`);
      const ancestry = new Set([candidate.id]);
      let parentId = candidate.parentId;
      while (parentId) {
        if (ancestry.has(parentId)) throw new Error(`Entity parenting cycle includes ${candidate.id}.`);
        ancestry.add(parentId);
        parentId = parents.get(parentId);
      }
    }
  }
  if (!sceneIds.has(project.activeSceneId)) throw new Error("The active scene does not exist.");
}

export function validateProjectSettings(project: EditorProject) {
  if (!isObject(project.settings) || !isOneOf(project.settings.targetProfile, TARGET_PROFILES)) throw new Error("Target profile is invalid.");
  assertText(project.settings.locale, "Locale", 64);
  assertFinite(project.settings.masterVolume, "Master volume", 0, 1);
  if (typeof project.settings.reducedMotion !== "boolean" || !Array.isArray(project.settings.input) || project.settings.input.length > 256) throw new Error("Editor settings are invalid.");
  for (const mapping of project.settings.input) {
    if (!isObject(mapping) || !Array.isArray(mapping.bindings) || mapping.bindings.length > 32) throw new Error("Input mapping is invalid.");
    assertText(mapping.action, "Input action", 128);
    for (const binding of mapping.bindings) assertText(binding, `Binding for ${mapping.action}`, 128);
  }
}

export function validateProjectDirtySections(project: EditorProject, dirtySections: readonly string[]) {
  const dirty = new Set(dirtySections);
  if ([...dirty].every((section) => section === "name")) {
    assertText(project.name, "Project name", 256);
    return;
  }
  if ([...dirty].every((section) => section === "activeSceneId")) {
    assertText(project.activeSceneId, "Active scene id", 128);
    if (!project.scenes.some((scene) => scene.id === project.activeSceneId)) throw new Error("The active scene does not exist.");
    return;
  }
  if ([...dirty].every((section) => section === "scenes" || section === "activeSceneId")) {
    validateProjectScenes(project);
    validatePlayableSaveProject2D(project);
    validatePlayableStoryProject2D(project);
    return;
  }
  if ([...dirty].every((section) => section === "settings")) {
    validateProjectSettings(project);
    return;
  }
  validateProject(project);
}

export type ProjectSectionSnapshot = {
  key: keyof EditorProject & string;
  exists: boolean;
  value: EditorProject[keyof EditorProject] | undefined;
  serialized: string;
};

export function createProjectSectionMutation(project: EditorProject, transaction: ProjectSectionTransaction): ProjectDeltaMutation {
  const dirtySections = [...new Set(transaction.dirtySections)];
  if (!dirtySections.length) throw new Error("A section transaction requires at least one dirty section.");
  if (dirtySections.includes("updatedAt")) throw new Error("Project history owns the updatedAt section.");
  for (const section of dirtySections) {
    if (!(section in project) && section !== "extensions") throw new Error(`Unknown project section: ${section}`);
  }
  const before = captureProjectSections(project, dirtySections);
  let after: ProjectSectionSnapshot[] | undefined;
  return {
    dirtySections,
    apply(draft) {
      if (after) {
        restoreProjectSections(draft, after);
        return true;
      }
      transaction.update(draft);
      after = captureProjectSections(draft, dirtySections);
      return after.some((section, index) => section.serialized !== before[index]?.serialized);
    },
    revert(draft) { restoreProjectSections(draft, before); },
    validate(draft) { validateProjectDirtySections(draft, dirtySections); }
  };
}

export function captureProjectSections(project: EditorProject, sections: readonly (keyof EditorProject & string)[]) {
  return sections.map((key): ProjectSectionSnapshot => {
    const exists = Object.hasOwn(project, key);
    const value = exists ? clone(project[key]) : undefined;
    return { key, exists, value, serialized: JSON.stringify(sortJsonKeys(value)) };
  });
}

export function restoreProjectSections(project: EditorProject, sections: readonly ProjectSectionSnapshot[]) {
  for (const section of sections) {
    if (section.exists) Reflect.set(project, section.key, clone(section.value));
    else Reflect.deleteProperty(project, section.key);
  }
}

export function createProjectHistory(project: EditorProject, options: number | ProjectHistoryOptions = {}) {
  const limit = typeof options === "number" ? options : options.limit ?? 80;
  const snapshotStrategy = typeof options === "number" ? "clone" : options.snapshotStrategy ?? "clone";
  const deltaCheckpointInterval = typeof options === "number" ? 32 : options.deltaCheckpointInterval ?? 32;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Project history limit must be a positive safe integer.");
  if (!Number.isSafeInteger(deltaCheckpointInterval) || deltaCheckpointInterval < 0) {
    throw new RangeError("Delta checkpoint interval must be a non-negative safe integer.");
  }
  if (snapshotStrategy !== "clone" && snapshotStrategy !== "reference") {
    throw new RangeError(`Unsupported project history snapshot strategy "${String(snapshotStrategy)}".`);
  }
  let current = clone(project);
  const serializer = createSectionedSerializer<EditorProject>();
  let currentSerialized: string | undefined = serializer.serialize(current);
  let dirtySections = new Set<string>();
  let currentVersion = 0;
  let nextVersion = 1;
  let savedVersion = currentVersion;
  let undoStack: StoredHistory[] = [];
  let redoStack: StoredHistory[] = [];
  let deltasSinceCheckpoint = 0;
  const listeners = new Set<() => void>();
  const changes: HistoryEntry[] = [];

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const retain = (snapshot: EditorProject) => snapshotStrategy === "reference" ? snapshot : clone(snapshot);
  const serializeCurrent = () => {
    currentSerialized ??= serializer.serialize(current, dirtySections);
    dirtySections = new Set();
    return currentSerialized;
  };
  const invalidateSerialization = (sections?: readonly string[]) => {
    currentSerialized = undefined;
    if (!sections) {
      serializer.invalidate();
      dirtySections = new Set();
      return;
    }
    for (const section of sections) dirtySections.add(section);
    dirtySections.add("updatedAt");
  };
  const trimUndo = () => { if (undoStack.length > limit) undoStack.shift(); };
  const commitDelta = (label: string, mutation: ProjectDeltaMutation) => {
    const beforeUpdatedAt = current.updatedAt;
    const shouldCheckpoint = deltaCheckpointInterval > 0 && deltasSinceCheckpoint + 1 >= deltaCheckpointInterval;
    const checkpoint = shouldCheckpoint
      ? { project: clone(current), serialized: serializeCurrent(), version: currentVersion }
      : undefined;
    let changed: boolean | void;
    try {
      changed = mutation.apply(current);
      if (changed === false) return false;
      current.updatedAt = new Date().toISOString();
      (mutation.validate ?? validateProject)(current);
    } catch (error) {
      mutation.revert(current);
      current.updatedAt = beforeUpdatedAt;
      throw error;
    }
    const afterVersion = nextVersion;
    undoStack.push(checkpoint
      ? { kind: "snapshot", label, at: current.updatedAt, ...checkpoint }
      : { kind: "delta", label, at: current.updatedAt, mutation,
        beforeUpdatedAt, afterUpdatedAt: current.updatedAt, beforeVersion: currentVersion, afterVersion });
    trimUndo();
    redoStack = [];
    deltasSinceCheckpoint = shouldCheckpoint ? 0 : deltasSinceCheckpoint + 1;
    currentVersion = afterVersion;
    nextVersion += 1;
    invalidateSerialization(mutation.dirtySections);
    changes.unshift({ label, at: current.updatedAt });
    if (changes.length > limit) changes.pop();
    emit();
    return true;
  };

  return {
    get project() { return current; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get dirty() { return currentVersion !== savedVersion; },
    get version() { return currentVersion; },
    get changes() { return changes; },
    get serializationMetrics() { return serializer.metrics; },
    serialize() { return serializeCurrent(); },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    transact(label: string, update: (draft: EditorProject) => void) {
      const next = clone(current);
      update(next);
      next.updatedAt = new Date().toISOString();
      validateProject(next);
      const nextSerialized = stableProjectJson(next);
      if (serializeCurrent() === nextSerialized) return false;
      undoStack.push({
        kind: "snapshot",
        label,
        at: next.updatedAt,
        project: retain(current),
        serialized: serializeCurrent(),
        version: currentVersion,
      });
      trimUndo();
      redoStack = [];
      current = next;
      currentSerialized = nextSerialized;
      serializer.invalidate();
      dirtySections = new Set();
      currentVersion = nextVersion;
      nextVersion += 1;
      deltasSinceCheckpoint = 0;
      changes.unshift({ label, at: next.updatedAt });
      if (changes.length > limit) changes.pop();
      emit();
      return true;
    },
    transactSections(transaction: ProjectSectionTransaction) {
      const mutation = createProjectSectionMutation(current, transaction);
      return commitDelta(transaction.label, mutation);
    },
    transactDelta(label: string, mutation: ProjectDeltaMutation) {
      return commitDelta(label, mutation);
    },
    replace(nextProject: EditorProject, label = "Open project") {
      const migrated = migrateProject(nextProject);
      undoStack.push({
        kind: "snapshot",
        label,
        at: new Date().toISOString(),
        project: retain(current),
        serialized: serializeCurrent(),
        version: currentVersion,
      });
      trimUndo();
      redoStack = [];
      current = migrated;
      currentSerialized = stableProjectJson(migrated);
      serializer.invalidate();
      dirtySections = new Set();
      currentVersion = nextVersion;
      nextVersion += 1;
      deltasSinceCheckpoint = 0;
      changes.unshift({ label, at: migrated.updatedAt });
      if (changes.length > limit) changes.pop();
      emit();
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      deltasSinceCheckpoint = 0;
      if (entry.kind === "delta") {
        entry.mutation.revert(current);
        current.updatedAt = entry.beforeUpdatedAt;
        (entry.mutation.validate ?? validateProject)(current);
        redoStack.push(entry);
        currentVersion = entry.beforeVersion;
        invalidateSerialization(entry.mutation.dirtySections);
        changes.unshift({ label: `Undo: ${entry.label}`, at: new Date().toISOString() });
        if (changes.length > limit) changes.pop();
        emit();
        return true;
      }
      redoStack.push({
        kind: "snapshot",
        label: entry.label,
        at: new Date().toISOString(),
        project: retain(current),
        serialized: serializeCurrent(),
        version: currentVersion,
      });
      current = entry.project;
      currentSerialized = entry.serialized;
      serializer.invalidate();
      dirtySections = new Set();
      currentVersion = entry.version;
      changes.unshift({ label: `Undo: ${entry.label}`, at: new Date().toISOString() });
      if (changes.length > limit) changes.pop();
      emit();
      return true;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return false;
      deltasSinceCheckpoint = 0;
      if (entry.kind === "delta") {
        entry.mutation.apply(current);
        current.updatedAt = entry.afterUpdatedAt;
        (entry.mutation.validate ?? validateProject)(current);
        undoStack.push(entry);
        trimUndo();
        currentVersion = entry.afterVersion;
        invalidateSerialization(entry.mutation.dirtySections);
        changes.unshift({ label: `Redo: ${entry.label}`, at: new Date().toISOString() });
        if (changes.length > limit) changes.pop();
        emit();
        return true;
      }
      undoStack.push({
        kind: "snapshot",
        label: entry.label,
        at: new Date().toISOString(),
        project: retain(current),
        serialized: serializeCurrent(),
        version: currentVersion,
      });
      trimUndo();
      current = entry.project;
      currentSerialized = entry.serialized;
      serializer.invalidate();
      dirtySections = new Set();
      currentVersion = entry.version;
      changes.unshift({ label: `Redo: ${entry.label}`, at: new Date().toISOString() });
      if (changes.length > limit) changes.pop();
      emit();
      return true;
    },
    markSaved() {
      savedVersion = currentVersion;
      emit();
    },
  };
}

export type ProjectHistory = ReturnType<typeof createProjectHistory>;

export function clone<T>(value: T): T {
  return structuredClone(value);
}



export function validateEntity(candidate: EditorEntityData) {
  if (!isObject(candidate)) throw new Error("Entity data is invalid.");
  assertText(candidate.id, "Entity id", 128);
  assertText(candidate.label, `Entity ${candidate.id} label`, 256);
  if (candidate.parentId !== undefined) assertText(candidate.parentId, `Entity ${candidate.id} parent`, 128);
  if (!isOneOf(candidate.kind, ENTITY_KINDS)) throw new Error(`Entity ${candidate.id} has an invalid kind.`);
  for (const key of ["x", "y"] as const) assertFinite(candidate[key], `Entity ${candidate.id} ${key}`, -10_000_000, 10_000_000);
  for (const key of ["width", "height", "scale"] as const) assertFinite(candidate[key], `Entity ${candidate.id} ${key}`, 0.001, 1_000_000);
  if (candidate.rotation !== undefined) assertFinite(candidate.rotation, `Entity ${candidate.id} rotation`, -1_000_000, 1_000_000);
  if (candidate.opacity !== undefined) assertFinite(candidate.opacity, `Entity ${candidate.id} opacity`, 0, 1);
  assertInteger(candidate.layer, `Entity ${candidate.id} layer`, -10_000, 10_000);
  assertColor(candidate.color, `Entity ${candidate.id} color`);
  assertColor(candidate.accent, `Entity ${candidate.id} accent`);
  if (!Array.isArray(candidate.components) || candidate.components.length > 64) throw new Error(`Entity ${candidate.id} has invalid components.`);
  const componentIds = new Set<string>();
  for (const item of candidate.components) {
    if (!isObject(item) || !isObject(item.values)) throw new Error(`Entity ${candidate.id} has an invalid component.`);
    assertText(item.id, "Component id", 128);
    if (componentIds.has(item.id)) throw new Error(`Duplicate component id on ${candidate.id}: ${item.id}`);
    componentIds.add(item.id);
    if (!isOneOf(item.type, COMPONENT_TYPES)) throw new Error(`Component ${item.id} has an invalid type.`);
    if (typeof item.enabled !== "boolean" || Object.keys(item.values).length > 128) throw new Error(`Component ${item.id} is invalid or too large.`);
    for (const [key, value] of Object.entries(item.values)) {
      assertText(key, `Component ${item.id} value name`, 128);
      if (typeof value === "number") assertFinite(value, `Component ${item.id}.${key}`, -1_000_000_000, 1_000_000_000);
      else if (typeof value !== "string" && typeof value !== "boolean") throw new Error(`Component ${item.id}.${key} must be a primitive value.`);
      else if (typeof value === "string" && value.length > 4_096) throw new Error(`Component ${item.id}.${key} is too long.`);
    }
  }
}

export function assertText(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} must be a non-empty string no longer than ${maxLength} characters.`);
}

export function assertFinite(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
}

export function assertInteger(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  assertFinite(value, label, minimum, maximum);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
}

export function assertColor(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${label} must be a six-digit hexadecimal color.`);
}

export function isOneOf(value: unknown, allowed: readonly string[]) {
  return allowed.some((candidate) => candidate === value);
}

export { isRecord as isObject } from "@hyperfocus/utilities/records";
