import {
  createProjectHistory,
  migrateProject,
  uniqueId,
  type EditorAsset,
  type EditorProject,
  type HistoryEntry,
  type ProjectDeltaMutation,
  type ProjectSectionTransaction,
} from "@hyperfocus/engine/project";
import { createEditorStarter, EDITOR_STARTER_IDS, type EditorStarterId } from "./starter-projects.ts";
import { hashHyperfocusAsset } from "@hyperfocus/engine/project";
import { applyChoreographyRecipe2D, type ChoreographyRecipeId } from "./motion/choreography-recipes.ts";

export type EditorJsonValue = null | boolean | number | string | EditorJsonValue[] | { [key: string]: EditorJsonValue };

export type EditorPatchOperation =
  | { op: "add" | "replace"; path: string; value: EditorJsonValue }
  | { op: "remove"; path: string }
  | { op: "test"; path: string; value: EditorJsonValue };

export type EditorCommand =
  | { type: "project.patch"; label: string; operations: EditorPatchOperation[] }
  | { type: "project.replace"; label?: string; project: EditorProject }
  | { type: "project.create-starter"; starter: EditorStarterId; name: string }
  | { type: "timeline.apply-recipe"; recipe: ChoreographyRecipeId; frame: number; primaryEntityId: string; secondaryEntityId?: string; id?: string }
  | { type: "timeline.set-clip-key"; frame: number; entityId: string; clipId: string; trackId?: string }
  | { type: "asset.import"; name: string; mimeType: string; base64: string }
  | { type: "asset.hydrate"; assetId: string; base64: string }
  | { type: "asset.remove"; assetId: string }
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "session.mark-saved" };

export type EditorCommandPlan = {
  requestId: string;
  intent: string;
  commands: EditorCommand[];
};

