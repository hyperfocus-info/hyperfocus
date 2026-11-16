import { type ExecutionProvider, type ExecutionWorkspace, type ExecutionResult, type SwarmRun, type SwarmTask, type SwarmArtifact, type WorkspaceSource } from "@hyperfocus/ai-core/swarm";
import { createHash } from "node:crypto";
import type { SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import { z } from "zod";
import { taskAttemptKey, terminalSwarmStatuses, type SwarmStore } from "../persistence/store";
import { redactSensitiveString } from "../../tool-activity-state";
import { artifactReadSchema, formatEvidenceAccess } from "./command-evidence";
import { persistSwarmCommandEvidence } from "./failure-evidence";
import { swarmInvestigationInstrumentSchema, swarmOutcomeCriterionSchema } from "@hyperfocus/ai-core/swarm";
import { swarmPatchApplyCommands } from "./patch-transfer";

export const swarmArtifactPathSchema=z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/).refine(value=>!value.startsWith("/")&&value.split("/").every(part=>part!==".."&&part!=="."&&part!==""),"Use repository-relative artifact paths.");
export const swarmProjectRecipeSchema=z.object({
  id:z.string(),name:z.string(),repositoryUrls:z.array(z.string()).default([]),
  executionKind:z.enum(["performance","engineering"]).default("performance"),
  preparationCommand:z.string().max(64_000),validationCommands:z.array(z.string().min(1).max(64_000)).min(1).max(20),
  benchmarkCommand:z.string().max(64_000).default(""),benchmarkMetric:z.string().default("duration-ms"),
  artifactPaths:z.array(swarmArtifactPathSchema).max(32).default([]),
  validationPaths:z.array(swarmArtifactPathSchema).max(32).default([]),
  blockedPromotionReasons:z.array(z.string()).default([]),ownedPaths:z.array(z.string()).min(1),
  investigationInstruments:z.array(swarmInvestigationInstrumentSchema).max(12).default([]),
  outcomeCriteria:z.array(swarmOutcomeCriterionSchema.extend({evaluatorMethodId:z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)})).max(12).default([]),
}).strict().refine(recipe=>recipe.executionKind==="engineering"||recipe.benchmarkCommand.length>0,"Performance recipes require a benchmark command.");
export type SwarmProjectRecipe=z.infer<typeof swarmProjectRecipeSchema>;
export function createSwarmTaskContext(options:{store:SwarmStore;provider:ExecutionProvider;artifacts:SwarmArtifactStore;recipes:Map<string,SwarmProjectRecipe>}) {
  const {store,provider,artifacts}=options;
  function assertOwned(run:SwarmRun,task:SwarmTask,current=store.get(run.id)) {
    if(!current||terminalSwarmStatuses.has(current.status))throw Error("Run stopped.");
    if(current.request.repository.revision!==run.request.repository.revision||task.swarmId!==run.id||!task.leaseOwner)throw Error("Stale task source or owner.");
    return store.owned(current,task.id,task.leaseOwner,task.leaseFence);
  }
  function change(run:SwarmRun,task:SwarmTask,mutation:(current:SwarmRun)=>void) {return store.change(run.id,current=>{assertOwned(run,task,current);mutation(current);});}
  function assertWorkspace(run:SwarmRun,task:SwarmTask,workspace:ExecutionWorkspace) {
    const current=assertOwned(run,task);
    if(current.workspaceId!==workspace.id||workspace.taskId!==task.id||workspace.swarmId!==run.id||workspace.sourceRevision!==run.request.repository.revision)throw Error("Workspace does not belong to the current task attempt.");
  }
  function recipe(run:SwarmRun){const recipe=options.recipes.get(run.request.projectId);if(!recipe)throw Error("Project is not authorized in this coordinator.");if(recipe.executionKind!==run.executionKind)throw Error("Trusted recipe execution kind changed after this run was planned; create a new run against the current recipe.");return recipe;}
  async function source(run:SwarmRun):Promise<WorkspaceSource>{const ref=run.request.repository.sourceArtifactId;
    if(ref){const row=store.db.query<{sha256:string;revision:string},[string,string]>("SELECT sha256,revision FROM swarm_source_artifacts WHERE id=? AND project_id=?").get(ref,run.request.projectId);if(!row||row.revision!==run.request.repository.revision)throw Error("Source artifact does not belong to this project/revision.");const bytes=await artifacts.read({sha256:row.sha256});return{revision:row.revision,bundle:{sha256:row.sha256,bytesBase64:Buffer.from(bytes).toString("base64")}};}
    if(!recipe(run).repositoryUrls.includes(run.request.repository.url))throw Error("Repository URL is not authorized; upload a reviewed immutable source snapshot.");
    return{revision:run.request.repository.revision,repositoryUrl:run.request.repository.url};
  }
  async function artifact(run:SwarmRun,task:SwarmTask,input:{name:string;kind:SwarmArtifact["kind"];mediaType?:string;bytes:Uint8Array|string;signal?:AbortSignal}) {
    input.signal?.throwIfAborted();assertOwned(run,task);
    const bytes=typeof input.bytes==="string"?new TextEncoder().encode(input.bytes):input.bytes;
    const ref=await artifacts.put({name:input.name,mediaType:input.mediaType??"text/plain",bytes});
    input.signal?.throwIfAborted();
    const value:SwarmArtifact={id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,name:ref.name,kind:input.kind,mediaType:ref.mediaType,sha256:ref.sha256,bytes:ref.bytes,createdAt:Date.now()};
    change(run,task,latest=>{latest.artifacts.push(value);latest.tasks.find(t=>t.id===task.id)!.artifactIds.push(value.id);});return value;
  }
  function message(run:SwarmRun,task:SwarmTask,text:string,kind:"evidence"|"hypothesis"|"blocker"|"validation"|"modification"|"progress"="evidence",artifactIds:string[]=[]) {assertOwned(run,task);store.message({id:crypto.randomUUID(),swarmId:run.id,taskId:task.id,agentId:task.agentId,sourceRevision:run.request.repository.revision,kind,text:redactSensitiveString(text).slice(0,16_000),artifactIds,createdAt:Date.now()},{owner:task.leaseOwner!,fence:task.leaseFence});}
  async function execute(run:SwarmRun,task:SwarmTask,workspace:ExecutionWorkspace,command:string,signal:AbortSignal,timeoutMs?:number) {
    signal.throwIfAborted();assertWorkspace(run,task,workspace);let partial="",outputCharacters=0;const started=Date.now();
    let result:ExecutionResult|undefined,failed=false;
    const preparation=command===recipe(run).preparationCommand;
    message(run,task,preparation?"Preparing the isolated workspace and dependencies.":"Starting a remote repository command. Its output will be preserved as evidence.","progress");
    try{result=await provider.execute({workspace,task:{id:crypto.randomUUID(),command,timeoutMs:Math.min(timeoutMs??120_000,run.request.budget.maxTaskDurationMs),environment:{HYPERFOCUS_SWARM_BACKEND:provider.kind,HARNESS_TEST_SKIP_UI_PRELOAD:"1"}},signal,onOutput:output=>{outputCharacters+=output.text.length;partial=(partial+output.text).slice(-128_000); },onSession:()=>{if(!preparation)change(run,task,current=>{current.metrics.firstRemoteWorkAt??=Date.now();});}});signal.throwIfAborted();assertWorkspace(run,task,workspace);if(!preparation)change(run,task,current=>{current.metrics.firstRemoteWorkAt??=started;});return result;}
    catch(error){failed=true;throw error;}
    finally {try{const configured=recipe(run);await persistSwarmCommandEvidence({context:{store,artifacts},run,task,workspace,command,partial,outputCharacters,result,durationMs:Date.now()-started,category:command===configured.preparationCommand?"preparation":configured.validationCommands.includes(command)?"correctness":command===configured.benchmarkCommand?"benchmark":"repository-command"});}catch(error){if(!failed)throw error;}}
  }
  async function readArtifact(run:SwarmRun,task:SwarmTask,input:unknown,signal:AbortSignal){
    signal.throwIfAborted();assertOwned(run,task);const request=artifactReadSchema.parse(input),current=store.get(run.id)!;
    const value=current.artifacts.find(artifact=>artifact.id===request.artifactId),baseline=current.tasks.find(task=>task.kind==="baseline");
    const commandLog=value?.kind==="log"&&value.name.startsWith("command-");
    const own=value?.taskId===task.id&&value.agentId===task.agentId&&(commandLog||value.kind==="report"&&(value.mediaType.startsWith("text/")||value.mediaType==="application/json"));
    const baselineEvidence=value?.taskId===baseline?.id&&value?.agentId===baseline?.agentId&&(commandLog||value?.name==="baseline.json"||value?.mediaType==="application/json"&&recipe(run).artifactPaths.includes(value.name));
    const sharedProbe=value&&current.outcome?.experiments.some(experiment=>experiment.artifactIds.includes(value.id))&&current.tasks.some(task=>task.id===value.taskId&&task.kind==="experiment"&&task.status==="SUCCEEDED");
    const sharedAnalysis=value?.id===current.outcome?.artifactId&&value?.kind==="report";
    const repairTask=current.tasks.find(value=>value.id===task.id);
    const repairValidation=value?.kind==="validation"&&repairTask?.kind==="repair"&&repairTask.repair?.validationArtifactIds.includes(value.id)
      &&current.tasks.some(owner=>owner.id===value.taskId&&owner.agentId===value.agentId&&owner.kind==="validate"&&owner.candidateId===repairTask.candidateId);
    if(!value||value.sourceRevision!==run.request.repository.revision||!own&&!baselineEvidence&&!sharedProbe&&!sharedAnalysis&&!repairValidation)throw Error("Artifact access is limited to this worker's command logs, baseline, outcome analysis, completed shared experiments and its authorized repair validation; other candidate work is private.");
    if(value.bytes>(value.kind==="trace"?8_388_608:262_144))throw Error("Artifact exceeds the bounded evidence-read limit.");
    const bytes=await artifacts.read({sha256:value.sha256});signal.throwIfAborted();assertOwned(run,task);
    if(bytes.length!==value.bytes||createHash("sha256").update(bytes).digest("hex")!==value.sha256)throw Error("Artifact content does not match its immutable receipt.");
    const text=new TextDecoder().decode(bytes);if(request.offset>text.length)throw Error("Artifact offset exceeds the retained content.");
    const nextOffset=Math.min(text.length,request.offset+request.maxCharacters);
    message(run,task,formatEvidenceAccess({action:"read",artifactId:value.id,sha256:value.sha256,offset:request.offset,endOffset:nextOffset,totalCharacters:text.length}),"validation",[value.id]);
    return{artifactId:value.id,sha256:value.sha256,sourceRevision:value.sourceRevision,text:text.slice(request.offset,nextOffset),offset:request.offset,nextOffset:nextOffset<text.length?nextOffset:null,totalCharacters:text.length,truncated:nextOffset<text.length};
  }
  async function workspace(run:SwarmRun,task:SwarmTask,signal:AbortSignal,lane:"investigation"|"benchmark"="investigation") {
    signal.throwIfAborted();assertOwned(run,task);const started=Date.now(),input=await source(run);signal.throwIfAborted();assertOwned(run,task);
    const remote=await provider.createWorkspace({swarmId:run.id,taskId:taskAttemptKey(task),source:input,resources:{cpu:2,memoryGB:2},lane,signal});
    const created={...remote,taskId:task.id};store.workspace(created);
    try{
      signal.throwIfAborted();if(remote.taskId!==taskAttemptKey(task)||remote.swarmId!==run.id||remote.sourceRevision!==run.request.repository.revision)throw Error("Provider returned a workspace for a different task attempt or source.");
      change(run,task,latest=>{latest.tasks.find(t=>t.id===task.id)!.workspaceId=created.id;latest.metrics.sandboxCreationMs+=Date.now()-started;});
      const prepare=Date.now();const result=await execute(run,task,created,recipe(run).preparationCommand,signal,600_000);if(result.exitCode!==0||result.timedOut)throw Error("Dependency preparation failed; inspect command artifacts.");
      change(run,task,latest=>{latest.metrics.preparationMs+=Date.now()-prepare;});return created;
    }catch(error){await remove(created).catch(()=>{});throw error;}
  }
  async function fork(run:SwarmRun,task:SwarmTask,signal:AbortSignal){signal.throwIfAborted();assertOwned(run,task);const current=store.get(run.id)!;const baseline=store.workspaces(run.id).find(w=>current.tasks.some(t=>t.kind==="baseline"&&t.status==="SUCCEEDED"&&t.workspaceId===w.id));if(!baseline)return workspace(run,task,signal);
    const started=Date.now();let remote:ExecutionWorkspace;
    try{remote=await provider.forkWorkspace({workspace:baseline,taskId:taskAttemptKey(task),signal});}
    catch(error){signal.throwIfAborted();assertOwned(run,task);message(run,task,`Prepared workspace unavailable; recreating exact source. ${error instanceof Error?error.message:"Fork failed"}`,"blocker");change(run,task,value=>{value.metrics.cacheRequests++;});return workspace(run,task,signal);}
    const forked={...remote,taskId:task.id};store.workspace(forked);
    try{signal.throwIfAborted();if(remote.taskId!==taskAttemptKey(task)||remote.swarmId!==run.id||remote.sourceRevision!==run.request.repository.revision)throw Error("Provider returned a fork for a different task attempt or source.");change(run,task,value=>{value.tasks.find(t=>t.id===task.id)!.workspaceId=forked.id;value.metrics.cacheRequests++;value.metrics.cacheHits++;value.metrics.sandboxCreationMs+=Date.now()-started;});return forked;}
    catch(error){await remove(forked).catch(()=>{});throw error;}
  }
  async function remove(workspace:ExecutionWorkspace){await provider.destroyWorkspace({workspaceId:workspace.id});store.destroyed(workspace.id);}
  async function patch(run:SwarmRun,candidateId:string){const latest=store.get(run.id)!;const candidate=latest.candidates.find(c=>c.id===candidateId);const artifact=latest.artifacts.find(a=>a.id===candidate?.patchArtifactId);if(!artifact)throw Error("Candidate produced no patch.");return artifacts.read({sha256:artifact.sha256});}
  async function applyPatch(run:SwarmRun,task:SwarmTask,workspace:ExecutionWorkspace,bytes:Uint8Array,signal:AbortSignal) {for(const command of swarmPatchApplyCommands(bytes)){const result=await execute(run,task,workspace,command,signal);if(result.exitCode!==0||result.timedOut||result.truncated)throw Error("Candidate patch transfer failed or conflicts with the immutable baseline.");}}
  async function verifyTree(run:SwarmRun,task:SwarmTask,workspace:ExecutionWorkspace,expected:string|undefined,signal:AbortSignal) {
    if(!expected||!/^[a-f0-9]{40,64}$/.test(expected))throw Error("Validated source tree identity is missing.");
    const result=await execute(run,task,workspace,"git add -A && git write-tree",signal);
    if(result.exitCode!==0||result.timedOut||result.truncated||result.stdout.trim()!==expected)throw Error("Reconstructed source tree differs from the reviewed candidate or immutable baseline.");
  }
  return{...options,assertOwned,assertWorkspace,change,recipe,source,artifact,message,execute,readArtifact,workspace,fork,remove,patch,applyPatch,verifyTree};
}
export type SwarmTaskContext=ReturnType<typeof createSwarmTaskContext>;
