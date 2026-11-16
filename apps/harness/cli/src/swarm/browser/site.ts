import { resolve } from "node:path";

/** Serve only the bounded public entry, never the privileged Harness application. */
export function createSwarmSiteHandler(options: { handler: (request: Request) => Promise<Response>; directory: string; publicOrigin: string }) {
  const origin = new URL(options.publicOrigin);
  const files = new Map([["/swarm", "index.html"], ["/swarm/", "index.html"], ["/swarm-assets/main.js", "main.js"], ["/swarm-assets/main.css", "main.css"]]);
  return async (request: Request) => {
    files.set("/connections","index.html");files.set("/connections/","index.html");
    const url = new URL(request.url), filename = files.get(url.pathname);
    if (!filename) return options.handler(request);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    if (url.host !== origin.host) return new Response("Host is not authorized", { status: 403 });
    const file = Bun.file(resolve(options.directory, filename));
    if (!await file.exists()) return new Response("Public swarm page is unavailable; rebuild its static entry.", { status: 503 });
    return new Response(request.method === "HEAD" ? null : file, { headers: {
      "content-type": filename.endsWith(".html") ? "text/html; charset=utf-8" : filename.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
    } });
  };
}
