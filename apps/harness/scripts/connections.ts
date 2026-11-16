import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { z } from "zod";
import { connectionAccessReceiptSchema,connectionSchema,connectionRequestSchema,durableOperationSchema } from "@hyperfocus/ai-core/connections";

const {values}=parseArgs({args:process.argv.slice(2),options:{deployment:{type:"string"},project:{type:"string"},agent:{type:"string"},list:{type:"boolean"},revoke:{type:"string"},connect:{type:"string"},operation:{type:"string"}}});
if([values.list,values.revoke,values.connect,values.operation].filter(Boolean).length>1)throw Error("Choose one Connections action.");
let url=process.env.HYPERFOCUS_HOST_URL??process.env.HYPERFOCUS_SWARM_URL,
  token=process.env.HYPERFOCUS_HOST_URL?process.env.HYPERFOCUS_HOST_TOKEN:process.env.HYPERFOCUS_SWARM_TOKEN;
if(values.deployment){
  const id=z.string().uuid().parse(values.deployment),directory=resolve(import.meta.dir,"../../..", ".local/swarm/deployments",id);
  const state=z.object({id:z.literal(id),url:z.string().url()}).parse(await Bun.file(resolve(directory,"deployment.json")).json());
  url=state.url;token=z.object({coordinator:z.string().min(32)}).parse(await Bun.file(resolve(directory,"secrets.json")).json()).coordinator;
}
if(!url||!token)throw Error("Configure the trusted remote host URL/token or select its deployment receipt.");
const origin=new URL(url);if(origin.protocol!=="https:"||origin.origin!==url)throw Error("An exact HTTPS host origin is required.");
const route=values.list?"connections":values.revoke?`access/${z.string().uuid().parse(values.revoke)}`:values.operation?`operations/${z.string().uuid().parse(values.operation)}`:values.connect?`connections/${encodeURIComponent(values.connect)}/connect`:"access";
const body=values.connect?connectionRequestSchema.parse({projectId:values.project,recipientId:values.agent??"connections-owner",requestId:crypto.randomUUID()}):{projectId:values.project,recipientId:values.agent??"connections-owner",connectionIds:["codex-account","railway"]};
const response=await fetch(`${url}/api/connections/v1/${route}`,{method:values.list||values.operation?"GET":values.revoke?"DELETE":"POST",redirect:"error",signal:AbortSignal.timeout(30000),
  headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},...values.list||values.revoke||values.operation?{}:{body:JSON.stringify(body)}});
if(!response.ok)throw Error(`Remote Connections request failed (${response.status}).`);
const result=await response.json();console.log(JSON.stringify(values.list?connectionSchema.array().parse(result):values.connect||values.operation?durableOperationSchema.parse(result):values.revoke?result:connectionAccessReceiptSchema.parse(result),null,2));
