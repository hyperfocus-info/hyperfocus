import { createHash } from "node:crypto";
import { z } from "zod";
import { executionResultSchema, executionWorkspaceSchema, workspaceSpecSchema } from "@hyperfocus/ai-core/swarm";
import type { CapturedArtifact, ExecutionProvider, ExecutionResult } from "@hyperfocus/ai-core/swarm";

const capturedArtifactsSchema = z.array(z.object({
  name: z.string().min(1).max(1024).regex(/^[^\x00-\x1f]+$/),
  mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytesBase64: z.string().max(90_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0),
}).strict()).max(100);

/** Only the trusted coordinator knows this bearer. The bridge alone knows Railway credentials. */
export function createRailwayExecutionProvider(options: { url: string; token: string; fetch?: typeof fetch }): ExecutionProvider {
  const url = new URL(options.url), request = options.fetch ?? fetch;
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid Railway bridge protocol.");
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.hostname.endsWith(".railway.internal")) throw new Error("Railway bridge requires HTTPS or a trusted private endpoint.");
  if (url.username || url.password || url.search || url.hash || options.token.length < 32) throw new Error("Invalid Railway bridge configuration.");
  const headers = { authorization: `Bearer ${options.token}`, "content-type": "application/json" };
  async function call(path: string, body: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const response = await request(new URL(`/v1/${path}`, url), { method: "POST", headers, body: JSON.stringify(body), signal, redirect: "error" });
    if (!response.ok) {
      const detail = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null));
      throw new Error(detail.success ? detail.data.error.slice(0, 1000) : `Railway execution bridge failed (${response.status}).`);
    }
    return response;
  }
  return {
    kind: "railway",
    async createWorkspace({ signal, ...spec }) {
      return executionWorkspaceSchema.parse(await (await call("create", workspaceSpecSchema.parse(spec), signal)).json());
    },
    async forkWorkspace({ workspace, taskId, signal }) {
      return executionWorkspaceSchema.parse(await (await call("fork", { workspaceId: workspace.id, taskId }, signal)).json());
    },
    async execute({ workspace, task, signal, onOutput, onSession }) {
      const response = await call("execute", { workspaceId: workspace.id, task }, signal);
      if (!response.body) throw new Error("Railway execution bridge returned no stream.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = "", result: ExecutionResult | undefined;
      function accept(line: string) {
        const event = JSON.parse(line);
        if (event.type === "output" && ["stdout", "stderr"].includes(event.stream) && typeof event.text === "string") onOutput?.({ stream: event.stream, text: event.text });
        else if (event.type === "session" && typeof event.sessionId === "string") onSession?.(event.sessionId);
        else if (event.type === "result") result = executionResultSchema.parse(event.result);
        else if (event.type === "error") throw new Error(typeof event.error === "string" ? event.error : "Remote execution failed.");
        else throw new Error("Invalid Railway execution event.");
      }
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          pending += decoder.decode(next.value, { stream: true });
          if (pending.length > 4_194_304) throw new Error("Railway stream frame exceeds its byte limit.");
          let end: number;
          while ((end = pending.indexOf("\n")) >= 0) { const line = pending.slice(0, end); pending = pending.slice(end + 1); if (line) accept(line); }
        }
        pending += decoder.decode();
        if (pending.trim()) accept(pending);
        if (!result) throw new Error("Remote execution interrupted before a confirmed result; reconnect using the durable session.");
        return result;
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    },
    async captureArtifacts({ workspace, paths, signal }) {
      const items = capturedArtifactsSchema.parse(await (await call("artifacts", { workspaceId: workspace.id, paths: paths ?? [] }, signal)).json());
      return items.map((item): CapturedArtifact => {
        const bytes = new Uint8Array(Buffer.from(item.bytesBase64, "base64"));
        if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Captured artifact hash mismatch.");
        return { name: item.name, mediaType: item.mediaType, sha256: item.sha256, bytes };
      });
    },
    async destroyWorkspace({ workspaceId }) { await call("destroy", { workspaceId }); },
    async heartbeatWorkspace({ workspaceId }) { await call("heartbeat", { workspaceId }); },
    async checkpointWorkspace({ workspaceId }) {
      const value = z.object({ checkpoint: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict().parse(await (await call("checkpoint", { workspaceId })).json());
      return { checkpoint: value.checkpoint };
    },
    async listWorkspaces() {
      const items = await (await call("list", {})).json();
      return executionWorkspaceSchema.array().parse(items);
    },
  };
}
