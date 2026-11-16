import { z } from "zod";
import { createSwarmClient,createSwarmRequestSchema,type SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { createSwarmSourceSnapshot } from "@hyperfocus/ai-runtime/swarm";
import { createPublicSwarmSite } from "./site";
import { isObject } from "@hyperfocus/utilities/records";

const sourceReceipt=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive()});

/** A launch handoff, not a local execution owner. Returns after cloud acknowledgement. */
export async function launchRemoteSwarm(options:{input:unknown;root:string;coordinatorUrl:string;token:string;request?:SwarmFetch;
  capture?:typeof createSwarmSourceSnapshot;issueAccess?:typeof createPublicSwarmSite;onStage?:(stage:{name:string;elapsedMs:number})=>void;
}) {
  const startedAt=Date.now(),stages:Array<{name:string;elapsedMs:number}>=[];
  const stage=(name:string)=>{const value={name,elapsedMs:Date.now()-startedAt};stages.push(value);options.onStage?.(value);};
  const url=new URL(options.coordinatorUrl);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw Error("Remote launch requires a public HTTPS coordinator origin; local fallback is disabled.");
  z.string().min(32).parse(options.token);
  const request:SwarmFetch=(input,init)=> (options.request??fetch)(input,{...init,redirect:"error",headers:{...Object.fromEntries(new Headers(init?.headers)),authorization:`Bearer ${options.token}`},signal:init?.signal??AbortSignal.timeout(120000)});
  const client=createSwarmClient({baseUrl:`${url.origin}/api/swarm/v1`,fetch:request});
  const input=createSwarmRequestSchema.parse({...(isObject(options.input)?options.input:{}),executionMode:"campaign",reviewPlan:true});
  if(input.backend!=="railway")throw Error("Remote campaigns require the Railway worker backend.");
  const capabilities=await client.capabilities();stage("readiness");
  if((!capabilities.available&&!capabilities.canQueue)||capabilities.executionAuthority!=="cloud"||!capabilities.projects.some(project=>project.id===input.projectId&&project.campaign))throw Error(capabilities.reason??"A cloud coordinator with campaign support must be configured before launch.");
  const project=capabilities.projects.find(project=>project.id===input.projectId)!;
  if(input.executionKind&&project.executionKind!==input.executionKind){
    const alternatives=capabilities.projects.filter(project=>project.campaign&&project.executionKind===input.executionKind).map(project=>project.id);
    throw Error(project.executionKind
      ? `Project ${project.id} supports ${project.executionKind} work; this request requires ${input.executionKind}. ${alternatives.length?`Use an explicitly authorized matching project: ${alternatives.join(", ")}.`:"No matching project is advertised by this coordinator."} Source capture and upload were not started.`
      : `The coordinator does not advertise an execution kind for ${project.id}. Update its capabilities before launching an explicit ${input.executionKind} request. Source capture and upload were not started.`);
  }
  if(capabilities.inference?.separatelyBilledUsd!==0)throw Error("Zero separately billed inference was not verified; API fallback is disabled.");
  if(capabilities.deploymentExpiresAt!==undefined&&capabilities.deploymentExpiresAt<Date.now()+input.budget.maxDurationMs+60000)throw Error("The cloud service lifetime cannot cover this campaign and cleanup. Renew the control service before launch.");
  const snapshot=await (options.capture??createSwarmSourceSnapshot)({root:options.root,findExisting:async (identity:{revision:string})=>{
    const response=await request(`${url.origin}/api/swarm/v1/sources?projectId=${encodeURIComponent(input.projectId)}&revision=${identity.revision}`);
    if(response.status===404)return undefined;
    if(!response.ok)throw Error(`Source lookup failed (${response.status}).`);
    return sourceReceipt.parse(await response.json());
  }});stage("source-captured");
  let source=snapshot.existingSource;
  if(!source){
    if(!snapshot.bytes)throw Error("Captured source bytes are unavailable.");
    const response=await request(`${url.origin}/api/swarm/v1/sources?projectId=${encodeURIComponent(input.projectId)}&revision=${snapshot.revision}`,{method:"POST",headers:{"content-type":"application/octet-stream","x-content-sha256":snapshot.sha256},body:snapshot.bytes});
    if(!response.ok)throw Error(`Source upload failed (${response.status}).`);
    source=sourceReceipt.parse(await response.json());
    if(source.sha256!==snapshot.sha256||source.bytes!==snapshot.bytes.length)throw Error("Cloud source acknowledgement does not match the captured source.");
  }
  stage("source-acknowledged");
  const run=await client.create({...input,repository:{...input.repository,revision:snapshot.revision,baseRevision:snapshot.baseRevision,sourceArtifactId:source.id}});stage("run-created");
  // Issue phone access before starting: a link failure leaves a reviewable READY run.
  const access=await (options.issueAccess??createPublicSwarmSite)({runId:run.id,access:"control",expiresInMs:604800000,coordinatorUrl:url.origin,token:options.token});stage("phone-access-ready");
  const running=run.status==="READY"?await client.action(run.id,"start"):run;stage("cloud-owned");
  const connectionAccess=running.connectionWait?await client.issueConnectionAccess({projectId:input.projectId,recipientId:input.agentRecipientId??input.requestId}):undefined;
  return {runId:running.id,status:running.status,url:access.url,accessExpiresAt:access.expiresAt,project,source:{revision:snapshot.revision,sha256:source.sha256,bytes:source.bytes,reused:Boolean(snapshot.existingSource)},cloudOwned:true,laptopMayDisconnect:true,
    continuation:{projectId:running.request.projectId,recipientId:running.request.agentRecipientId??running.request.requestId,
      eventsUrl:`${url.origin}/api/swarm/v1/agent-events`,delivery:"durable-until-acknowledged",laptopProcessRequired:false},
    ...(connectionAccess?{connectionAccess,waitingForConnections:running.connectionWait}:{}),
    deadlineAt:running.startedAt?running.startedAt+running.request.budget.maxDurationMs:null,startedAt,stages,startup:{ownershipMs:Date.now()-startedAt,ownershipTargetMs:15000,ownershipTargetMet:Date.now()-startedAt<=15000,firstUsefulWorkTargetMs:30000,firstUsefulWorkMs:running.metrics.firstRemoteWorkAt?running.metrics.firstRemoteWorkAt-startedAt:null}};
}
