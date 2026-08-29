import { join } from "node:path";
import { parseTcpPort, relativePathWithin } from "@hyperfocus/engine/tooling/server";

const root = import.meta.dir;
const hostname = process.env.MOTION_LAB_HOST?.trim() || "127.0.0.1";
const port = parseTcpPort(process.env.MOTION_LAB_PORT, 8795, "MOTION_LAB_PORT");

const staticRoutes: Readonly<Record<string, { cache: string; contentType: string; relativePath: string }>> = {
  "/": { cache: "no-store", contentType: "text/html; charset=utf-8", relativePath: "index.html" },
  "/index.html": { cache: "no-store", contentType: "text/html; charset=utf-8", relativePath: "index.html" },
  "/styles.css": { cache: "no-store", contentType: "text/css; charset=utf-8", relativePath: "styles.css" },
  "/dist/client.js": { cache: "no-store", contentType: "text/javascript; charset=utf-8", relativePath: "dist/client.js" },
  "/dist/client.js.map": { cache: "no-store", contentType: "application/json; charset=utf-8", relativePath: "dist/client.js.map" },
  "/assets/manifest.json": { cache: "no-store", contentType: "application/json; charset=utf-8", relativePath: "assets/manifest.json" },
};

function safeFixturePath(pathname: string): string | null {
  if (!pathname.startsWith("/assets/fixtures/") || !pathname.endsWith(".glb")) return null;
  const target = join(root, pathname.slice(1));
  const relativePath = relativePathWithin(root, target);
  if (!relativePath || !relativePath.startsWith("assets/fixtures/")) return null;
  return target;
}

async function serveFile(path: string, contentType: string, cache: string): Promise<Response> {
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: {
      "Cache-Control": cache,
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ready: true, service: "motion-lab" }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const staticRoute = staticRoutes[pathname];
    if (staticRoute) {
      return await serveFile(join(root, staticRoute.relativePath), staticRoute.contentType, staticRoute.cache);
    }
    const fixturePath = safeFixturePath(pathname);
    if (fixturePath) return await serveFile(fixturePath, "model/gltf-binary", "public, max-age=31536000, immutable");
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Motion laboratory: ${server.url}`);
