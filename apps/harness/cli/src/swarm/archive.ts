import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import type { SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import { createSwarmOwnerAuth, createSwarmReadRoutes } from "./http-read";
import { createSwarmReader } from "./persistence/store";

/** Opens an immutable serialized database; no coordinator, migrations, provider or writable store. */
export function openSwarmArchive(options: {
  bytes: Uint8Array;
  sha256: string;
  token: string;
  artifacts: Pick<SwarmArtifactStore, "read">;
  projects: ReadonlyMap<string, { name: string }>;
}) {
  if (createHash("sha256").update(options.bytes).digest("hex") !== options.sha256) throw Error("Swarm archive content hash mismatch.");
  const authorize = createSwarmOwnerAuth(options.token);
  const snapshot = new Uint8Array(options.bytes);
  if (new TextDecoder().decode(snapshot.subarray(0, 16)) !== "SQLite format 3\0") throw Error("Invalid SQLite archive header.");
  // SQLite requires rollback-format header bytes for deserialization of a WAL
  // serialization. Only this ephemeral copy changes; original evidence stays hashed.
  // https://sqlite.org/c3ref/deserialize.html
  if (snapshot[18] === 2 && snapshot[19] === 2) { snapshot[18] = 1; snapshot[19] = 1; }
  const db = Database.deserialize(snapshot, { readonly: true });
  const store = createSwarmReader(db);
  const { read, authorizeProject } = createSwarmReadRoutes({ store, artifacts: options.artifacts, projects: options.projects });
  const prefix = "/api/swarm/v1";
  async function handler(request: Request) {
    if (new URL(request.url).pathname === "/health" && request.method === "GET") return Response.json({ ok: true, archived: true });
    const denied = authorize(request);
    if (denied) return denied;
    if (request.method !== "GET") return Response.json({ error: "Archived evidence is read-only. Execution and integration are unavailable." }, { status: 403 });
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/")) return Response.json({ error: "Not found." }, { status: 404 });
    const route = url.pathname.slice(prefix.length);
    try {
      if (route === "/capabilities") return Response.json({ available: false, reason: "Archived evidence; execution has ended.",
        archive: { sha256: options.sha256 }, backends: [], maxWorkers: 0, projects: [...options.projects].map(([id, project]) => ({ id, name: project.name })) });
      if (route === "/context") {
        const id = url.searchParams.get("projectId") ?? "";
        authorizeProject(id);
        const run = store.list(id)[0];
        if (!run) throw Error("No archived run for this project.");
        return Response.json({ projectId: id, name: options.projects.get(id)!.name, repository: run.request.repository,
          dirty: false, sourceSnapshotRequired: false, provider: { available: false, reason: "Archived evidence; execution has ended." } });
      }
      return await read(request, route) ?? Response.json({ error: "Archived evidence supports run and artifact snapshots only." }, { status: 404 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  }
  return { handler, close: () => db.close() };
}
