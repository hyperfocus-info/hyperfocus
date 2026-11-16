import { z } from "zod";

export const swarmRevisionSchema = z.string().regex(/^[a-f0-9]{40,64}$/);
export const workspaceSourceSchema = z.object({
  revision: swarmRevisionSchema,
  repositoryUrl: z.string().url().max(2048).optional(),
  bundle: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytesBase64: z.string().max(360_000_000) }).optional(),
}).strict().refine((source) => Number(!!source.repositoryUrl) + Number(!!source.bundle) === 1, "Provide one repository URL or immutable Git bundle.");
export const workspaceResourcesSchema = z.object({ cpu: z.number().positive().max(8), memoryGB: z.number().positive().max(8) }).strict();
export const workspaceSpecSchema = z.object({
  swarmId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  taskId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  source: workspaceSourceSchema,
  resources: workspaceResourcesSchema.default({ cpu: 2, memoryGB: 2 }),
  lane: z.enum(["investigation", "benchmark"]).default("investigation"),
  preparation: z.object({ command: z.string().min(1).max(64_000), timeoutMs: z.number().int().min(1000).max(900_000) }).strict().optional(),
  checkpoint: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
}).strict();
export const executionWorkspaceSchema = z.object({
  id: z.string().min(1).max(200), provider: z.enum(["railway", "local"]),
  swarmId: z.string(), taskId: z.string(), sourceRevision: swarmRevisionSchema,
  root: z.string(), resources: workspaceResourcesSchema, lane: z.enum(["investigation", "benchmark"]),
  createdAt: z.string(),
}).strict();
export const executionTaskSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), command: z.string().min(1).max(64_000),
  cwd: z.string().max(1024).optional(), timeoutMs: z.number().int().min(100).max(3_600_000),
  environment: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(8192)).optional(),
  sessionId: z.string().max(200).optional(),
}).strict();
export const executionResultSchema = z.object({
  exitCode: z.number().int().nullable(), stdout: z.string(), stderr: z.string(),
  timedOut: z.boolean(), truncated: z.boolean(), durationMs: z.number().nonnegative(), sessionId: z.string().optional(),
}).strict();
export type WorkspaceSource = z.infer<typeof workspaceSourceSchema>;
export type WorkspaceSpec = z.infer<typeof workspaceSpecSchema>;
export type ExecutionWorkspace = z.infer<typeof executionWorkspaceSchema>;
export type ExecutionTask = z.infer<typeof executionTaskSchema>;
export type ExecutionResult = z.infer<typeof executionResultSchema>;
export type ExecutionOutput = { stream: "stdout" | "stderr"; text: string };
export type CapturedArtifact = { name: string; mediaType: string; sha256: string; bytes: Uint8Array };
/** Privileged hosts implement this; portable consumers never receive cloud credentials. */
export interface ExecutionProvider {
  readonly kind: "railway" | "local";
  createWorkspace(options: WorkspaceSpec & { signal?: AbortSignal }): Promise<ExecutionWorkspace>;
  forkWorkspace(options: { workspace: ExecutionWorkspace; taskId: string; signal?: AbortSignal }): Promise<ExecutionWorkspace>;
  execute(options: { workspace: ExecutionWorkspace; task: ExecutionTask; signal?: AbortSignal; onOutput?: (output: ExecutionOutput) => void; onSession?: (sessionId: string) => void }): Promise<ExecutionResult>;
  captureArtifacts(options: { workspace: ExecutionWorkspace; paths?: string[]; signal?: AbortSignal }): Promise<CapturedArtifact[]>;
  destroyWorkspace(options: { workspaceId: string }): Promise<void>;
  listWorkspaces(): Promise<ExecutionWorkspace[]>;
  checkpointWorkspace?(options: { workspaceId: string }): Promise<{ checkpoint: string }>;
  heartbeatWorkspace?(options: { workspaceId: string }): Promise<void>;
}
