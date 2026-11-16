import { swarmCapabilitiesSchema, swarmContextSchema, type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { z } from "zod";

export const publicSwarmPrefix = "/api/swarm/v1/browser";
const sessionSchema = z.object({
  csrfToken:z.string().min(1).max(512),
  access:z.object({id:z.string(),runId:z.string(),projectId:z.string(),access:z.enum(["view","control"]),expiresAt:z.number()}),
  context:swarmContextSchema,
  capabilities:swarmCapabilitiesSchema,
});
export type PublicSwarmSession = z.infer<typeof sessionSchema>;

export async function openPublicSwarmSession(input:{request:SwarmFetch;code?:string;signal:AbortSignal}) {
  const request=input.request;
  const response=await request(`${publicSwarmPrefix}/session`,{method:input.code ? "POST" : "GET",credentials:"same-origin",redirect:"error",signal:input.signal,...(input.code ? {headers:{"content-type":"application/json"},body:JSON.stringify({code:input.code})} : {})});
  if (!response.ok) throw new Error(`This swarm access link is expired, revoked or unavailable (${response.status}). Request a new scoped link from its owner.`);
  return sessionSchema.parse(await response.json());
}

/** Scoped cookie authentication only. Privileged host/coordinator credentials never enter this transport. */
export function createPublicSwarmFetch(input:{session:PublicSwarmSession;origin:string;request?:SwarmFetch}):SwarmFetch {
  return (resource,init)=>{
    const url=new URL(typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url,input.origin);
    if (url.origin !== input.origin || !url.pathname.startsWith(`${publicSwarmPrefix}/`)) throw new Error("Public swarm requests must remain in their scoped API.");
    const headers=new Headers(init?.headers ?? (resource instanceof Request ? resource.headers : undefined));
    headers.delete("authorization");headers.delete("x-harness-session-token");
    const method=init?.method ?? (resource instanceof Request ? resource.method : "GET");
    if (!["GET","HEAD"].includes(method.toUpperCase())) headers.set("x-swarm-csrf-token",input.session.csrfToken);
    const scoped:RequestInit={...init,headers,credentials:"same-origin",redirect:"error"};
    return (input.request ?? fetch)(resource instanceof Request ? resource : url,scoped);
  };
}
