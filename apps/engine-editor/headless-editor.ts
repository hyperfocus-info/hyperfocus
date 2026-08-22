import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHyperfocusProjectFiles, type HyperfocusAssetInput } from "@hyperfocus/engine/project";
import { readHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";
import {
  EditorCommandSession,
  type EditorCommandAsset,
  type EditorCommandHandoff,
  type EditorCommandPlan,
  type EditorCommandSnapshot,
} from "./src/editor-command-session.ts";
import { migrateProject, stableProjectJson } from "./src/project.ts";

export type HeadlessEditorSnapshot = EditorCommandSnapshot & {
  projectRoot: string;
  projectHash: string;
  persisted: true;
};

export type HeadlessEditorHandoff = EditorCommandHandoff & {
  projectRoot: string;
  projectHash: string;
  persisted: boolean;
};

export async function snapshotHeadlessEditorProject(projectRoot: string): Promise<HeadlessEditorSnapshot> {
  const opened = await openFileBackedSession(projectRoot);
  const snapshot = opened.session.snapshot();
  return { ...snapshot, projectRoot: opened.projectRoot, projectHash: await projectHash(snapshot.project), persisted: true };
}

export async function runHeadlessEditorPlan(options: { projectRoot: string; plan: EditorCommandPlan; persist?: boolean }): Promise<HeadlessEditorHandoff> {
  const opened = await openFileBackedSession(options.projectRoot);
  const handoff = await opened.session.execute(options.plan);
  let snapshot = handoff.snapshot;
  const persist = options.persist !== false;
  if (handoff.ok && persist && handoff.completedCommands > 0) {
    try {
      const inputs: HyperfocusAssetInput[] = [...opened.assets.values()].map((asset) => ({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes: asset.bytes }));
      const files = await createHyperfocusProjectFiles(opened.session.project, inputs, { maxAssets: 5_000, maxUnpackedBytes: 1024 * 1024 * 1024 });
      await writeHyperfocusProjectPair(opened.projectRoot, files, { maxAssets: 5_000, maxUnpackedBytes: 1024 * 1024 * 1024 });
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
  return JSON.parse(text) as EditorCommandPlan;
}

async function openFileBackedSession(projectRoot: string) {
  const root = resolve(projectRoot);
  const opened = await readHyperfocusProjectPair<unknown>(root, { maxArchiveBytes: 1024 * 1024 * 1024, maxAssets: 5_000, maxUnpackedBytes: 1024 * 1024 * 1024 });
  const assets = new Map<string, EditorCommandAsset>(opened.assets.map((asset) => [asset.id, { id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes: new Uint8Array(asset.bytes) }]));
  const session = new EditorCommandSession(migrateProject(opened.project), {
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
