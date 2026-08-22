import {
  ProjectHistory,
  migrateProject,
  stableProjectJson,
  uniqueId,
  type EditorAsset,
  type EditorProject,
  type HistoryEntry,
} from "./project.ts";
import { createEditorStarter, type EditorStarterId } from "./starter-projects.ts";
import { hashHyperfocusAsset } from "@hyperfocus/engine/project";

export type EditorJsonValue = null | boolean | number | string | EditorJsonValue[] | { [key: string]: EditorJsonValue };

export type EditorPatchOperation =
  | { op: "add" | "replace"; path: string; value: EditorJsonValue }
  | { op: "remove"; path: string }
  | { op: "test"; path: string; value: EditorJsonValue };

export type EditorCommand =
  | { type: "project.patch"; label: string; operations: EditorPatchOperation[] }
  | { type: "project.replace"; label?: string; project: EditorProject }
  | { type: "project.create-starter"; starter: EditorStarterId; name: string }
  | { type: "asset.import"; name: string; mimeType: string; base64: string }
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
export class EditorCommandSession {
  private readonly history: ProjectHistory;
  private revision = 0;

  constructor(project: EditorProject, private readonly host?: EditorCommandHost, historyLimit = 80) {
    this.history = new ProjectHistory(project, historyLimit);
  }

  get project() { return this.history.project; }
  get canUndo() { return this.history.canUndo; }
  get canRedo() { return this.history.canRedo; }
  get dirty() { return this.history.dirty; }
  get changes() { return this.history.changes; }

  subscribe(listener: () => void) { return this.history.subscribe(listener); }

  transact(label: string, update: (draft: EditorProject) => void) {
    const before = stableProjectJson(this.project);
    this.history.transact(validateLabel(label), update);
    if (stableProjectJson(this.project) !== before) this.revision += 1;
  }

  replace(project: EditorProject, label = "Open project") {
    this.history.replace(project, validateLabel(label));
    this.revision += 1;
  }

  undo() {
    const changed = this.history.undo();
    if (changed) this.revision += 1;
    return changed;
  }

  redo() {
    const changed = this.history.redo();
    if (changed) this.revision += 1;
    return changed;
  }

  markSaved() { this.history.markSaved(); }

  snapshot(): EditorCommandSnapshot {
    return {
      schema: "hyperfocus-editor-command-snapshot-v1",
      revision: this.revision,
      capturedAt: new Date().toISOString(),
      project: structuredClone(this.project),
      dirty: this.dirty,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      changes: structuredClone(this.changes),
    };
  }

