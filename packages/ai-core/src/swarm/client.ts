import { createSwarmRequestSchema, swarmCapabilitiesSchema, swarmContextSchema, swarmRunSchema, swarmSteeringSchema, swarmFollowUpSchema, swarmBrowserAccessRequestSchema, swarmBrowserAccessReceiptSchema, type CreateSwarmRequest, type SwarmSteering, type SwarmFollowUp } from "./contracts";
import { z } from "zod";
import { connectionAccessReceiptSchema } from "../connections";
import { applySwarmRunFrame, type SwarmStreamState } from "./stream";

export type SwarmFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function createSwarmClient(options: { baseUrl?: string; fetch?: SwarmFetch } = {}) {
  const request = options.fetch ?? fetch;
  const prefix = options.baseUrl ?? "/api/swarm/v1";
  async function call(path: string, body?: unknown) {
    const response = await request(`${prefix}${path}`, { method:body === undefined ? "GET" : "POST", headers:body === undefined ? {} : {"content-type":"application/json"}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new Error(`Swarm service returned an unreadable response (${response.status}).`); }
    if (!response.ok) {
      const detail = z.object({error:z.string().max(4_000)}).safeParse(value);
      throw new Error(detail.success ? detail.data.error : `Swarm service unavailable (${response.status}).`);
    }
    return value;
  }
  return {
    async watch(runId:string, onRun:(run:z.infer<typeof swarmRunSchema>)=>void, signal:AbortSignal) {
      const response = await request(`${prefix}/runs/${encodeURIComponent(runId)}/events`, { headers:{accept:"text/event-stream"}, signal });
      if (!response.ok || !response.body) throw new Error(`Swarm updates unavailable (${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let state: SwarmStreamState | undefined;
      try {
        while (!signal.aborted) {
          const {value,done} = await reader.read();
          if (done) break;
          pending = (pending + decoder.decode(value,{stream:true})).replace(/\r\n/g,"\n");
          if (pending.length > 8_388_608) throw new Error("Swarm update exceeds the stream limit.");
          let end: number;
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const event = pending.slice(0,end); pending = pending.slice(end+2);
            const data = event.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
            if (data) {
              const value: unknown = JSON.parse(data);
              const framed = z.object({type:z.enum(["snapshot","delta"])}).safeParse(value);
              if (framed.success) state = applySwarmRunFrame({previous:state,frame:value,runId});
              else {
                const run = swarmRunSchema.parse(value);
                if (run.id !== runId) throw new Error("Swarm stream returned another run.");
                state = {run,sequence:0};
              }
              onRun(state.run);
            }
          }
        }
      } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    },
    capabilities:async () => swarmCapabilitiesSchema.parse(await call("/capabilities")),
    issueConnectionAccess:async (input:{projectId:string;recipientId:string})=>connectionAccessReceiptSchema.parse(await call("/connection-access",input)),
    context:async (projectId:string) => swarmContextSchema.parse(await call(`/context?projectId=${encodeURIComponent(projectId)}`)),
    list:async (projectId:string) => z.array(swarmRunSchema).parse(await call(`/runs?projectId=${encodeURIComponent(projectId)}`)),
    create:async (input:CreateSwarmRequest) => swarmRunSchema.parse(await call("/runs", createSwarmRequestSchema.parse(input))),
    get:async (runId:string) => swarmRunSchema.parse(await call(`/runs/${encodeURIComponent(runId)}`)),
    action:async (runId:string, action:"start"|"cancel"|"reject"|"approve", candidateId?:string) => swarmRunSchema.parse(await call(`/runs/${encodeURIComponent(runId)}/${action}`, {candidateId})),
    steer:async (runId:string, input:SwarmSteering) => swarmRunSchema.parse(await call(`/runs/${encodeURIComponent(runId)}/steer`, swarmSteeringSchema.parse(input))),
    followUp:async (runId:string, input:SwarmFollowUp) => swarmRunSchema.parse(await call(`/runs/${encodeURIComponent(runId)}/follow-up`, swarmFollowUpSchema.parse(input))),
    async issueBrowserAccess(input: { runId: string; access: "view" | "control"; expiresInMs?: number }) {
      const { runId, ...body } = swarmBrowserAccessRequestSchema.parse(input);
      return swarmBrowserAccessReceiptSchema.parse(await call(`/runs/${encodeURIComponent(runId)}/browser-access`, body));
    },
    artifactUrl:(runId:string, artifactId:string) => `${prefix}/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`,
  };
}
export type SwarmClient = ReturnType<typeof createSwarmClient>;
