import { runHeadlessEditorPlan, snapshotHeadlessEditorProject } from "./headless-editor.ts";
import type { EditorCommandPlan } from "./src/editor-command-session.ts";
import { resolve } from "node:path";

const MAX_AGENT_BODY_BYTES = 32 * 1024 * 1024;
const projectQueues = new Map<string, Promise<void>>();

export async function handleEditorAgentApi(request: Request, enabled = true): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/agent/v1/")) return undefined;
  if (!enabled) return json({ error: "Editor agent API is available only when the editor server binds to loopback." }, 403);
  if (!isAllowedEditorAgentOrigin(request)) return json({ error: "Editor agent API rejects cross-origin browser requests." }, 403);

  try {
    if (request.method === "GET" && url.pathname === "/api/agent/v1/project") {
      const projectRoot = url.searchParams.get("root");
      if (!projectRoot) return json({ error: "Query parameter root is required." }, 400);
      return json(await enqueue(projectRoot, () => snapshotHeadlessEditorProject(projectRoot)));
    }
    if (request.method === "POST" && url.pathname === "/api/agent/v1/commands") {
      const payload = await readJsonBody(request) as { projectRoot?: unknown; plan?: unknown; persist?: unknown };
      if (typeof payload.projectRoot !== "string" || !payload.projectRoot.trim()) return json({ error: "projectRoot is required." }, 400);
      if (!payload.plan || typeof payload.plan !== "object") return json({ error: "plan is required." }, 400);
      if (payload.persist !== undefined && typeof payload.persist !== "boolean") return json({ error: "persist must be a boolean." }, 400);
      const result = await enqueue(payload.projectRoot, () => runHeadlessEditorPlan({ projectRoot: payload.projectRoot as string, plan: payload.plan as EditorCommandPlan, persist: payload.persist as boolean | undefined }));
      return json(result, result.ok ? 200 : 422);
    }
    return json({ error: "Editor agent API route not found." }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

async function readJsonBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_AGENT_BODY_BYTES) throw new Error("Editor agent API request exceeds 32 MiB.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_AGENT_BODY_BYTES) throw new Error("Editor agent API request exceeds 32 MiB.");
  try { return JSON.parse(text) as unknown; }
  catch { throw new Error("Editor agent API request body must be valid JSON."); }
}

export function isAllowedEditorAgentOrigin(request: Pick<Request, "headers" | "url">) {
  const url = new URL(request.url);
  if (!isLoopbackHostname(url.hostname)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin === null || origin === url.origin;
}

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function enqueue<T>(projectRoot: string, task: () => Promise<T>) {
  const key = resolve(projectRoot).toLocaleLowerCase();
  const previous = projectQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  projectQueues.set(key, queued);
  return previous.then(task).finally(() => {
    release();
    if (projectQueues.get(key) === queued) projectQueues.delete(key);
  });
}