  async execute(plan: EditorCommandPlan): Promise<EditorCommandHandoff> {
    validateCommandPlan(plan);
    const startedAt = new Date().toISOString();
    const results: EditorCommandHandoff["results"] = [];
    let error: string | undefined;
    for (const [index, command] of plan.commands.entries()) {
      try {
        const detail = await this.executeOne(command);
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
      snapshot: this.snapshot(),
      next: {
        verify: ["Confirm the returned canonical project snapshot and persistence evidence match the requested intent."],
        unresolved: error ? [error] : [],
      },
    };
  }

  private async executeOne(command: EditorCommand) {
    if (command.type === "project.patch") {
      if (!command.operations.length || command.operations.length > 1_000) throw new Error("project.patch requires from 1 through 1000 operations.");
      this.transact(command.label, (draft) => applyEditorPatch(draft, command.operations));
      return `Applied ${command.operations.length} validated project patch operation(s).`;
    }
    if (command.type === "project.replace") {
      this.replace(command.project, command.label ?? "Replace project");
      return "Replaced the project with a migrated, validated snapshot.";
    }
    if (command.type === "project.create-starter") {
      const starter = createEditorStarter(command.starter, command.name);
      if (starter.assets.length && !this.host) throw new Error("This command session has no binary asset host for the requested starter.");
      for (const asset of starter.assets) {
        const metadata = starter.project.assets.find((candidate) => candidate.id === asset.id);
        if (!metadata) throw new Error(`Starter binary ${asset.id} has no project asset record.`);
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        metadata.sha256 = await hashHyperfocusAsset(bytes);
        await this.host!.putAsset({ id: asset.id, name: metadata.name, mimeType: metadata.mimeType, bytes });
      }
      this.replace(starter.project, `Create ${command.starter} starter`);
      return `Created ${command.starter} starter ${starter.project.name}.`;
    }
    if (command.type === "asset.import") {
      if (!this.host) throw new Error("This command session has no binary asset host.");
      const bytes = decodeBase64(command.base64);
      if (bytes.byteLength > 256 * 1024 * 1024) throw new Error("Imported asset exceeds the 256 MiB per-file limit.");
      const asset: EditorAsset = {
        id: uniqueId("asset"),
        name: validateAssetName(command.name),
        kind: assetKind(command.mimeType, command.name),
        mimeType: validateMimeType(command.mimeType),
        size: bytes.byteLength,
        lastModified: Date.now(),
        source: "imported",
        sha256: await hashHyperfocusAsset(bytes),
      };
      await this.host.putAsset({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes });
      this.transact(`Import ${asset.name}`, (project) => { project.assets.push(asset); });
      return `Imported ${asset.name} as ${asset.id}.`;
    }
    if (command.type === "asset.remove") {
      const asset = this.project.assets.find((candidate) => candidate.id === command.assetId);
      if (!asset) throw new Error(`Asset does not exist: ${command.assetId}`);
      await this.host?.removeAsset(asset.id);
      this.transact(`Remove ${asset.name}`, (project) => { project.assets = project.assets.filter((candidate) => candidate.id !== asset.id); });
      return `Removed ${asset.name}.`;
    }
    if (command.type === "history.undo") {
      if (!this.undo()) throw new Error("There is no command to undo.");
      return "Undid the previous command.";
    }
    if (command.type === "history.redo") {
      if (!this.redo()) throw new Error("There is no command to redo.");
      return "Redid the previous command.";
    }
    if (command.type === "session.mark-saved") {
      this.markSaved();
      return "Marked the current project revision as saved.";
    }
    throw new Error(`Unknown editor command: ${String((command as { type?: unknown }).type)}`);
  }
}

export function validateCommandPlan(plan: EditorCommandPlan) {
  if (!plan || typeof plan !== "object") throw new Error("Command plan must be an object.");
  if (!plan.requestId?.trim() || plan.requestId.length > 200) throw new Error("Command plan requires a requestId of at most 200 characters.");
  if (!plan.intent?.trim() || plan.intent.length > 2_000) throw new Error("Command plan requires an intent of at most 2000 characters.");
  if (!Array.isArray(plan.commands) || plan.commands.length > 200) throw new Error("Command plan commands must be an array of at most 200 commands.");
  const commandTypes = new Set(["project.patch", "project.replace", "project.create-starter", "asset.import", "asset.remove", "history.undo", "history.redo", "session.mark-saved"]);
  for (const command of plan.commands) {
    if (!command || typeof command !== "object" || typeof command.type !== "string" || !commandTypes.has(command.type)) throw new Error(`Command plan contains an unknown command: ${String((command as { type?: unknown } | null)?.type)}`);
  }
}

export function applyEditorPatch(project: EditorProject, operations: readonly EditorPatchOperation[]) {
  for (const operation of operations) {
    const tokens = jsonPointerTokens(operation.path);
    if (!tokens.length) throw new Error("Project patch operations cannot replace or remove the document root.");
    const { parent, key } = resolvePatchParent(project as unknown as EditorJsonValue, tokens);
    if (operation.op === "test") {
      const current = readPatchValue(parent, key);
      if (JSON.stringify(current) !== JSON.stringify(operation.value)) throw new Error(`Project patch test failed at ${operation.path}.`);
      continue;
    }
    if (operation.op === "remove") {
      removePatchValue(parent, key, operation.path);
      continue;
    }
    writePatchValue(parent, key, structuredClone(operation.value), operation.op, operation.path);
  }
  return migrateProject(project);
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

function resolvePatchParent(root: EditorJsonValue, tokens: string[]) {
  let parent: EditorJsonValue = root;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[arrayIndex(token, parent.length, false)]!;
    else if (parent && typeof parent === "object" && token in parent) parent = parent[token]!;
    else throw new Error(`Project patch path does not exist: /${tokens.join("/")}`);
  }
  if (!parent || typeof parent !== "object") throw new Error(`Project patch parent is not a container: /${tokens.join("/")}`);
  return { parent, key: tokens.at(-1)! };
}

function readPatchValue(parent: EditorJsonValue[] | { [key: string]: EditorJsonValue }, key: string) {
  if (Array.isArray(parent)) return parent[arrayIndex(key, parent.length, false)];
  if (!(key in parent)) throw new Error(`Project patch path does not exist: ${key}`);
  return parent[key];
}

function writePatchValue(parent: EditorJsonValue[] | { [key: string]: EditorJsonValue }, key: string, value: EditorJsonValue, op: "add" | "replace", path: string) {
  if (Array.isArray(parent)) {
    if (op === "add" && key === "-") { parent.push(value); return; }
    const index = arrayIndex(key, parent.length, op === "add");
    if (op === "add") parent.splice(index, 0, value);
    else parent[index] = value;
    return;
  }
  if (op === "replace" && !(key in parent)) throw new Error(`Project patch replace path does not exist: ${path}`);
  parent[key] = value;
}

function removePatchValue(parent: EditorJsonValue[] | { [key: string]: EditorJsonValue }, key: string, path: string) {
  if (Array.isArray(parent)) { parent.splice(arrayIndex(key, parent.length, false), 1); return; }
  if (!(key in parent)) throw new Error(`Project patch remove path does not exist: ${path}`);
  delete parent[key];
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
  if (/json|text|csv/.test(mimeType)) return "data";
  return "unknown";
}

function decodeBase64(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Asset contents must be valid base64 without a data-URL prefix.");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
