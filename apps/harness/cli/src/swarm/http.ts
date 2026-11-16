import { createHash } from "node:crypto";
import { z } from "zod";
import { createSwarmRequestSchema, createSwarmRunFrame, type SwarmStreamState, type SwarmModelProfiles } from "@hyperfocus/ai-core/swarm";
import type { SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import type { SwarmStore } from "./persistence/store";
import type { SwarmCoordinator } from "./coordinator";
import type { SwarmProjectRecipe } from "./execution/task-context";
import type { AiExecutionProfile } from "@hyperfocus/ai-core/runtime";
import { createSwarmEventResponse } from "./stream/response";
import { createSwarmOwnerAuth, createSwarmReadRoutes } from "./http-read";
import { agentEventRecipientSchema } from "@hyperfocus/ai-core/agent-events";
import { handleAgentEventMcp } from "@hyperfocus/ai-runtime/agent-events/mcp";
const demonstrationExportSchema = z.object({ demonstration: z.object({ id: z.string().uuid(), expiresAt: z.string().datetime(), budget: z.object({ id: z.string().uuid(), expiresAt: z.string().datetime(), maximumUsd: z.number().positive().max(10), serviceAndEgressReserveUsd: z.number().nonnegative().max(10), admissions: z.array(z.object({ id: z.string().uuid(), reservedUsd: z.number().positive().max(10), createdAt: z.string().datetime() }).strict()).max(100), reservedUsd: z.number().nonnegative().max(10), billingBasis: z.string().max(1000) }).strict(), workspaces: z.array(z.string().max(160)).max(100) }).strict() }).strict();
export type SwarmDemonstrationExport = z.infer<typeof demonstrationExportSchema>;
export function createSwarmHttpHandler(options: {
  store: SwarmStore;
  coordinator: SwarmCoordinator;
  artifacts: SwarmArtifactStore;
  token: string;
  recipes: Map<string, SwarmProjectRecipe>;
  backend: "railway" | "local";
  executionAuthority?: "cloud" | "local";
  profile?: AiExecutionProfile;
  modelProfiles?: SwarmModelProfiles;
  deploymentExpiresAt?: number;
  shutdownSignal?: AbortSignal;
  eventHeartbeatMs?: number;
  maxComputeUsd?: number;
  maxModelUsd?: number;
  connections?:{mint:(input:unknown)=>unknown;start:(runId:string)=>Promise<ReturnType<SwarmStore["get"]>>};
  providerReady?: () => Promise<{
    available: boolean;
    reason?: string;
  }>;
  inference?: {
    provider: string;
    credentialSource: string;
    separatelyBilledUsd: number;
  };
  exportState?: (receipt?: SwarmDemonstrationExport) => Promise<unknown>;
  verifyIntegration?: (input: {
    run: ReturnType<SwarmStore["get"]> & {};
    candidateId: string;
    sourceTree: string;
    signal: AbortSignal;
  }) => Promise<void>;
}) {
  const prefix = "/api/swarm/v1", { store, coordinator, artifacts } = options;
  const authorize = createSwarmOwnerAuth(options.token);
  const { authorizeProject, run, read } = createSwarmReadRoutes({ store, artifacts, projects: options.recipes });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET")
      return Response.json({ ok: true });
    const denied = authorize(request);
    if (denied) return denied;
    const route = url.pathname.slice(prefix.length);
    if (!url.pathname.startsWith(prefix + "/"))
      return Response.json({ error: "Not found." }, { status: 404 });
    try {
      if(route==="/connection-access"&&request.method==="POST"){
        if(!options.connections)throw Error("Remote connections are unavailable.");
        const input=z.object({projectId:z.string(),recipientId:z.string()}).strict().parse(JSON.parse(new TextDecoder().decode(await boundedBody(request,16000))));
        authorizeProject(input.projectId);
        return Response.json(options.connections.mint({...input,connectionIds:["codex-account","railway"]}));
      }
      if(route==="/agent-events/mcp"){
        if(request.method!=="POST")return new Response(null,{status:405,headers:{allow:"POST"}});
        return await handleAgentEventMcp({body:JSON.parse(new TextDecoder().decode(await boundedBody(request,16000))),events:store.agentEvents,authorizeProject,
          signal:options.shutdownSignal?AbortSignal.any([request.signal,options.shutdownSignal]):request.signal});
      }
      if(route.startsWith("/agent-events/")&&request.method==="POST"){
        const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,16000)));
        const schema=route==="/agent-events/wait"?agentEventRecipientSchema.extend({timeoutMs:z.number().int().min(1).max(55000).default(55000)}):
          route==="/agent-events/acknowledge"?agentEventRecipientSchema.extend({eventId:z.string().min(1).max(160)}):agentEventRecipientSchema;
        const parsed=schema.parse(body),recipient={projectId:parsed.projectId,recipientId:parsed.recipientId};authorizeProject(recipient.projectId);
        if(route==="/agent-events/resume")return Response.json(store.agentEvents.resume(recipient));
        if(route==="/agent-events/wait")return Response.json(await store.agentEvents.wait(recipient,{timeoutMs:body.timeoutMs??55000,
          signal:options.shutdownSignal?AbortSignal.any([request.signal,options.shutdownSignal]):request.signal}));
        if(route==="/agent-events/acknowledge"){store.agentEvents.acknowledge(recipient,body.eventId);return Response.json({acknowledged:true});}
      }
      const response = await read(request, route);
      if (response) return response;
      if (route === "/admin/export" && request.method === "POST") {
        if (!options.exportState)
          throw Error("Durable shutdown export is not configured.");
        const bytes = await boundedBody(request, 32768);
        const receipt = bytes.length ? demonstrationExportSchema.parse(JSON.parse(new TextDecoder().decode(bytes))) : undefined;
        return Response.json(await options.exportState(receipt));
      }
      if (route.startsWith("/admin/artifacts/") && request.method === "GET") {
        const sha256 = z.string().regex(/^[a-f0-9]{64}$/).parse(route.slice("/admin/artifacts/".length));
        const bytes = await artifacts.read({ sha256 });
        return new Response(new Uint8Array(bytes).buffer, { headers: { "content-type": "application/octet-stream", "content-security-policy": "default-src 'none'; sandbox", "x-content-type-options": "nosniff", "cache-control": "no-store" } });
      }
      if (route === "/capabilities" && request.method === "GET")
        return Response.json({ ...(await options.providerReady?.() ?? { available: true }), connectionsSupported:Boolean(options.connections),canQueue:Boolean(options.connections),executionAuthority:options.executionAuthority??"local", backends: [options.backend], maxWorkers: 3, ...options.inference ? { inference: options.inference } : {}, ...options.modelProfiles ? { modelProfiles: options.modelProfiles } : {}, ...options.deploymentExpiresAt !== undefined ? { deploymentExpiresAt: options.deploymentExpiresAt } : {}, projects: [...options.recipes.entries()].map(([id, recipe]) => ({ id, name: recipe.name,campaign:Boolean(options.modelProfiles&&(recipe.executionKind==="engineering"||recipe.investigationInstruments.length)),
          executionKind:recipe.executionKind,investigationInstruments:recipe.investigationInstruments.map(({id,claim})=>({id,claim})),blockedPromotionReasons:recipe.blockedPromotionReasons })) });
      if (route === "/sources" && request.method === "POST") {
        const projectId = url.searchParams.get("projectId") ?? "";
        authorizeProject(projectId);
        const revision = z.string().regex(/^[a-f0-9]{40,64}$/).parse(url.searchParams.get("revision"));
        const bytes = await boundedBody(request, 268435456);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== request.headers.get("x-content-sha256"))
          throw Error("Source content hash mismatch.");
        const signature = new TextDecoder().decode(bytes.subarray(0, 32));
        if (!signature.startsWith("# v2 git bundle") && !signature.startsWith("# v3 git bundle"))
          throw Error("Source must be an immutable Git bundle.");
        const ref = await artifacts.put({ name: "source.bundle", mediaType: "application/octet-stream", bytes });
        const id = createHash("sha256").update(`${projectId}\0${revision}\0${hash}`).digest("hex");
        store.db.query("INSERT INTO swarm_source_artifacts VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(id, projectId, hash, revision, ref.bytes);
        return Response.json({ id, sha256: hash, bytes: ref.bytes });
      }
      if(route==="/sources"&&request.method==="GET"){
        const projectId=url.searchParams.get("projectId")??"";authorizeProject(projectId);
        const revision=z.string().regex(/^[a-f0-9]{40,64}$/).parse(url.searchParams.get("revision"));
        const source=store.db.query<{id:string;sha256:string;bytes:number},[string,string]>("SELECT id,sha256,bytes FROM swarm_source_artifacts WHERE project_id=? AND revision=? LIMIT 1").get(projectId,revision);
        if(!source)return Response.json({error:"Source is not cached."},{status:404});
        // A metadata row alone is not a durable source acknowledgement.
        const bytes=await artifacts.read({sha256:source.sha256});
        if(bytes.length!==source.bytes||createHash("sha256").update(bytes).digest("hex")!==source.sha256)throw Error("Cached source integrity failed.");
        return Response.json(source);
      }
      if (route === "/runs" && request.method === "POST") {
        const input = createSwarmRequestSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 128000))));
        if(input.executionMode==="campaign"&&input.backend==="railway"&&options.executionAuthority!=="cloud")throw Error("A remote campaign requires a cloud-owned coordinator. The laptop diagnostic runner cannot accept this campaign.");
        authorizeProject(input.projectId);
        if (input.budget.maxComputeUsd > (options.maxComputeUsd ?? 10) || input.budget.maxModelUsd > (options.maxModelUsd ?? 0))
          throw Error("Run budget exceeds this service's authorized spending ceiling.");
        const ready = options.connections?undefined:await options.providerReady?.();
        if (ready && !ready.available && !options.connections)
          throw Error(ready.reason ?? "Execution provider unavailable.");
        const profile = input.profile ?? options.profile;
        if (!profile)
          throw Error("Cloud coordinator requires an authenticated model profile.");
        if (options.profile && (profile.agentId !== options.profile.agentId || profile.providerId !== options.profile.providerId || profile.modelId !== options.profile.modelId))
          throw Error("Requested inference profile is not authorized by this coordinator.");
        const created=coordinator.create({ ...input, profile,...options.connections?{reviewPlan:true}:{} });
        return Response.json(options.connections&&!input.reviewPlan?await options.connections.start(created.id):created);
      }
      if (route === "/cleanup" && request.method === "POST") {
        await coordinator.recoverOrphans();
        return Response.json({ remaining: store.workspaces().length });
      }
      const match = /^\/runs\/([a-zA-Z0-9_.:-]+)(?:\/(.*))?$/.exec(route);
      if (!match)
        return Response.json({ error: "Not found." }, { status: 404 });
      const value = run(match[1]);
      if (match[2] === "events" && request.method === "GET") {
        let timer: ReturnType<typeof setInterval> | undefined;
        let release = () => { clearInterval(timer); };
        const encoder = new TextEncoder();
        const signal = options.shutdownSignal ? AbortSignal.any([request.signal, options.shutdownSignal]) : request.signal;
        const heartbeatMs = Math.max(1_000, options.eventHeartbeatMs ?? 30_000);
        let lastSentAt = Date.now();
        let previous: SwarmStreamState | undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            if (signal.aborted) { controller.close(); return; }
            const close = () => { release(); try { controller.close(); } catch {} };
            release = () => { clearInterval(timer); signal.removeEventListener("abort", close); };
            signal.addEventListener("abort", close, { once: true });
            const emit = () => {
              if (signal.aborted) return;
              if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
              try {
                const latest = run(value.id), frame = createSwarmRunFrame({previous,run:latest});
                if (!frame) {
                  if (Date.now() - lastSentAt >= heartbeatMs) {
                    controller.enqueue(encoder.encode(": heartbeat\n\n")); lastSentAt = Date.now();
                  }
                  return;
                }
                controller.enqueue(encoder.encode(`id: ${frame.sequence}\nevent: swarm\ndata: ${JSON.stringify(frame)}\n\n`));
                lastSentAt = Date.now();
                previous = {run:latest,sequence:frame.sequence};
              } catch (error) {
                release(); controller.error(error);
              }
            }; timer = setInterval(emit, 1000); emit();
          }, cancel() { release(); }
        });
        return createSwarmEventResponse(request, body);
      }
      if (request.method === "POST") {
        const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 16000)) || "{}");
        const action = z.object({ candidateId: z.string().optional() }).strict();
        if (match[2] === "steer") return Response.json(coordinator.steer(value.id, body));
        if (match[2] === "follow-up") return Response.json(coordinator.followUp(value.id, body));
        if (match[2] === "start") {
          action.parse(body);
          return Response.json(options.connections?await options.connections.start(value.id):coordinator.start(value.id));
        }
        if (match[2] === "cancel") {
          action.parse(body);
          return Response.json(coordinator.cancel(value.id));
        }
        if (match[2] === "reject")
          return Response.json(coordinator.reject(value.id, action.parse(body).candidateId));
        if (match[2] === "approve")
          return Response.json(coordinator.approve(value.id, action.parse(body).candidateId ?? ""));
        if (match[2] === "integration") {
          const receipt = z.object({ candidateId: z.string(), status: z.enum(["integrated", "conflict"]), detail: z.string().max(4000), sourceTree: z.string().regex(/^[a-f0-9]{40,64}$/).optional() }).strict().parse(body);
          const lease = store.lease(`integration:${value.id}`, crypto.randomUUID(), value.request.budget.maxTaskDurationMs + 60000);
          try {
            if (receipt.status === "integrated") {
              if (!options.verifyIntegration || !receipt.sourceTree)
                throw Error("Post-integration verification is required.");
              await options.verifyIntegration({ run: value, candidateId: receipt.candidateId, sourceTree: receipt.sourceTree, signal: request.signal });
            }
            store.assertLease(lease);
            return Response.json(coordinator.integrated(value.id, { candidateId: receipt.candidateId, status: receipt.status, detail: receipt.detail }));
          }
          finally {
            store.releaseLease(lease);
          }
        }
      }
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  };
}
async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw Error("Request exceeds byte limit."); if (!request.body)
    return new Uint8Array(); const reader = request.body.getReader(); const parts: Uint8Array[] = []; let length = 0; try {
      while (true) {
        const item = await reader.read();
        if (item.done)
          break;
        length += item.value.length;
        if (length > limit)
          throw Error("Request exceeds byte limit.");
        parts.push(item.value);
      }
    }
  finally {
    await reader.cancel().catch(() => { });
    reader.releaseLock();
  } const output = new Uint8Array(length); let offset = 0; for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  } return output;
}