export type EditorCommandAsset = {
  id: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type EditorCommandHost = {
  putAsset(asset: EditorCommandAsset): Promise<void>;
  removeAsset(assetId: string): Promise<void>;
};

export type EditorCommandSnapshot = {
  schema: "hyperfocus-editor-command-snapshot-v1";
  revision: number;
  capturedAt: string;
  project: EditorProject;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  changes: HistoryEntry[];
};

export type EditorCommandHandoff = {
  schema: "hyperfocus-editor-command-handoff-v1";
  requestId: string;
  intent: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  completedCommands: number;
  results: Array<{ index: number; type: EditorCommand["type"]; ok: boolean; detail: string }>;
  error?: string;
  snapshot: EditorCommandSnapshot;
  next: { verify: string[]; unresolved: string[] };
};

declare global {
  var __hyperfocusEditorCommands: EditorCommandSession | undefined;
}

/** DOM-free authority for project state, validation, history, and agent commands. */
export function createEditorCommandSession(project: EditorProject, host?: EditorCommandHost, historyLimit = 80) {
  const history = createProjectHistory(project, { limit: historyLimit, snapshotStrategy: "reference" });
  let revision = 0;

  const transact = (label: string, update: (draft: EditorProject) => void) => {
    if (history.transact(validateLabel(label), update)) revision += 1;
  };

  const transactSections = (transaction: ProjectSectionTransaction) => {
    if (history.transactSections({ ...transaction, label: validateLabel(transaction.label) })) revision += 1;
  };

  const replace = (nextProject: EditorProject, label = "Open project") => {
    history.replace(nextProject, validateLabel(label));
    revision += 1;
  };

  const undo = () => {
    const changed = history.undo();
    if (changed) revision += 1;
    return changed;
  };

  const redo = () => {
    const changed = history.redo();
    if (changed) revision += 1;
    return changed;
  };

  const snapshot = (options: { projectOwnership?: "clone" | "borrow" } = {}): EditorCommandSnapshot => {
    return {
      schema: "hyperfocus-editor-command-snapshot-v1",
      revision,
      capturedAt: new Date().toISOString(),
      project: options.projectOwnership === "borrow" ? history.project : structuredClone(history.project),
      dirty: history.dirty,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      changes: structuredClone(history.changes),
    };
  };

  const execute = async (plan: EditorCommandPlan): Promise<EditorCommandHandoff> => {
    validateCommandPlan(plan);
    const startedAt = new Date().toISOString();
    const results: EditorCommandHandoff["results"] = [];
    let error: string | undefined;
    for (const [index, command] of plan.commands.entries()) {
      try {
        const detail = await executeOne(command);
        results.push({ index, type: command.type, ok: true, detail });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        results.push({ index, type: command.type, ok: false, detail: error });
        break;
      }
    }
    return {
      schema: "hyperfocus-editor-command-handoff-v1",
      requestId: plan.requestId,
      intent: plan.intent,
      ok: error === undefined,
      startedAt,
      completedAt: new Date().toISOString(),
      completedCommands: results.filter((result) => result.ok).length,
      results,
      ...(error ? { error } : {}),
      snapshot: snapshot(),
      next: {
        verify: ["Confirm the returned canonical project snapshot and persistence evidence match the requested intent."],
        unresolved: error ? [error] : [],
      },
    };
  };

  const executeOne = async (command: EditorCommand) => {
    if (command.type === "project.patch") {
      if (!command.operations.length || command.operations.length > 1_000) throw new Error("project.patch requires from 1 through 1000 operations.");
      if (history.transactDelta(validateLabel(command.label), createEditorPatchMutation(command.operations))) revision += 1;
      return `Applied ${command.operations.length} validated project patch operation(s).`;
    }
    if (command.type === "project.replace") {
      replace(command.project, command.label ?? "Replace project");
      return "Replaced the project with a migrated, validated snapshot.";
    }
    if (command.type === "project.create-starter") {
      const starter = createEditorStarter(command.starter, command.name);
      for (const asset of starter.assets) {
        if (!host) throw new Error("This command session has no binary asset host for the requested starter.");
        const metadata = starter.project.assets.find((candidate) => candidate.id === asset.id);
        if (!metadata) throw new Error(`Starter binary ${asset.id} has no project asset record.`);
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        metadata.sha256 = await hashHyperfocusAsset(bytes);
        await host.putAsset({ id: asset.id, name: metadata.name, mimeType: metadata.mimeType, bytes });
      }
      replace(starter.project, `Create ${command.starter} starter`);
      return `Created ${command.starter} starter ${starter.project.name}.`;
    }
    if (command.type === "timeline.apply-recipe") {
      let detail = "";
      transactSections({ label: `Apply ${command.recipe} choreography`, dirtySections: ["timeline"], update(nextProject) {
        const scene = nextProject.scenes.find((candidate) => candidate.id === nextProject.activeSceneId);
        const primary = scene?.entities.find((entity) => entity.id === command.primaryEntityId);
        const secondary = command.secondaryEntityId ? scene?.entities.find((entity) => entity.id === command.secondaryEntityId) : undefined;
        if (!primary) throw new Error(`Choreography primary entity does not exist in the active scene: ${command.primaryEntityId}`);
        if (command.secondaryEntityId && !secondary) throw new Error(`Choreography secondary entity does not exist in the active scene: ${command.secondaryEntityId}`);
        const result = applyChoreographyRecipe2D({ timeline: nextProject.timeline, recipe: command.recipe, frame: command.frame, primary, secondary, id: command.id });
        nextProject.timeline = { ...nextProject.timeline, ...result.timeline };
        detail = `Applied ${command.recipe} choreography at frame ${command.frame}: ${result.changedTrackIds.length} editable tracks, ${result.effectIds.length} effects, contact frame ${result.contactFrame}.`;
      } });
      return detail;
    }
    if (command.type === "timeline.set-clip-key") {
      let detail = "";
      transactSections({ label: `Set ${command.clipId} clip`, dirtySections: ["timeline"], update(nextProject) {
        const entity = nextProject.scenes.flatMap((scene) => scene.entities).find((candidate) => candidate.id === command.entityId);
        if (!entity) throw new Error(`Timeline clip entity does not exist: ${command.entityId}`);
        const clip = nextProject.atlas.clips?.find((candidate) => candidate.id === command.clipId);
        if (!clip) throw new Error(`Timeline atlas clip does not exist: ${command.clipId}`);
        if (!Number.isSafeInteger(command.frame) || command.frame < 0 || command.frame > nextProject.timeline.durationFrames) throw new Error(`Timeline clip frame must be between 0 and ${nextProject.timeline.durationFrames}.`);
        nextProject.timeline.clipTracks ??= [];
        let track = command.trackId ? nextProject.timeline.clipTracks.find((candidate) => candidate.id === command.trackId) : undefined;
        track ??= nextProject.timeline.clipTracks.find((candidate) => candidate.targetId === entity.id);
        if (command.trackId && !track) throw new Error(`Timeline clip track does not exist: ${command.trackId}`);
        if (!track) {
          track = { id: uniqueId(`clip-${entity.id}`), targetId: entity.id, label: `${entity.label} animation`, muted: false, locked: false, keyframes: [] };
          nextProject.timeline.clipTracks.push(track);
        }
        if (track.targetId !== entity.id) throw new Error(`Timeline clip track ${track.id} targets ${track.targetId}, not ${entity.id}.`);
        if (track.locked) throw new Error(`Timeline clip track ${track.id} is locked.`);
        const existing = track.keyframes.find((key) => key.frame === command.frame);
        if (existing) existing.clipId = clip.id;
        else track.keyframes.push({ id: uniqueId("clip-key"), frame: command.frame, clipId: clip.id });
        track.keyframes.sort((left, right) => left.frame - right.frame);
        detail = `${existing ? "Updated" : "Set"} ${clip.name} on ${entity.label} at frame ${command.frame}.`;
      } });
      return detail;
    }
    if (command.type === "asset.import") {
      if (!host) throw new Error("This command session has no binary asset host.");
      const bytes = decodeBase64(command.base64);
      if (bytes.byteLength > 268435456) throw new Error("Imported asset exceeds the 256 MiB per-file limit.");
      const name = validateAssetName(command.name);
      const mimeType = normalizeImportedMimeType(validateMimeType(command.mimeType), name);
      const asset: EditorAsset = {
        id: uniqueId("asset"),
        name,
        kind: assetKind(mimeType, name),
        mimeType,
        size: bytes.byteLength,
        lastModified: Date.now(),
        source: "imported",
        sha256: await hashHyperfocusAsset(bytes),
      };
      await host.putAsset({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes });
      transactSections({ label: `Import ${asset.name}`, dirtySections: ["assets"], update(nextProject) { nextProject.assets.push(asset); } });
      return `Imported ${asset.name} as ${asset.id}.`;
    }
    if (command.type === "asset.hydrate") {
      if (!host) throw new Error("This command session has no binary asset host.");
      const asset = history.project.assets.find((candidate) => candidate.id === command.assetId);
      if (!asset) throw new Error(`Asset does not exist in the current project: ${command.assetId}`);
      const bytes = decodeBase64(command.base64);
      if (bytes.byteLength > 268435456) throw new Error("Hydrated asset exceeds the 256 MiB per-file limit.");
      if (bytes.byteLength !== asset.size) throw new Error(`Hydrated asset size does not match the project catalog: ${asset.id}`);
      const sha256 = await hashHyperfocusAsset(bytes);
      if (asset.sha256 && asset.sha256 !== sha256) throw new Error(`Hydrated asset SHA-256 does not match the project catalog: ${asset.id}`);
      await host.putAsset({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes });
      return `Hydrated ${asset.name} as ${asset.id} without changing project history.`;
    }
    if (command.type === "asset.remove") {
      const asset = history.project.assets.find((candidate) => candidate.id === command.assetId);
      if (!asset) throw new Error(`Asset does not exist: ${command.assetId}`);
      // Keep the host binary while this project history can still restore its
      // catalog record. Physical cache cleanup is a separate, non-undoable
      // storage operation owned by the host application.
      transactSections({ label: `Remove ${asset.name}`, dirtySections: ["assets"], update(nextProject) { nextProject.assets = nextProject.assets.filter((candidate) => candidate.id !== asset.id); } });
      return `Removed ${asset.name}.`;
    }
    if (command.type === "history.undo") {
      if (!undo()) throw new Error("There is no command to undo.");
      return "Undid the previous command.";
    }
    if (command.type === "history.redo") {
      if (!redo()) throw new Error("There is no command to redo.");
      return "Redid the previous command.";
    }
    if (command.type === "session.mark-saved") {
      history.markSaved();
      return "Marked the current project revision as saved.";
    }
    throw new Error("Unknown editor command.");
  };

  return {
    get project() { return history.project; },
    get canUndo() { return history.canUndo; },
    get canRedo() { return history.canRedo; },
    get dirty() { return history.dirty; },
    get changes() { return history.changes; },
    get serializationMetrics() { return history.serializationMetrics; },
    subscribe: history.subscribe,
    transact,
    transactSections,
    replace,
    undo,
    redo,
    markSaved: history.markSaved,
    serialize: history.serialize,
    snapshot,
    execute,
  };
}

export type EditorCommandSession = ReturnType<typeof createEditorCommandSession>;

export function validateCommandPlan(plan: unknown): asserts plan is EditorCommandPlan {
  const value = record(plan);
  if (!value) throw new Error("Command plan must be an object.");
  if (typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 200) throw new Error("Command plan requires a requestId of at most 200 characters.");
  if (typeof value.intent !== "string" || !value.intent.trim() || value.intent.length > 2_000) throw new Error("Command plan requires an intent of at most 2000 characters.");
  if (!Array.isArray(value.commands) || value.commands.length > 200) throw new Error("Command plan commands must be an array of at most 200 commands.");
  for (const command of value.commands) if (!isEditorCommand(command)) throw new Error(`Command plan contains an invalid command: ${String(record(command)?.type)}`);
}

export function applyEditorPatch(project: EditorProject, operations: readonly EditorPatchOperation[]) {
  createEditorPatchMutation(operations).apply(project);
  return migrateProject(project);
}

export function createEditorPatchMutation(operations: readonly EditorPatchOperation[]): ProjectDeltaMutation {
  const dirtySections = [...new Set(operations.map((operation) => jsonPointerTokens(operation.path)[0]).filter(Boolean))];
  let inverse: EditorPatchOperation[] | undefined;
  return {
    dirtySections,
    apply(project) {
      if (inverse) {
        applyEditorPatchOperations(project, operations);
        return true;
      }
      const captured = applyEditorPatchOperations(project, operations, true);
      inverse = captured.inverse;
      return captured.changed;
    },
    revert(project) {
      if (inverse) applyEditorPatchOperations(project, inverse);
    }
  };
}

function applyEditorPatchOperations(
  project: EditorProject,
  operations: readonly EditorPatchOperation[],
  captureInverse = false
) {
  const inverse: EditorPatchOperation[] = [];
  let changed = false;
  for (const operation of operations) {
    const tokens = jsonPointerTokens(operation.path);
    if (!tokens.length) throw new Error("Project patch operations cannot replace or remove the document root.");
    const { parent, key } = resolvePatchParent(project, tokens);
    if (operation.op === "test") {
      const current = readPatchValue(parent, key);
      if (JSON.stringify(current) !== JSON.stringify(operation.value)) throw new Error(`Project patch test failed at ${operation.path}.`);
      continue;
    }
    if (operation.op === "remove") {
      if (captureInverse) inverse.unshift({ op: "add", path: operation.path, value: structuredClone(readPatchValue(parent, key)) });
      removePatchValue(parent, key, operation.path);
      changed = true;
      continue;
    }
    const priorExists = Array.isArray(parent) ? operation.op === "replace" : Reflect.has(parent, key);
    const prior = priorExists ? structuredClone(readPatchValue(parent, key)) : undefined;
    if (priorExists && !isEditorJsonValue(prior, 0)) {
      throw new Error(`Project patch prior value is not JSON-compatible at ${operation.path}.`);
    }
    const concretePath = Array.isArray(parent) && operation.op === "add" && key === "-"
      ? `${operation.path.slice(0, -1)}${parent.length}`
      : operation.path;
    writePatchValue(parent, key, structuredClone(operation.value), operation.op, operation.path);
    changed ||= !priorExists || JSON.stringify(prior) !== JSON.stringify(operation.value) || Array.isArray(parent) && operation.op === "add";
    if (captureInverse) inverse.unshift(priorExists && !Array.isArray(parent) || operation.op === "replace"
      ? { op: "replace", path: concretePath, value: prior! }
      : { op: "remove", path: concretePath });
  }
  return { changed, inverse };
}

function jsonPointerTokens(path: string) {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 4_096) throw new Error(`Invalid JSON pointer: ${String(path)}`);
  return path.slice(1).split("/").map((token) => {
    if (/~(?:[^01]|$)/.test(token)) throw new Error(`Invalid JSON pointer escape in token: ${token}`);
    const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (["__proto__", "prototype", "constructor"].includes(decoded)) throw new Error(`Unsafe JSON pointer token: ${decoded}`);
    return decoded;
  });
}

