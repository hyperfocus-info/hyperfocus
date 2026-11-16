import type { Database } from "bun:sqlite";
import { z } from "zod";
import { swarmBrowserAccessRequestSchema } from "@hyperfocus/ai-core/swarm";
import { createBrowserGrantStore,secureBrowserCookie } from "@hyperfocus/ai-runtime/browser-grants";
export { sameSecret } from "@hyperfocus/ai-runtime/browser-grants";

export const SWARM_BROWSER_COOKIE = "__Host-hyperfocus-swarm";
export const SWARM_BROWSER_CSRF = "x-swarm-csrf-token";
export const browserAccessRequestSchema = swarmBrowserAccessRequestSchema;
export const browserAccessSchema = z.object({
  id: z.string().uuid(), runId: z.string(), projectId: z.string(),
  access: z.enum(["view", "control"]), expiresAt: z.number().finite(),
}).strict();
export type SwarmBrowserAccess = z.infer<typeof browserAccessSchema>;

/** Preserve existing sessions and their scopes through the shared host grant primitive. */
export function createSwarmBrowserSessions(options:{db:Database;now?:()=>number;deploymentExpiresAt?:number}) {
  const grants=createBrowserGrantStore({...options,namespace:"swarm_browser",cookieName:SWARM_BROWSER_COOKIE,
    csrfContext:"hyperfocus-swarm-browser-csrf-v1",parse:input=>browserAccessSchema.parse(input)});
  return {...grants,mint(input:z.infer<typeof browserAccessRequestSchema>&{projectId:string}) {
    return grants.mint({runId:input.runId,projectId:input.projectId,access:input.access},input.expiresInMs);
  }};
}
export function swarmBrowserCookie(options:{token:string;expiresAt:number}){return secureBrowserCookie(SWARM_BROWSER_COOKIE,options);}
