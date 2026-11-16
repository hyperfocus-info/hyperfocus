import type { ExecutionWorkspace, ExecutionResult, ExecutionProvider, SwarmArtifact, SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import type { SwarmStore } from "../persistence/store";
import { redactSensitiveString } from "../../tool-activity-state";
import { formatCommandEvidence } from "./command-evidence";
import { createHash } from "node:crypto";
import { swarmPatchByteLimit } from "./patch-transfer";
import { swarmInvestigationSummary } from "./investigation-summary";

type EvidenceScope={context:{store:SwarmStore;artifacts:SwarmArtifactStore};run:SwarmRun;task:SwarmTask;workspace:ExecutionWorkspace};
function assertEvidenceOwner({context,run,task,workspace}:EvidenceScope,current=context.store.get(run.id)){
  if(!current||!task.leaseOwner||task.swarmId!==run.id||current.request.repository.revision!==run.request.repository.revision||workspace.sourceRevision!==run.request.repository.revision||workspace.swarmId!==run.id||workspace.taskId!==task.id)throw Error("Interrupted evidence source or actor mismatch.");
  const active=context.store.owned(current,task.id,task.leaseOwner,task.leaseFence);
  if(active.workspaceId!==workspace.id||!context.store.workspaces(run.id).some(value=>value.id===workspace.id&&value.taskId===task.id&&value.sourceRevision===workspace.sourceRevision))throw Error("Interrupted evidence workspace is no longer owned.");
  return active;
}

/** Logs and their structured receipt commit together, including current-owner cancellation. */
export async function persistSwarmCommandEvidence(options:EvidenceScope&{command:string;partial:string;outputCharacters:number;result?:ExecutionResult;durationMs:number;category:Parameters<typeof formatCommandEvidence>[0]["category"]}){
  const {context,run,task}=options;assertEvidenceOwner(options);
  const bytes=new TextEncoder().encode(redactSensitiveString(`Command: ${options.command}\n${options.outputCharacters>128_000?`Output truncated: retained the final 128000 of ${options.outputCharacters} characters.\n`:""}\n${options.partial.slice(-128_000)||"No streamed output was available."}`));
  const ref=await context.artifacts.put({name:`command-${Date.now()}.log`,mediaType:"text/plain",bytes});
  const evidence:SwarmArtifact={id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,name:ref.name,kind:"log",mediaType:ref.mediaType,sha256:ref.sha256,bytes:ref.bytes,createdAt:Date.now()};
  context.store.change(run.id,current=>{
    const active=assertEvidenceOwner(options,current);current.artifacts.push(evidence);active.artifactIds.push(evidence.id);current.metrics.executionMs+=options.durationMs;
    if(task.kind!=="benchmark")current.messages.push({id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,kind:"validation",text:formatCommandEvidence({artifactId:evidence.id,commandSha256:createHash("sha256").update(options.command).digest("hex"),category:options.category,status:options.result?"returned":"failed",exitCode:options.result?.exitCode??null,timedOut:options.result?.timedOut??false,truncated:options.result?.truncated??options.outputCharacters>128_000,durationMs:options.result?.durationMs??options.durationMs}),artifactIds:[evidence.id],createdAt:Date.now()});
  });return evidence;
}

/** Evidence only: cancellation does not authorize stale attempts or promote unfinished code. */
export async function preserveSwarmInterruptedPatch(options: {
  context: EvidenceScope["context"]&{provider:ExecutionProvider}; run: SwarmRun; task: SwarmTask; workspace: ExecutionWorkspace;
  reason: unknown; timeoutMs?: number;checkpoint?:boolean;
}) {
  const {context,run,task,workspace}=options;
  function owned(current=context.store.get(run.id)) {
    if(task.kind!=="investigate"&&task.kind!=="repair")throw Error("Only an investigation or repair owns an unfinished candidate patch.");
    return assertEvidenceOwner(options,current);
  }
  try{owned();}catch{return false;}
  const controller=new AbortController(),timeoutMs=Math.max(1,Math.min(options.timeoutMs??15_000,15_000));
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=Error("Interrupted patch capture timed out.");controller.abort(error);reject(error);},timeoutMs);});
  let patch:Uint8Array|undefined,detail="No unfinished patch was present.";
  try{
    const files=await Promise.race([context.provider.captureArtifacts({workspace,signal:controller.signal}),deadline]);
    const captured=files.find(file=>file.name.endsWith(".patch"));
    if(captured?.bytes.length){if(captured.bytes.length<=swarmPatchByteLimit){patch=captured.bytes;detail="Unfinished patch retained as unvalidated evidence; it is not eligible for candidate integration.";}else detail=`Unfinished patch exceeded the ${swarmPatchByteLimit}-byte evidence limit (${captured.bytes.length} bytes); bytes were not retained.`;}
  }catch(error){detail=`Unfinished patch capture failed: ${redactSensitiveString(error instanceof Error?error.message:String(error)).slice(0,2000)}`;}
  finally{clearTimeout(timer);}
  const name=`${task.candidateId??task.id}-attempt-${task.attempt}-fence-${task.leaseFence}-partial`,values:SwarmArtifact[]=[];
  async function save(suffix:string,kind:SwarmArtifact["kind"],mediaType:string,bytes:Uint8Array){
    owned();const ref=await context.artifacts.put({name:name+suffix,mediaType,bytes});owned();
    const value:SwarmArtifact={id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,name:ref.name,kind,mediaType:ref.mediaType,sha256:ref.sha256,bytes:ref.bytes,createdAt:Date.now()};values.push(value);return value;
  }
  try{
    const retained=patch?await save(".patch","patch","text/x-diff",patch):undefined;
    const report={status:options.checkpoint?"UNVALIDATED_CHECKPOINT":"UNVALIDATED_INTERRUPTED_EVIDENCE",promotable:false,reason:redactSensitiveString(options.reason instanceof Error?options.reason.message:String(options.reason)).slice(0,2000),detail,workspaceId:workspace.id,sourceRevision:workspace.sourceRevision,taskId:task.id,attempt:task.attempt,leaseFence:task.leaseFence,patchArtifactId:retained?.id,investigation:swarmInvestigationSummary(context,run,task)};
    await save(".json","report","application/json",new TextEncoder().encode(JSON.stringify(report)));
    context.store.change(run.id,current=>{
      const active=owned(current);
      current.artifacts.push(...values);active.artifactIds.push(...values.map(value=>value.id));
      current.messages.push({id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,kind:options.checkpoint?"progress":"blocker",text:detail,artifactIds:values.map(value=>value.id),createdAt:Date.now()});
      // Do not assign candidate.patchArtifactId, correctness, disposition or source identity.
    });return true;
  }catch{return false; /* Recovery owns subsequent state; never mask the original failure. */}
}
