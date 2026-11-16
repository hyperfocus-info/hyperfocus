import { z } from "zod";
import { agentEventRecipientSchema } from "@hyperfocus/ai-core/agent-events";
import type { createAgentEventStore } from "./agent-events";

const recipientProperties={projectId:{type:"string",minLength:1,maxLength:160},recipientId:{type:"string",minLength:1,maxLength:160}};
export const agentEventTools=[
  {name:"agent_events_resume",description:"Retrieve durable remote results for an agent recipient after reconnecting. No execution or polling. Results replay until acknowledged.",inputSchema:{type:"object",properties:recipientProperties,required:["projectId","recipientId"],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:"agent_events_wait",description:"Wait for a native remote event callback, up to 55 seconds, without running local work or making model calls. Disconnect leaves the remote campaign and subscription intact.",inputSchema:{type:"object",properties:{...recipientProperties,timeoutMs:{type:"integer",minimum:1,maximum:55000}},required:["projectId","recipientId"],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:"agent_events_acknowledge",description:"Acknowledge one event only after its result has been durably incorporated into agent context. Does not approve or integrate code.",inputSchema:{type:"object",properties:{...recipientProperties,eventId:{type:"string",minLength:1,maxLength:160}},required:["projectId","recipientId","eventId"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},
];

/** JSON response mode of Streamable HTTP. Authentication/body limits belong to the host.
 * Supports the 2025-11-25 initialize handshake; no session or local bridge process required.
 */
export async function handleAgentEventMcp(options:{body:unknown;events:ReturnType<typeof createAgentEventStore>;authorizeProject:(id:string)=>void;signal:AbortSignal}) {
  const message=z.object({jsonrpc:z.literal("2.0"),id:z.union([z.string(),z.number().int()]).optional(),method:z.string(),params:z.unknown().optional()}).safeParse(options.body);
  const reply=(id:string|number|null,result:unknown)=>Response.json({jsonrpc:"2.0",id,result});
  const error=(id:string|number|null,code:number,text:string)=>Response.json({jsonrpc:"2.0",id,error:{code,message:text}});
  if(!message.success)return error(null,-32600,"Invalid JSON-RPC request.");
  const request=message.data;
  if(request.id===undefined)return new Response(null,{status:202});
  if(request.method==="initialize")return reply(request.id,{protocolVersion:"2025-11-25",serverInfo:{name:"hyperfocus-agent-events",version:"1.0.0"},capabilities:{tools:{}}});
  if(request.method==="ping")return reply(request.id,{});
  if(request.method==="tools/list")return reply(request.id,{tools:agentEventTools});
  if(request.method!=="tools/call")return error(request.id,-32601,"Method not found.");
  try{
    const call=z.object({name:z.enum(["agent_events_resume","agent_events_wait","agent_events_acknowledge"]),arguments:z.unknown(),_meta:z.unknown().optional()}).strict().parse(request.params);
    const schema=call.name==="agent_events_wait"?agentEventRecipientSchema.extend({timeoutMs:z.number().int().min(1).max(55000).default(55000)}):call.name==="agent_events_acknowledge"?agentEventRecipientSchema.extend({eventId:z.string().min(1).max(160)}):agentEventRecipientSchema;
    const input=schema.parse(call.arguments),recipient={projectId:input.projectId,recipientId:input.recipientId};options.authorizeProject(recipient.projectId);
    const args=z.record(z.unknown()).parse(call.arguments);
    const result=call.name==="agent_events_acknowledge"?(options.events.acknowledge(recipient,z.string().parse(args.eventId)),{acknowledged:true}):
      call.name==="agent_events_wait"?await options.events.wait(recipient,{timeoutMs:z.number().parse(args.timeoutMs??55000),signal:options.signal}):options.events.resume(recipient);
    // Keep model context bounded; the full result/artifact index remains available by reference.
    const compact="events" in result?{...result,hasMore:result.hasMore||result.events.length>5,events:result.events.slice(0,5).map(event=>({...event,artifacts:event.artifacts.slice(-12)}))}:result;
    return reply(request.id,{content:[{type:"text",text:JSON.stringify(compact)}],structuredContent:compact,isError:false});
  }catch(cause){return reply(request.id,{content:[{type:"text",text:cause instanceof z.ZodError?"Invalid event tool arguments.":cause instanceof Error?cause.message.slice(0,1000):"Event tool failed."}],isError:true});}
}
