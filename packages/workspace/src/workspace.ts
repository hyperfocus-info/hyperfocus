export type Workspace = {
  id: string;
  root: string;
  name: string;
};

export type FileEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  modifiedAt?: string;
};

export type WorkspaceFileSnapshot = {
  path: string;
  contents: string;
  revision: number;
};

export type WorkspaceFileChangeEvent = Readonly<
  | { type: "created" | "changed"; path: string; revision: number; sequence: number }
  | { type: "deleted"; path: string; revision: number; sequence: number }
  | { type: "invalidated"; reason: "overflow" | "external-change"; sequence: number; resnapshot: true }>;

/** @deprecated Use WorkspaceFileChangeEvent. */
export type FileChangeEvent = WorkspaceFileChangeEvent;

export type WorkspaceWriteRequest = {
  path: string;
  contents: string;
  /** Omit for an unconditional write; use zero to require that the file does not exist. */
  expectedRevision?: number;
};

export type WorkspaceWriteConflict = {
  path: string;
  expectedRevision: number;
  current: WorkspaceFileSnapshot | null;
};

export type WorkspaceWriteResult =
  | { status: "written"; snapshot: WorkspaceFileSnapshot }
  | { status: "conflict"; conflict: WorkspaceWriteConflict };

export type WorkspaceBatchWriteResult =
  | { status: "written"; snapshots: readonly WorkspaceFileSnapshot[] }
  | { status: "conflict"; conflicts: readonly WorkspaceWriteConflict[] };

export type WorkspaceDeleteResult =
  | { status: "deleted"; path: string; revision: number }
  | { status: "missing"; path: string }
  | { status: "conflict"; conflict: WorkspaceWriteConflict };

export type WorkspaceFileSystem = {
  readFile(options: { path: string }): Promise<WorkspaceFileSnapshot | undefined>;
  writeFile(options: WorkspaceWriteRequest): Promise<WorkspaceWriteResult>;
  writeFilesAtomic(options: { writes: readonly WorkspaceWriteRequest[] }): Promise<WorkspaceBatchWriteResult>;
  deleteFile(options: { path: string; expectedRevision?: number }): Promise<WorkspaceDeleteResult>;
  listFiles(options?: { path?: string }): Promise<readonly FileEntry[]>;
  watch(callback: (event: WorkspaceFileChangeEvent) => void): () => void;
};

export type WorkspaceCommand = {
  executable: string;
  args?: readonly string[];
  cwd?: string;
};

export type WorkspaceRun = {
  id: string;
  output: AsyncIterable<{ stream: "stdout" | "stderr"; text: string }>;
  completed: Promise<{ exitCode: number }>;
  stop(): Promise<void>;
};

export type WorkspaceProvider = {
  open(options: { root: string }): Promise<Workspace>;
  close(options: { id: string }): Promise<void>;
  filesystem(options: { workspaceId: string }): WorkspaceFileSystem;
  run(options: { workspaceId: string; command: WorkspaceCommand }): Promise<WorkspaceRun>;
};
