import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { createRailwayWorkerService } from "./service";

async function body(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 360_000_000) throw new Error("Execution request exceeds its byte limit.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function authorized(actual: string | undefined, expected: string) {
  const a = Buffer.from(actual ?? ""), b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
function publicError(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : "Remote execution failed.";
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[redacted]");
  return message.replace(/(Bearer\s+|(?:token|api_key|password|secret)=)[^\s&"']+/gi, "$1[redacted]").slice(0, 2000);
}
export function createWorkerHttpHandler(options: { service: ReturnType<typeof createRailwayWorkerService>; token: string; secrets?: string[]; cleanupDeployment?: () => Promise<unknown>; budget?: () => unknown }) {
  if (options.token.length < 32) throw new Error("Bridge authentication requires a token of at least 32 characters.");
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    if (request.url === "/health" && request.method === "GET") {
      response.setHeader("content-type", "application/json"); response.end('{"status":"ready"}'); return;
    }
    if (request.headers.origin || !authorized(request.headers.authorization, options.token)) { response.writeHead(401); response.end(); return; }
    if (request.method !== "POST" || request.headers["content-type"] !== "application/json") { response.writeHead(415); response.end(); return; }
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("Coordinator connection closed."));
    request.once("aborted", cancel);
    response.once("close", cancel);
    try {
      const data = await body(request);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid request object.");
      const id = data.workspaceId;
      if (!["/v1/create", "/v1/list", "/v1/cleanup", "/v1/admin/cleanup", "/v1/admin/budget"].includes(request.url ?? "") && (typeof id !== "string" || id.length > 200)) throw new Error("Invalid workspace id.");
      const service = options.service;
      let result: unknown;
      switch (request.url) {
        case "/v1/create": result = await service.create(data, controller.signal); break;
        case "/v1/fork": result = await service.fork(id, data.taskId, controller.signal); break;
        case "/v1/list": result = service.list(); break;
        case "/v1/destroy": await service.destroy(id); result = { destroyed: true }; break;
        case "/v1/checkpoint": result = await service.checkpoint(id); break;
        case "/v1/heartbeat": await service.heartbeat(id); result = { renewed: true }; break;
        case "/v1/cleanup": result = await service.reapExpired(3_600_000); break;
        case "/v1/admin/budget": result = options.budget?.() ?? null; break;
        case "/v1/admin/cleanup": {
          if (!options.cleanupDeployment) throw new Error("Temporary deployment cleanup is not configured.");
          result = await options.cleanupDeployment(); break;
        }
        case "/v1/artifacts": {
          if (!Array.isArray(data.paths) || data.paths.some((path: unknown) => typeof path !== "string")) throw new Error("Invalid artifact paths.");
          result = await service.artifacts(id, data.paths, controller.signal); break;
        }
        case "/v1/execute": {
          await service.execute(id, data.task, controller.signal, (event) => {
            if (!response.headersSent) response.setHeader("content-type", "application/x-ndjson");
            if (response.writableLength > 4_194_304) { controller.abort(new Error("Coordinator output stream exceeded backpressure limit.")); return; }
            response.write(JSON.stringify(event) + "\n");
          });
          response.end(); return;
        }
        default: response.writeHead(404); response.end(); return;
      }
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify(result));
    } catch (error) {
      if (response.destroyed) return;
      const message = publicError(error, [options.token, ...(options.secrets ?? [])]);
      if (response.headersSent) response.end(JSON.stringify({ type: "error", error: message }) + "\n");
      else { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: message })); }
    } finally { request.off("aborted", cancel); response.off("close", cancel); }
  };
}
