import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHyperfocusProjectFiles, type HyperfocusAssetInput } from "@hyperfocus/engine/project";
import { readHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";
import {
  createEditorCommandSession,
  type EditorCommandAsset,
  type EditorCommandHandoff,
  type EditorCommandPlan,
  type EditorCommandSnapshot,
  validateCommandPlan,
} from "./src/editor-command-session.ts";
import { migrateProject, stableProjectJson } from "@hyperfocus/engine/project";

export type HeadlessEditorSnapshot = EditorCommandSnapshot & {
  projectRoot: string;
  projectHash: string;
  persisted: true;
  assetTransfers?: HeadlessEditorAssetTransfer[];
};

export type HeadlessEditorAssetTransfer = {
  assetId: string;
  name: string;
  mimeType: string;
  size: number;
  base64: string;
};

export type HeadlessEditorHandoff = EditorCommandHandoff & {
  projectRoot: string;
  projectHash: string;
  persisted: boolean;
};

const MAX_BROWSER_HYDRATION_BYTES = 25165824;

export async function snapshotHeadlessEditorProject(projectRoot: string, options: { includeAssets?: boolean } = {}): Promise<HeadlessEditorSnapshot> {
  const opened = await openFileBackedSession(projectRoot);
  const snapshot = opened.session.snapshot();
  const base = { ...snapshot, projectRoot: opened.projectRoot, projectHash: await projectHash(snapshot.project), persisted: true as const };
  if (!options.includeAssets) return base;
  const assets = [...opened.assets.values()];
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes.byteLength, 0);
  if (totalBytes > MAX_BROWSER_HYDRATION_BYTES) {
    throw new Error(`Browser asset hydration exceeds the ${MAX_BROWSER_HYDRATION_BYTES / 1024 / 1024} MiB transfer limit.`);
  }
  return {
    ...base,
    assetTransfers: assets.map((asset) => ({
      assetId: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.bytes.byteLength,
      base64: Buffer.from(asset.bytes).toString("base64"),
    })),
  };
}

export async function runHeadlessEditorPlan(options: { projectRoot: string; plan: EditorCommandPlan; persist?: boolean }): Promise<HeadlessEditorHandoff> {
  const opened = await openFileBackedSession(options.projectRoot);
  const handoff = await opened.session.execute(options.plan);
  let snapshot = handoff.snapshot;
  const persist = options.persist !== false;
  if (handoff.ok && persist && handoff.completedCommands > 0) {
    try {
      const catalogIds = new Set(opened.session.project.assets.map((asset) => asset.id));
      const inputs: HyperfocusAssetInput[] = [...opened.assets.values()]
        .filter((asset) => catalogIds.has(asset.id))
        .map((asset) => ({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes: asset.bytes }));
      const files = await createHyperfocusProjectFiles(opened.session.project, inputs, { maxAssets: 5_000, maxUnpackedBytes: 1073741824 });
      await writeHyperfocusProjectPair(opened.projectRoot, files, { maxAssets: 5_000, maxUnpackedBytes: 1073741824 });
      const persisted = await openFileBackedSession(opened.projectRoot);
      snapshot = persisted.session.snapshot();
    } catch (cause) {
      const error = `Project persistence failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      return {
        ...handoff,
        ok: false,
        error,
        snapshot,
        next: { ...handoff.next, unresolved: [...handoff.next.unresolved, error] },
        projectRoot: opened.projectRoot,
        projectHash: await projectHash(snapshot.project),
        persisted: false,
      };
    }
  }
  return {
    ...handoff,
    snapshot,
    projectRoot: opened.projectRoot,
    projectHash: await projectHash(snapshot.project),
    persisted: handoff.ok && persist,
  };
}

export async function readEditorCommandPlan(path: string): Promise<EditorCommandPlan> {
  const text = path === "-" ? await new Response(Bun.stdin.stream()).text() : await readFile(path, "utf8");
  const plan: unknown = JSON.parse(text);
  validateCommandPlan(plan);
  return plan;
}

async function openFileBackedSession(projectRoot: string) {
  const root = resolve(projectRoot);
  const opened = await readHyperfocusProjectPair(root, { maxArchiveBytes: 1073741824, maxAssets: 5_000, maxUnpackedBytes: 1073741824 });
  const assets = new Map<string, EditorCommandAsset>(opened.assets.map((asset) => [asset.id, { id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes: new Uint8Array(asset.bytes) }]));
  const session = createEditorCommandSession(migrateProject(opened.project), {
    async putAsset(asset) { assets.set(asset.id, { ...asset, bytes: new Uint8Array(asset.bytes) }); },
    async removeAsset(assetId) { assets.delete(assetId); },
  });
  return { projectRoot: root, session, assets };
}

async function projectHash(project: unknown) {
  const bytes = new TextEncoder().encode(stableProjectJson(migrateProject(project)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}
