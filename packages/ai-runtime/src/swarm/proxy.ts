import { createSwarmRequestSchema, swarmRunSchema, swarmBrowserAccessRequestSchema, swarmBrowserAccessReceiptSchema, type SwarmFetch, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { z } from "zod";
import { createSwarmSourceSnapshot, readSwarmSourceContext, swarmGit } from "./source";
// Shared across app handler instances; coordinator approval also serializes cross-host requests.
const integratingRoots = new Set<string>();
export function createSwarmProxyHandler(options: {
  resolveProject: (projectId: string) => Promise<{
    id: string;
    name: string;
    rootPath: string;
  } | undefined> | {
    id: string;
    name: string;
    rootPath: string;
  } | undefined;
  baseUrl?: string;
  token?: string;
  fetch?: SwarmFetch;
  archive?: boolean;
  onDisposition?: (run: SwarmRun) => void | Promise<void>;
}) {
  const prefix = "/api/swarm/v1";
  const baseUrl = options.baseUrl ?? process.env.HYPERFOCUS_HOST_URL ?? process.env.HYPERFOCUS_SWARM_URL;
  const token = options.baseUrl!==undefined?options.token:options.token??(process.env.HYPERFOCUS_HOST_URL?process.env.HYPERFOCUS_HOST_TOKEN:process.env.HYPERFOCUS_SWARM_TOKEN);
  const remoteFetch = options.fetch ?? fetch;
  const configured = Boolean(baseUrl && token);
  const archived = options.archive ?? process.env.HYPERFOCUS_SWARM_ARCHIVE === "1";
  const rememberedDispositions = new Map<string, number>();
  async function remote(route: string, init: RequestInit = {}) {
    if (!baseUrl || !token)
      throw Error("Swarm provider unavailable. Configure HYPERFOCUS_SWARM_URL and HYPERFOCUS_SWARM_TOKEN in this app host.");
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw Error("Cloud swarm connections require HTTPS.");
    const response = await remoteFetch(`${baseUrl.replace(/\/$/, "")}${prefix}${route}`, { ...init, redirect: "error", headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` }, signal: init.signal ?? AbortSignal.timeout(120000) });
    const headers = new Headers(response.headers);
    // Fetch decodes the upstream body. Its original framing cannot describe this new response.
    const connectionHeaders = (headers.get("connection") ?? "").split(",").map(value => value.trim()).filter(Boolean);
    for (const header of ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade", ...connectionHeaders]) headers.delete(header);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  async function remoteJson(route: string, body?: unknown) {
    const response = await remote(route, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data: unknown = await response.json(); if (!response.ok)
      throw Error(typeof data === "object" && data !== null && "error" in data ? String(data.error) : `Swarm request failed (${response.status})`); return data;
  }
  async function project(id: string) {
    const value = await options.resolveProject(id); if (!value)
      throw Error("Project access denied."); return value;
  }
  async function rememberDisposition(run: SwarmRun, record = false) {
    if (archived) return { run, retryNeeded: false };
    const hasDisposition = record || run.status === "COMPLETED" || run.integration?.status === "integrated" || run.candidates.some(candidate => candidate.disposition === "rejected");
    if (options.onDisposition && hasDisposition && rememberedDispositions.get(run.id) !== run.updatedAt) {
      try {
        await options.onDisposition(run);
        rememberedDispositions.set(run.id, run.updatedAt);
      }
      catch {
        return { run: { ...run, reason: ["Project memory update failed. Run evidence remains durable; refresh to retry.", run.reason].filter(Boolean).join(" ").slice(0, 4000) }, retryNeeded: true };
      }
    }
    return { run, retryNeeded: false };
  }
  async function dispositionResponse(run: SwarmRun, record = false) {
    const result = await rememberDisposition(run, record);
    return Response.json(result.run, { headers: { "cache-control": "no-store", ...result.retryNeeded ? { "x-hyperfocus-swarm-memory-status": "retry-needed" } : {} } });
  }
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/"))
      return undefined;
    const route = url.pathname.slice(prefix.length);
    if (archived && request.method !== "GET") return Response.json({ error: "Archived evidence is read-only. Execution and integration are unavailable." }, { status: 403 });
    try {
      if(route==="/connection-access"&&request.method==="POST"){
        const input=z.object({projectId:z.string(),recipientId:z.string()}).strict().parse(await request.json());
        const selected=await project(input.projectId);
        return Response.json(await remoteJson(route,{...input,projectId:selected.id}),{headers:{"cache-control":"no-store"}});
      }
      if (request.method === "GET" && route === "/capabilities") {
        if (!configured)
          return Response.json({ available: false, reason: "Cloud swarm is not configured. Set the coordinator URL and token in the host environment.", backends: [], maxWorkers: 3, projects: [] });
        return await remote(route, { signal: request.signal });
      }
      if (request.method === "GET" && route === "/context") {
        const selected = await project(url.searchParams.get("projectId") ?? "");
        if (archived) return await remote(`/context?projectId=${encodeURIComponent(selected.id)}`, { signal: request.signal });
        return Response.json({ projectId: selected.id, name: selected.name, ...await readSwarmSourceContext(selected.rootPath), provider: { available: configured, ...configured ? {} : { reason: "Cloud swarm is not configured." } } });
      }
      if (request.method === "GET" && route === "/runs") {
        const selected = await project(url.searchParams.get("projectId") ?? "");
        url.searchParams.set("projectId", selected.id);
        const response = await remote(route + url.search, { signal: request.signal });
        if (!response.ok)
          return response;
        const runs = swarmRunSchema.array().parse(await response.json());
        if (runs.some(run => run.request.projectId !== selected.id))
          throw Error("Project access denied.");
        const results = await Promise.all(runs.map(run => rememberDisposition(run)));
        return Response.json(results.map(result => result.run), { headers: { "cache-control": "no-store", ...results.some(result => result.retryNeeded) ? { "x-hyperfocus-swarm-memory-status": "retry-needed" } : {} } });
      }
      if (request.method === "POST" && route === "/runs") {
        const input = createSwarmRequestSchema.parse(await request.json());
        const selected = await project(input.projectId);
        if (!configured)
          throw Error("Cloud swarm is not configured; no workload was started locally.");
        const context = await readSwarmSourceContext(selected.rootPath);
        if (context.repository.revision !== input.repository.revision)
          throw Error("Repository revision changed; refresh the proposed source before submitting.");
        const snapshot = await createSwarmSourceSnapshot({ root: selected.rootPath,findExisting:async (identity:{revision:string})=>{
          const response=await remote(`/sources?projectId=${encodeURIComponent(selected.id)}&revision=${identity.revision}`);
          if(response.status===404)return undefined;
          if(!response.ok)throw Error(`Source lookup failed (${response.status}).`);
          return z.object({id:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive()}).parse(await response.json());
        } });
        let artifact:unknown=snapshot.existingSource;
        if(!artifact){
          const response = await remote(`/sources?projectId=${encodeURIComponent(selected.id)}&revision=${snapshot.revision}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-content-sha256": snapshot.sha256 }, body: snapshot.bytes });
          if(!response.ok)throw Error(`Source upload failed (${response.status}).`);
          artifact=await response.json();
          const receipt=z.object({sha256:z.literal(snapshot.sha256),bytes:z.literal(snapshot.bytes!.length)}).parse(artifact);
          if(!receipt)throw Error("Source receipt did not match captured bytes.");
        }
        if (typeof artifact !== "object" || artifact === null || !("id" in artifact) || typeof artifact.id !== "string")
          throw Error("Invalid source upload receipt.");
        return Response.json(await remoteJson("/runs", { ...input, projectId: selected.id, repository: { ...input.repository, revision: snapshot.revision, baseRevision: snapshot.baseRevision, sourceArtifactId: artifact.id } }));
      }
      const match = /^\/runs\/([a-zA-Z0-9_.:-]+)(?:\/(.*))?$/.exec(route);
      if (!match)
        return Response.json({ error: "Unknown swarm route." }, { status: 404 });
      let run = swarmRunSchema.parse(await remoteJson(`/runs/${match[1]}`));
      if (run.id !== match[1]) throw Error("Coordinator returned another run.");
      const selected = await project(run.request.projectId);
      if (run.request.projectId !== selected.id)
        throw Error("Project access denied.");
      if (request.method === "POST" && match[2] === "browser-access") {
        const body = swarmBrowserAccessRequestSchema.omit({ runId: true }).parse(await request.json());
        const result = swarmBrowserAccessReceiptSchema.parse(await remoteJson("/admin/browser-access", { ...body, runId: run.id }));
        return Response.json(result, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      }
      if (request.method === "POST" && match[2] === "approve") {
        const body: unknown = await request.json();
        const candidateId = typeof body === "object" && body !== null && "candidateId" in body ? String(body.candidateId) : "";
        const resolved = await realpath(selected.rootPath);
        const lockKey = process.platform === "win32" ? resolved.toLowerCase() : resolved;
        if (integratingRoots.has(lockKey))
          return Response.json({ error: "Another integration is in progress for this repository. Refresh after it finishes." }, { status: 409, headers: { "cache-control": "no-store" } });
        integratingRoots.add(lockKey);
        try {
          run = swarmRunSchema.parse(await remoteJson(`/runs/${match[1]}`));
          if (run.request.projectId !== selected.id)
            throw Error("Project access changed during approval.");
          if (run.integration?.status === "integrated" && run.integration.candidateId === candidateId)
            return await dispositionResponse(run, true);
          const candidate = run.candidates.find(c => c.id === candidateId);
          const artifact = run.artifacts.find(a => a.id === candidate?.patchArtifactId);
          if (run.status !== "AWAITING_APPROVAL" || !candidate || candidate.disposition !== "recommended" || candidate.correctness !== "passed" || candidate.blockers.length || candidate.comparison?.decision !== "IMPROVED" || artifact?.kind !== "patch")
            throw Error("Candidate lacks promotion evidence.");
          const snapshot = await createSwarmSourceSnapshot({ root: selected.rootPath });
          const expected = (await swarmGit({ root: selected.rootPath, args: ["rev-parse", `${run.request.repository.revision}^{tree}`] })).output;
          if (snapshot.tree !== expected)
            throw Error("Working tree changed since the source snapshot. Integration rejected; rerun against the current source.");
          const patchResponse = await remote(`/runs/${run.id}/artifacts/${artifact.id}`);
          if (!patchResponse.ok)
            throw Error("Patch artifact is unavailable.");
          const patch = new Uint8Array(await patchResponse.arrayBuffer());
          if (patch.length !== artifact.bytes || createHash("sha256").update(patch).digest("hex") !== artifact.sha256)
            throw Error("Patch content hash mismatch.");
          await swarmGit({ root: selected.rootPath, args: ["apply", "--check", "--whitespace=error", "-"], input: patch });
          await remoteJson(`/runs/${run.id}/approve`, { candidateId });
          let integrated: SwarmRun;
          try {
            await swarmGit({ root: selected.rootPath, args: ["apply", "--whitespace=error", "-"], input: patch });
            await swarmGit({ root: selected.rootPath, args: ["diff", "--check"] });
            const integratedSource = await createSwarmSourceSnapshot({ root: selected.rootPath });
            integrated = swarmRunSchema.parse(await remoteJson(`/runs/${run.id}/integration`, { candidateId, status: "integrated", sourceTree: integratedSource.tree, detail: "Applied the reviewed patch to the unchanged source snapshot; git diff --check and repeated trusted correctness checks on the exact integrated tree passed." }));
          }
          catch (error) {
            await remoteJson(`/runs/${run.id}/integration`, { candidateId, status: "conflict", detail: error instanceof Error ? error.message : "Integration failed" });
            throw error;
          }
          return await dispositionResponse(integrated, true);
        }
        finally {
          integratingRoots.delete(lockKey);
        }
      }
      if (request.method === "GET" && !match[2])
        return await dispositionResponse(run);
      if (request.method === "GET" && match[2]?.startsWith("artifacts/"))
        return await remote(route + url.search, { signal: request.signal });
      if (request.method === "GET" && match[2] === "events")
        return await remote(route, { signal: request.signal, headers: { "last-event-id": request.headers.get("last-event-id") ?? "" } });
      if (request.method === "POST" && ["start", "cancel", "reject", "steer", "follow-up"].includes(match[2] ?? "")) {
        const updated = swarmRunSchema.parse(await remoteJson(route, await request.json()));
        return match[2] === "reject" ? await dispositionResponse(updated, true) : Response.json(updated);
      }
      return Response.json({ error: "Unknown swarm operation." }, { status: 404 });
    }
    catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  };
}
