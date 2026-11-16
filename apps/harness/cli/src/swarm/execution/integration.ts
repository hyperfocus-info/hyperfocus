import { swarmTaskSchema, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "./task-context";
import { validateSwarmPatch, swarmVerifierBlockers } from "./patch-policy";
import { captureEngineeringEvidence } from "./engineering";

/** Re-check the exact integrated tree remotely; developer machines do not run the workload. */
export async function verifySwarmIntegration(options:{context:SwarmTaskContext;run:SwarmRun;candidateId:string;sourceTree:string;signal:AbortSignal}) {
  const {context,candidateId,sourceTree,signal}=options;
  const run=context.store.get(options.run.id);
  const approved=(value:SwarmRun|undefined)=>value?.status==="AWAITING_APPROVAL"&&value.integration?.status==="approved"&&value.integration.candidateId===candidateId&&value.candidates.some(candidate=>candidate.id===candidateId&&candidate.sourceTree===sourceTree);
  if(!run||!approved(run))throw Error("Integrated source tree does not match the reviewed candidate.");
  signal.throwIfAborted();
  const patch=await context.patch(run,candidateId),policy=validateSwarmPatch({...context.recipe(run),text:new TextDecoder().decode(patch)});
  const verifierBlockers=swarmVerifierBlockers(policy);
  if(verifierBlockers.length)throw Error(verifierBlockers.join(' '));
  const task=swarmTaskSchema.parse({id:crypto.randomUUID(),swarmId:run.id,agentId:crypto.randomUUID(),title:"Verify integrated source",kind:"validate",role:"validator",capability:"execution",dependencies:[],acceptanceCriteria:["Integrated source tree matches candidate and trusted checks pass again remotely."],status:"RUNNING",attempt:1,maxAttempts:1,artifactIds:[],startedAt:Date.now(),leaseOwner:crypto.randomUUID(),leaseFence:1,leaseUntil:Date.now()+run.request.budget.maxTaskDurationMs+1000});
  context.store.change(run.id,current=>{if(!approved(current))throw Error("Integration approval changed.");const reservation=run.request.budget.maxTaskDurationMs/1000*200/2_592_000;if(current.metrics.computeEstimatedUsd+reservation>current.request.budget.maxComputeUsd)throw Error("Integration verification would exceed the compute budget.");current.metrics.computeEstimatedUsd+=reservation;current.tasks.push(task);});
  const deadline=AbortSignal.timeout(run.request.budget.maxTaskDurationMs),combined=AbortSignal.any([signal,deadline]);
  const checks:Array<{command:string;exitCode:number|null;stdout:string;stderr:string;timedOut:boolean}>=[];
  let workspace;
  async function report(passed:boolean,error?:string){
    const artifact=await context.artifact(run!,task,{name:"integration-validation.json",kind:"validation",mediaType:"application/json",bytes:JSON.stringify({sourceTree,checks,passed,error})});
    context.change(run!,task,current=>{current.candidates.find(value=>value.id===candidateId)!.validationArtifactIds.push(artifact.id);});
  }
  try{
    workspace=await context.workspace(run,task,combined);await context.applyPatch(run,task,workspace,patch,combined);
    await context.verifyTree(run,task,workspace,sourceTree,combined);
    const commands=[...context.recipe(run).validationCommands,...(policy.addedTests.length?[`bun test ${policy.addedTests.join(" ")} --timeout 30000`]:[])];
    for(const command of commands){const result=await context.execute(run,task,workspace,command,combined,run.request.budget.maxTaskDurationMs);checks.push({command,...result});if(result.exitCode!==0||result.timedOut||result.truncated)throw Error("Integrated correctness checks failed or returned incomplete evidence; inspect validation artifacts.");}
    if(context.recipe(run).executionKind==="engineering"){
      const evidence=await captureEngineeringEvidence(context,run,task,workspace,combined);
      if(evidence.missing.length)throw Error(`Integrated verification evidence is incomplete: ${evidence.missing.join("; ")}`);
    }
    await context.verifyTree(run,task,workspace,sourceTree,combined);
    await report(true);
    context.change(run,task,current=>{const value=current.tasks.find(value=>value.id===task.id)!;value.status="SUCCEEDED";value.completedAt=Date.now();value.leaseUntil=undefined;value.leaseOwner=undefined;});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    // A lost lease cannot append a new receipt; already durable evidence stays intact.
    await report(false,detail).catch(()=>{});
    try{context.store.finish({runId:run.id,taskId:task.id,owner:task.leaseOwner!,fence:task.leaseFence,error:detail});}catch{/* Recovery has fenced this attempt. */}
    throw error;
  }finally{if(workspace)await context.remove(workspace);}
}
