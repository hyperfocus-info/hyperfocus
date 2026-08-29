import { join } from "node:path";
import { parseTcpPort, relativePathWithin } from "./server-utils.ts";
import { handleEditorAgentApi } from "./editor-agent-api.ts";
import { handleEditorSourceApi } from "./source-compiler-api.ts";

const root = import.meta.dir;

const routes: Readonly<Record<string, { path: string; type: string }>> = {
  "/": { path: join(root, "index.html"), type: "text/html; charset=utf-8" },
  "/index.html": { path: join(root, "index.html"), type: "text/html; charset=utf-8" },
  "/styles.css": { path: join(root, "styles.css"), type: "text/css; charset=utf-8" },
  "/dist/main.js": { path: join(root, "dist", "main.js"), type: "text/javascript; charset=utf-8" },
  "/dist/main.js.map": { path: join(root, "dist", "main.js.map"), type: "application/json; charset=utf-8" },
  "/dist/main.css": { path: join(root, "dist", "main.css"), type: "text/css; charset=utf-8" },
  "/wasm/collision-kernel.wasm": { path: join(root, "wasm", "collision-kernel.wasm"), type: "application/wasm" },
};

export function createEditorRequestHandler(agentApiEnabled = true) {
  return async function fetchEditor(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ready: true, service: "engine-editor", agentApi: "/api/agent/v1", sourceApi: agentApiEnabled ? "/api/source/v1/compile" : null }, { headers: { "Cache-Control": "no-store" } });
    }
    const apiResponse = await handleEditorAgentApi(request, agentApiEnabled);
    if (apiResponse) return apiResponse;
    const sourceResponse = await handleEditorSourceApi(request, agentApiEnabled);
    if (sourceResponse) return sourceResponse;
    const route = routes[url.pathname];
    if (!route || relativePathWithin(root, route.path) === null) return new Response("Not found", { status: 404 });
    const file = Bun.file(route.path);
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": route.type,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}

export function startEditorServer() {
  const hostname = process.env.ENGINE_EDITOR_HOST?.trim() || process.env.ENGINE_STUDIO_HOST?.trim() || "127.0.0.1";
  const portText = process.env.ENGINE_EDITOR_PORT ?? process.env.ENGINE_STUDIO_PORT;
  const port = parseTcpPort(portText, 8796, "ENGINE_EDITOR_PORT");
  const agentApiEnabled = ["127.0.0.1", "localhost", "::1"].includes(hostname.toLowerCase());
  const server = Bun.serve({ hostname, port, fetch: createEditorRequestHandler(agentApiEnabled) });
  console.log(`Engine Editor: ${server.url}`);
  console.log(agentApiEnabled ? `Editor Agent API: ${new URL("/api/agent/v1/", server.url)}` : "Editor Agent API: disabled for non-loopback binding");
  return server;
}

if (import.meta.main) startEditorServer();
