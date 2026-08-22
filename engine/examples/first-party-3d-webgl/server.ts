import { resolve } from "node:path";

const port = Number(Bun.env.PORT ?? 8796);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new RangeError("PORT must be an integer from 1 through 65535.");
const build = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "main.ts")],
  format: "esm",
  minify: false,
  sourcemap: "inline",
  target: "browser"
});
if (!build.success || !build.outputs[0]) {
  throw new Error(`Unable to build first-party 3D acceptance fixture:\n${build.logs.map((log) => log.message).join("\n")}`);
}
const client = await build.outputs[0].text();
const html = Bun.file(resolve(import.meta.dir, "index.html"));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/index.html") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "/client.js") return new Response(client, { headers: { "content-type": "text/javascript; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  }
});
console.log(`First-party WebGL2 acceptance fixture: ${server.url}`);