function resolvePatchParent(root: unknown, tokens: string[]) {
  let parent = root;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[arrayIndex(token, parent.length, false)]!;
    else if (parent && typeof parent === "object" && Reflect.has(parent, token)) parent = Reflect.get(parent, token);
    else throw new Error(`Project patch path does not exist: /${tokens.join("/")}`);
  }
  if (!parent || typeof parent !== "object") throw new Error(`Project patch parent is not a container: /${tokens.join("/")}`);
  return { parent, key: tokens.at(-1)! };
}

function readPatchValue(parent: object, key: string) {
  if (Array.isArray(parent)) return parent[arrayIndex(key, parent.length, false)];
  if (!Reflect.has(parent, key)) throw new Error(`Project patch path does not exist: ${key}`);
  return Reflect.get(parent, key);
}

function writePatchValue(parent: object, key: string, value: EditorJsonValue, op: "add" | "replace", path: string) {
  if (Array.isArray(parent)) {
    if (op === "add" && key === "-") { parent.push(value); return; }
    const index = arrayIndex(key, parent.length, op === "add");
    if (op === "add") parent.splice(index, 0, value);
    else parent[index] = value;
    return;
  }
  if (op === "replace" && !Reflect.has(parent, key)) throw new Error(`Project patch replace path does not exist: ${path}`);
  Reflect.set(parent, key, value);
}

