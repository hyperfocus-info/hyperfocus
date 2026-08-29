import { normalizeWorkspacePath } from "./path-policy";
import type {
  FileEntry,
  WorkspaceBatchWriteResult,
  WorkspaceDeleteResult,
  WorkspaceFileChangeEvent,
  WorkspaceFileSnapshot,
  WorkspaceFileSystem,
  WorkspaceWriteConflict,
  WorkspaceWriteRequest,
  WorkspaceWriteResult
} from "./workspace";

export type MemoryWorkspaceFileSystem = WorkspaceFileSystem & {
  /** Signals that a host-side change made incremental watch delivery unsafe. */
  $invalidate(options: { reason: "overflow" | "external-change" }): void;
};

export type MemoryWorkspaceFileSystemOptions = {
  initialFiles?: Readonly<Record<string, string>>;
};

type UnsequencedWorkspaceEvent =
  | { type: "created" | "changed"; path: string; revision: number }
  | { type: "deleted"; path: string; revision: number }
  | { type: "invalidated"; reason: "overflow" | "external-change"; resnapshot: true };

/** Creates a deterministic CAS-capable adapter for tests, local tools, and examples. */
export function createMemoryWorkspaceFileSystem(options: MemoryWorkspaceFileSystemOptions = {}): MemoryWorkspaceFileSystem {
  const files = new Map<string, WorkspaceFileSnapshot>();
  const latestRevisions = new Map<string, number>();
  const listeners = new Set<(event: WorkspaceFileChangeEvent) => void>();
  let sequence = 0;

  for (const [inputPath, contents] of Object.entries(options.initialFiles ?? {})) {
    const path = requireFilePath(inputPath);
    if (files.has(path)) throw new Error(`Initial workspace files contain duplicate normalized path: ${path}`);
    const snapshot = { path, contents, revision: 1 };
    files.set(path, snapshot);
    latestRevisions.set(path, 1);
  }

  const emit = (event: UnsequencedWorkspaceEvent) => {
    const nextSequence = ++sequence;
    const sequenced: WorkspaceFileChangeEvent = event.type === "invalidated"
      ? { ...event, sequence: nextSequence }
      : { ...event, sequence: nextSequence };
    for (const listener of listeners) {
      try { listener(sequenced); }
      catch { /* Watch consumers are isolated from committed filesystem state. */ }
    }
  };

  const writeFilesAtomic = async ({ writes }: { writes: readonly WorkspaceWriteRequest[] }): Promise<WorkspaceBatchWriteResult> => {
    const normalizedWrites = writes.map((write) => ({ ...write, path: requireFilePath(write.path) }));
    const uniquePaths = new Set<string>();
    for (const write of normalizedWrites) {
      if (uniquePaths.has(write.path)) throw new Error(`Atomic writes must contain unique paths: ${write.path}`);
      uniquePaths.add(write.path);
      validateExpectedRevision(write.expectedRevision);
    }
    const conflicts = normalizedWrites.flatMap((write) => {
      const conflict = findConflict(write, files.get(write.path));
      return conflict ? [conflict] : [];
    });
    if (conflicts.length > 0) return { status: "conflict", conflicts };

    const changes: Array<{ type: "created" | "changed"; snapshot: WorkspaceFileSnapshot }> = [];
    for (const write of normalizedWrites) {
      const current = files.get(write.path);
      const snapshot = {
        path: write.path,
        contents: write.contents,
        revision: (latestRevisions.get(write.path) ?? 0) + 1
      };
      files.set(write.path, snapshot);
      latestRevisions.set(write.path, snapshot.revision);
      changes.push({ type: current ? "changed" : "created", snapshot: copySnapshot(snapshot) });
    }
    for (const change of changes) emit({ type: change.type, path: change.snapshot.path, revision: change.snapshot.revision });
    return { status: "written", snapshots: changes.map((change) => change.snapshot) };
  };

  return {
    async readFile({ path: inputPath }) {
      const snapshot = files.get(requireFilePath(inputPath));
      return snapshot ? copySnapshot(snapshot) : undefined;
    },
    async writeFile(write): Promise<WorkspaceWriteResult> {
      const result = await writeFilesAtomic({ writes: [write] });
      if (result.status === "conflict") return { status: "conflict", conflict: result.conflicts[0]! };
      return { status: "written", snapshot: result.snapshots[0]! };
    },
    writeFilesAtomic,
    async deleteFile({ path: inputPath, expectedRevision }): Promise<WorkspaceDeleteResult> {
      const path = requireFilePath(inputPath);
      validateExpectedRevision(expectedRevision);
      const current = files.get(path);
      const conflict = findConflict({ path, contents: "", expectedRevision }, current);
      if (conflict) return { status: "conflict", conflict };
      if (!current) return { status: "missing", path };
      const revision = current.revision + 1;
      files.delete(path);
      latestRevisions.set(path, revision);
      emit({ type: "deleted", path, revision });
      return { status: "deleted", path, revision };
    },
    async listFiles(options = {}) {
      return listDirectory(files, normalizeWorkspacePath(options.path ?? ""));
    },
    watch(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    $invalidate({ reason }) {
      emit({ type: "invalidated", reason, resnapshot: true });
    }
  };
}

function findConflict(write: WorkspaceWriteRequest, current: WorkspaceFileSnapshot | undefined): WorkspaceWriteConflict | undefined {
  if (write.expectedRevision === undefined) return undefined;
  const actualRevision = current?.revision ?? 0;
  if (write.expectedRevision === actualRevision) return undefined;
  return {
    path: write.path,
    expectedRevision: write.expectedRevision,
    current: current ? copySnapshot(current) : null
  };
}

function listDirectory(files: ReadonlyMap<string, WorkspaceFileSnapshot>, directory: string): FileEntry[] {
  const prefix = directory ? `${directory}/` : "";
  const entries = new Map<string, FileEntry>();
  for (const snapshot of files.values()) {
    if (!snapshot.path.startsWith(prefix)) continue;
    const remainder = snapshot.path.slice(prefix.length);
    if (!remainder) continue;
    const slash = remainder.indexOf("/");
    const name = slash < 0 ? remainder : remainder.slice(0, slash);
    const path = prefix + name;
    if (slash >= 0) entries.set(path, { path, name, kind: "directory" });
    else if (!entries.has(path)) entries.set(path, { path, name, kind: "file", size: new TextEncoder().encode(snapshot.contents).byteLength });
  }
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function requireFilePath(input: string) {
  const path = normalizeWorkspacePath(input);
  if (!path) throw new Error("Workspace file paths cannot be empty");
  return path;
}

function validateExpectedRevision(revision: number | undefined) {
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) {
    throw new Error("expectedRevision must be a non-negative safe integer");
  }
}

function copySnapshot(snapshot: WorkspaceFileSnapshot): WorkspaceFileSnapshot {
  return { ...snapshot };
}
