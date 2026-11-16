import { z } from "zod";
import { agentEventRecipientSchema, agentEventSubjectSchema } from "./agent-events";

const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
export const connectionActionSchema=z.object({
  kind:z.literal("device-code"), verificationUrl:z.string().url().refine(value=>new URL(value).protocol==="https:"),
  userCode:z.string().min(1).max(64), expiresAt:z.number().int().positive(),
}).strict();
export const durableOperationSchema=z.object({
  id,requestId:id,projectId:id,recipientId:id,kind:id,subject:agentEventSubjectSchema,
  state:z.enum(["pending","running","action_required","succeeded","failed","cancelled"]),
  summary:z.string().min(1).max(2000),createdAt:z.number(),updatedAt:z.number(),deadlineAt:z.number(),version:z.number().int().nonnegative(),
  action:connectionActionSchema.optional(),
}).strict();
export type DurableOperation=z.infer<typeof durableOperationSchema>;
export const connectionSchema=z.object({
  id,providerId:id,label:z.string().min(1).max(120),ownerId:id,
  capabilities:z.array(id).min(1).max(32),authorizationScope:z.string().max(1000),
  credentialSource:z.enum(["stored","environment","ambient","missing"]),
  authentication:z.enum(["device-code","host-managed"]),
  billingMode:z.enum(["subscription","metered","none"]),
  state:z.enum(["disconnected","connecting","action_required","ready","unavailable","error"]),
  summary:z.string().max(2000),checkedAt:z.number(),canConnect:z.boolean(),canRevoke:z.boolean(),
  operation:durableOperationSchema.optional(),
}).strict();
export type Connection=z.infer<typeof connectionSchema>;
export const connectionRequestSchema=agentEventRecipientSchema.extend({requestId:id}).strict();
export const connectionAccessRequestSchema=agentEventRecipientSchema.extend({
  connectionIds:z.array(id).min(1).max(32),expiresInMs:z.number().int().min(60000).max(86400000).default(3600000),
}).strict();
export const connectionAccessReceiptSchema=z.object({url:z.string().url(),accessId:z.string().uuid(),expiresAt:z.number()}).strict();

/** Transport-neutral: hosts supply their authenticated fetch and retain credentials. */
export function createConnectionClient(options:{baseUrl:string;fetch?:(input:string|URL|Request,init?:RequestInit)=>Promise<Response>}){
  const request=options.fetch??fetch;
  async function call(route:string,body?:unknown,signal?:AbortSignal){
    const response=await request(`${options.baseUrl}${route}`,{method:body===undefined?"GET":"POST",redirect:"error",signal,
      headers:{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw Error(`Connection operation failed (${response.status}).`);
    return response.json();
  }
  return {
    async list(signal?:AbortSignal){return connectionSchema.array().parse(await call("",undefined,signal));},
    async connect(connectionId:string,input:z.infer<typeof connectionRequestSchema>){return durableOperationSchema.parse(await call(`/${id.parse(connectionId)}/connect`,connectionRequestSchema.parse(input)));},
    async cancel(connectionId:string,input:z.infer<typeof connectionRequestSchema>){return call(`/${id.parse(connectionId)}/cancel`,connectionRequestSchema.parse(input));},
    async revoke(connectionId:string,input:z.infer<typeof connectionRequestSchema>){return call(`/${id.parse(connectionId)}/revoke`,connectionRequestSchema.parse(input));},
  };
}
