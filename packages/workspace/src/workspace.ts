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

export type FileChangeEvent = {
  type: "created" | "changed" | "deleted";
  path: string;
};

export type WorkspaceFileSystem = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  listFiles(path?: string): Promise<readonly FileEntry[]>;
  watch(callback: (event: FileChangeEvent) => void): () => void;
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
  open(root: string): Promise<Workspace>;
  close(id: string): Promise<void>;
  filesystem(workspaceId: string): WorkspaceFileSystem;
  run(workspaceId: string, command: WorkspaceCommand): Promise<WorkspaceRun>;
};

