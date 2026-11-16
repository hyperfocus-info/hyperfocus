import path from "node:path";
import { artifactManifestSchema, validateArtifactReview } from "./schema";
import { openArtifactReviews, resolveArtifactReviewDatabase } from "./persistence";
import { mediaResponse } from "./media-response";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function createArtifactReviewHandler(options: {
  manifestPath: string; databasePath?: string; publicDirectory: string; basePath?: string;
}) {
  const manifestPath = path.resolve(options.manifestPath);
  const manifest = artifactManifestSchema.parse(await Bun.file(manifestPath).json());
  const databasePath = await resolveArtifactReviewDatabase({ manifestPath, databasePath: options.databasePath });
  const reviews = await openArtifactReviews({ databasePath, manifestPath, manifest });
  try {
    const directory = options.publicDirectory;
    const items = new Map(manifest.items.map(item => [item.id, item]));
    const base = options.basePath ?? '';
    const clientManifest = { ...manifest, items: manifest.items.map(item => ({ ...item, media: item.media ? base + "/media/" + encodeURIComponent(item.id) + "?version=" + encodeURIComponent(String(item.version)) : undefined })) };
    const shipped = Bun.file(path.join(directory, 'review.js'));
    let script: string;
    if (await shipped.exists()) script = await shipped.text();
    else {
      const build = await Bun.build({ entrypoints: [path.join(directory, "review.ts")], target: "browser", minify: false });
      if (!build.success || !build.outputs[0]) throw new Error("Review UI build failed: " + build.logs.join("\n"));
      script = await build.outputs[0].text();
    }
    const fetch = async (request: Request) => {
        const url = new URL(request.url);
        if (!url.pathname.startsWith(base + '/')) return new Response('Not found', { status: 404 });
        url.pathname = url.pathname.slice(base.length);
        if (request.method === "PUT") {
          if (request.headers.get("Origin") !== url.origin) return json({ error: "Same-origin requests required" }, 403);
          if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
          const id = url.pathname.slice("/api/feedback/".length);
          const item = url.pathname.startsWith("/api/feedback/") ? items.get(id) : undefined;
          if (!item) return json({ error: "Unknown item" }, 404);
          try {
            const body = await request.json();
            if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 0) return json({ error: "Invalid revision" }, 400);
            const review = validateArtifactReview({ item, review: body.review });
            const result = reviews.save(id, item.version, body.expectedRevision, review);
            return result.status === "conflict" ? json({ error: "Feedback changed on another device" }, 409) : json(reviews.read(id, item.version));
          } catch { return json({ error: "Invalid review identity, sections, scores or ranges" }, 400); }
        }
        if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
        if (url.pathname === "/healthz") return json({ ok: true, campaign: manifest.id });
        if (url.pathname === "/api/manifest") return json(clientManifest);
        if (url.pathname === "/api/feedback") return json({ items: Object.fromEntries(manifest.items.map(item => [item.id, reviews.read(item.id, item.version)])) });
        if (url.pathname.startsWith("/api/history/")) {
          const id = url.pathname.slice("/api/history/".length);
          return items.has(id) ? json({ versions: reviews.history(id) }) : json({ error: "Unknown item" }, 404);
        }
        if (url.pathname.startsWith("/media/")) {
          const id = url.pathname.slice(7), item = items.get(id);
          if (!item) return new Response("Not found", { status: 404 });
          const asset = reviews.asset(id, url.searchParams.get("version") ?? String(item.version));
          if (!asset?.content) return new Response("Historical bytes unavailable", { status: 404 });
          const metadata = asset.metadata;
          const type = metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.mediaType === "string" ? metadata.mediaType : "application/octet-stream";
          return mediaResponse({ request, bytes: asset.content, type });
        }
        if (url.pathname === "/review.js") return new Response(`const fetch = (input, init) => globalThis.fetch(typeof input === 'string' && input.startsWith('/') ? ${JSON.stringify(base)} + input : input, init);\n` + script, { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
        const asset = url.pathname === "/" || url.pathname === "/index.html" ? "index.html" : url.pathname === "/styles.css" ? "styles.css" : null;
        return asset ? new Response(asset === 'index.html' ? (await Bun.file(path.join(directory, asset)).text()).replaceAll('href="/', `href="${base}/`).replaceAll('src="/', `src="${base}/`) : Bun.file(path.join(directory, asset)), { headers: { "Cache-Control": "no-store", 'Content-Type': asset === 'index.html' ? 'text/html' : 'text/css' } }) : new Response("Not found", { status: 404 });
      };
    return { fetch, manifest, close: () => reviews.close() };
  } catch (error) { reviews.close(); throw error; }
}

export async function createArtifactReviewServer(options: Parameters<typeof createArtifactReviewHandler>[0] & { port?: number; hostname?: string }) {
  const handler = await createArtifactReviewHandler(options);
  try {
    const server = Bun.serve({ port: options.port ?? 4318, hostname: options.hostname ?? '127.0.0.1', maxRequestBodySize: 262144, fetch: handler.fetch });
    return { server, manifest: handler.manifest, close: () => { server.stop(true); handler.close(); } };
  } catch (error) { handler.close(); throw error; }
}
