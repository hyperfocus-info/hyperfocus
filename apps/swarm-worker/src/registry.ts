import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { executionResultSchema, executionWorkspaceSchema } from "@hyperfocus/ai-core/swarm";
import type { ExecutionResult, ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";
import { z } from "zod";

const sessionSchema = z.object({ taskId: z.string(), fingerprint: z.string(), sessionId: z.string(), result: executionResultSchema.optional() }).strict();
const registryEntry = z.object({ workspace: executionWorkspaceSchema, ready: z.boolean(), fingerprint: z.string(), sessions: sessionSchema.array().max(2000).default([]) }).strict();

/** One bridge replica owns this volume. The coordinator owns job state separately. */
export async function createWorkspaceRegistry(options: { file: string }) {
  let entries: Array<z.infer<typeof registryEntry>> = [];
  try { entries = registryEntry.array().parse(JSON.parse(await readFile(options.file, "utf8"))); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
  let pending = Promise.resolve();
  function persist() {
    const snapshot = JSON.stringify(entries);
    const operation = pending.then(async () => {
      await mkdir(dirname(options.file), { recursive: true });
      await writeFile(options.file + ".next", snapshot, { mode: 0o600 });
      await rename(options.file + ".next", options.file);
    });
    pending = operation.catch(() => undefined);
    return operation;
  }
  return {
    list: () => entries.map(entry => ({ ...entry.workspace })),
    ready: (id: string) => entries.find(entry => entry.workspace.id === id)?.ready ?? false,
    fingerprint: (id: string) => entries.find(entry => entry.workspace.id === id)?.fingerprint,
    get(id: string) {
      const found = entries.find(entry => entry.workspace.id === id);
      if (!found) throw new Error("Workspace is not owned by this bridge.");
      return { ...found.workspace };
    },
    async add(workspace: ExecutionWorkspace, fingerprint = "") { entries.push({ workspace: executionWorkspaceSchema.parse(workspace), fingerprint, ready: false, sessions: [] }); await persist(); },
    async markReady(id: string) { const entry = entries.find(entry => entry.workspace.id === id); if (!entry) throw new Error("Unknown workspace."); entry.ready = true; await persist(); },
    session(id: string, taskId: string) { return entries.find(entry => entry.workspace.id === id)?.sessions.find(session => session.taskId === taskId); },
    async recordSession(id: string, session: z.infer<typeof sessionSchema>) {
      const entry = entries.find(entry => entry.workspace.id === id); if (!entry) throw new Error("Unknown workspace.");
      if (entry.sessions.length >= 2000) throw new Error("Workspace command limit exhausted.");
      entry.sessions.push(sessionSchema.parse(session)); await persist();
    },
    async completeSession(id: string, taskId: string, result: ExecutionResult) {
      const session = entries.find(entry => entry.workspace.id === id)?.sessions.find(session => session.taskId === taskId);
      if (!session) throw new Error("Unknown command session."); session.result = executionResultSchema.parse(result); await persist();
    },
    async remove(id: string) { entries = entries.filter(entry => entry.workspace.id !== id); await persist(); },
  };
}
export type WorkspaceRegistry = Awaited<ReturnType<typeof createWorkspaceRegistry>>;