function removePatchValue(parent: object, key: string, path: string) {
  if (Array.isArray(parent)) { parent.splice(arrayIndex(key, parent.length, false), 1); return; }
  if (!Reflect.has(parent, key)) throw new Error(`Project patch remove path does not exist: ${path}`);
  Reflect.deleteProperty(parent, key);
}

function arrayIndex(token: string, length: number, allowEnd: boolean) {
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`Invalid array index: ${token}`);
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index < 0 || index > length || (!allowEnd && index === length)) throw new Error(`Array index is out of bounds: ${token}`);
  return index;
}

function validateLabel(value: string) {
  const label = value.trim();
  if (!label || label.length > 200 || /[\0\r\n]/.test(label)) throw new Error("Editor command label must contain 1 through 200 printable characters.");
  return label;
}

function validateAssetName(value: string) {
  const name = value.trim();
  if (!name || name.length > 1_024 || /[\0\r\n/\\]/.test(name)) throw new Error("Asset name is invalid.");
  return name;
}

function validateMimeType(value: string) {
  const mimeType = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)) throw new Error("Asset MIME type is invalid.");
  return mimeType;
}

function assetKind(mimeType: string, name: string): EditorAsset["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("font/") || /\.(ttf|otf|woff2?)$/i.test(name)) return "font";
  if (/json|text|csv/.test(mimeType) || /\.gltf$/i.test(name)) return "data";
  return "unknown";
}

