import { createHash, timingSafeEqual } from "node:crypto";
import type { SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import type { SwarmReader } from "./persistence/store";

export function createSwarmOwnerAuth(token: string) {
  if (token.length < 32) throw Error("Swarm service token must contain at least 32 characters.");
  const expected = Buffer.from(`Bearer ${token}`);
  return (request: Request) => {
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return Response.json({ error: "Authentication required." }, { status: 401 });
    if (request.headers.has("origin"))
      return Response.json({ error: "Use the authenticated host proxy; direct cross-origin browser access is disabled." }, { status: 403 });
  };
}

/** Shared immutable run and artifact routes for live and archived owners. */
export function createSwarmReadRoutes(options: {
  store: SwarmReader;
  artifacts: Pick<SwarmArtifactStore, "read">;
  projects: ReadonlyMap<string, { name: string }>;
}) {
  function authorizeProject(id: string) {
    if (!options.projects.has(id)) throw Error("Project access denied.");
  }
  function run(id: string) {
    const value = options.store.get(id);
    if (!value) throw Error("Unknown swarm run.");
    authorizeProject(value.request.projectId);
    return value;
  }
  async function read(request: Request, route: string) {
    if (request.method !== "GET") return;
    if (route === "/runs") {
      const id = new URL(request.url).searchParams.get("projectId");
      if (id) authorizeProject(id);
      return Response.json(options.store.list(id ?? undefined).filter(value => options.projects.has(value.request.projectId)));
    }
    const match = /^\/runs\/([a-zA-Z0-9_.:-]+)(?:\/artifacts\/([a-zA-Z0-9_.:-]+))?$/.exec(route);
    if (!match) return;
    const value = run(match[1]!);
    if (!match[2]) return Response.json(value);
    const artifact = value.artifacts.find(item => item.id === match[2]);
    if (!artifact) throw Error("Unknown artifact for this run.");
    const bytes = await options.artifacts.read({ sha256: artifact.sha256 });
    if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw Error("Artifact integrity does not match its run receipt.");
    return new Response(new Uint8Array(bytes).buffer, { headers: {
      "content-type": artifact.mediaType, "content-length": String(bytes.length),
      "content-disposition": `${new URL(request.url).searchParams.get("download")==="1"?"attachment":"inline"}; filename="${artifact.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "content-security-policy": "default-src 'none'; sandbox", "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
    } });
  }
  return { authorizeProject, run, read };
}
