import { join } from "node:path";
import { parseTcpPort, relativePathWithin } from "./server-utils.ts";

const root = import.meta.dir;
const hostname = process.env.ENGINE_EDITOR_HOST?.trim() || process.env.ENGINE_STUDIO_HOST?.trim() || "127.0.0.1";
const portText = process.env.ENGINE_EDITOR_PORT ?? process.env.ENGINE_STUDIO_PORT;
const port = parseTcpPort(portText, 8796, "ENGINE_EDITOR_PORT");

const routes: Readonly<Record<string, { path: string; type: string }>> = {
  "/": { path: join(root, "index.html"), type: "text/html; charset=utf-8" },
  "/index.html": { path: join(root, "index.html"), type: "text/html; charset=utf-8" },
  "/styles.css": { path: join(root, "styles.css"), type: "text/css; charset=utf-8" },
  "/dist/main.js": { path: join(root, "dist", "main.js"), type: "text/javascript; charset=utf-8" },
  "/dist/main.js.map": { path: join(root, "dist", "main.js.map"), type: "application/json; charset=utf-8" },
  "/dist/main.css": { path: join(root, "dist", "main.css"), type: "text/css; charset=utf-8" },
  "/wasm/collision-kernel.wasm": { path: join(root, "wasm", "collision-kernel.wasm"), type: "application/wasm" },
};

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ready: true, service: "engine-editor" }, { headers: { "Cache-Control": "no-store" } });
    }
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
  },
});

console.log(`Engine Editor: ${server.url}`);