function normalizeImportedMimeType(mimeType: string, name: string) {
  return /\.gltf$/i.test(name) && mimeType === "application/octet-stream" ? "model/gltf+json" : mimeType;
}

function decodeBase64(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Asset contents must be valid base64 without a data-URL prefix.");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isEditorCommand(value: unknown): value is EditorCommand {
  const command = record(value);
  if (!command || typeof command.type !== "string") return false;
  if (command.type === "history.undo" || command.type === "history.redo" || command.type === "session.mark-saved") return true;
  if (command.type === "asset.remove") return typeof command.assetId === "string";
  if (command.type === "asset.import") return typeof command.name === "string" && typeof command.mimeType === "string" && typeof command.base64 === "string";
  if (command.type === "asset.hydrate") return typeof command.assetId === "string" && typeof command.base64 === "string";
  if (command.type === "project.create-starter") return isEditorStarterId(command.starter) && typeof command.name === "string";
  if (command.type === "timeline.apply-recipe") return ["anticipation", "lunge", "impact", "bite", "transform"].includes(String(command.recipe))
    && Number.isSafeInteger(command.frame) && Number(command.frame) >= 0
    && typeof command.primaryEntityId === "string" && command.primaryEntityId.length > 0
    && (command.secondaryEntityId === undefined || typeof command.secondaryEntityId === "string")
    && (command.id === undefined || typeof command.id === "string");
  if (command.type === "timeline.set-clip-key") return Number.isSafeInteger(command.frame) && Number(command.frame) >= 0
    && typeof command.entityId === "string" && command.entityId.length > 0
    && typeof command.clipId === "string" && command.clipId.length > 0
    && (command.trackId === undefined || typeof command.trackId === "string");
  if (command.type === "project.patch") return typeof command.label === "string" && Array.isArray(command.operations) && command.operations.every(isPatchOperation);
  if (command.type === "project.replace") {
    if (command.label !== undefined && typeof command.label !== "string") return false;
    try { migrateProject(command.project); return true; } catch { return false; }
  }
  return false;
}

function isPatchOperation(value: unknown): value is EditorPatchOperation {
  const operation = record(value);
  if (!operation || typeof operation.path !== "string") return false;
  if (operation.op === "remove") return true;
  return (operation.op === "add" || operation.op === "replace" || operation.op === "test") && isEditorJsonValue(operation.value, 0);
}

function isEditorJsonValue(value: unknown, depth: number): value is EditorJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth >= 64) return false;
  if (Array.isArray(value)) return value.every((item) => isEditorJsonValue(item, depth + 1));
  const valueRecord = record(value);
  return Boolean(valueRecord && Object.values(valueRecord).every((item) => isEditorJsonValue(item, depth + 1)));
}

function isEditorStarterId(value: unknown): value is EditorStarterId {
  return typeof value === "string" && EDITOR_STARTER_IDS.some(id => id === value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}
