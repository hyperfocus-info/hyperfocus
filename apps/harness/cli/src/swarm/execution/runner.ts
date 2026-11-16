import type { LocalAiRuntime } from "@hyperfocus/ai-runtime";
import type { ExecutionWorkspace,SwarmRun,SwarmTask } from "@hyperfocus/ai-core/swarm";
import { selectBenchmarkWinner, type compareBenchmarkCandidate } from "@hyperfocus/performance/swarm";
import type { SwarmTaskContext } from "./task-context";
import { investigateCandidate } from "../reasoning/reasoning";
import { benchmarkCandidates } from "./benchmark";
import { transitionSwarm } from "../persistence/store";
import { validateSwarmPatch, swarmVerifierBlockers } from "./patch-policy";
import { summarizeSwarmBaseline } from "./baseline-summary";
import { reasonAboutSwarmPhase } from "../reasoning/phase-reasoning";
import type { SwarmModelAdmission } from "../reasoning/model-turn";
import { preserveSwarmInterruptedPatch } from "./failure-evidence";
import { executeSwarmExperiment } from "../outcome/experiments";
import { finalizeSwarmOutcome } from "../outcome/evaluation";
import { prepareSwarmRepair, verifySwarmRepairPatch } from "../outcome/repairs";
import { advanceSwarmCampaign } from "../campaign";
import { captureEngineeringBaseline, captureEngineeringEvidence, compareEngineeringCandidates } from "./engineering";
import { swarmPatchByteLimit } from "./patch-transfer";

export function createSwarmTaskHandler(options:{context:SwarmTaskContext;runtime:LocalAiRuntime;maxTokenPriceUsd?:number;beforeModelCall?:SwarmModelAdmission}) {
  const {context,runtime}=options;
  return async({run,task,signal}:{run:SwarmRun;task:SwarmTask;signal:AbortSignal})=>{
    context.assertOwned(run,task);
    if(task.kind==="experiment"){await executeSwarmExperiment({context,run,task,signal});return;}
    if(task.kind==="repair"&&!await prepareSwarmRepair(context,run,task))return;
    if(task.kind==="plan"||task.kind==="review"){await reasonAboutSwarmPhase({context,runtime,run,task,signal,maxTokenPriceUsd:options.maxTokenPriceUsd??0.00003,beforeModelCall:options.beforeModelCall});return;}
    if(task.kind==="baseline"){
      const workspace=await context.workspace(run,task,signal);
      if(context.recipe(run).executionKind==="engineering"){
        await captureEngineeringBaseline(context,run,task,workspace,signal);return;
      }
      // Baseline validation gates all candidate work; fresh measurement is serialized
      // before investigations. It is diagnostic, not tournament comparison evidence.
      for(const command of context.recipe(run).validationCommands){const result=await context.execute(run,task,workspace,command,signal,run.request.budget.maxTaskDurationMs);if(result.exitCode!==0)throw Error("Current source baseline fails correctness; inspect artifacts before optimizing.");}
      const result=await context.execute(run,task,workspace,context.recipe(run).benchmarkCommand,signal);
      if(result.exitCode!==0||result.timedOut||result.truncated)throw Error("Current baseline measurement failed.");
      const artifact=await context.artifact(run,task,{name:"baseline.json",kind:"benchmark",mediaType:"application/json",bytes:result.stdout});
      context.message(run,task,summarizeSwarmBaseline({value:JSON.parse(result.stdout),artifactId:artifact.id,sourceRevision:run.request.repository.revision,requireCpuEvidence:context.recipe(run).id==="touch-of-death"}),"evidence",[artifact.id]);return;
    }
    if(task.kind==="benchmark"){await benchmarkCandidates({context,run,task,signal});return;}
    if(task.kind==="compare"){
      if(context.recipe(run).executionKind==="engineering"){
        await compareEngineeringCandidates(context,run,task);return;
      }
      const latest=context.store.get(run.id)!;
      const comparisons:Array<{id:string;comparison:ReturnType<typeof compareBenchmarkCandidate>}>=[];
      for(const candidate of latest.candidates.filter(candidate=>candidate.disposition!=="rejected")){const artifact=latest.artifacts.find(a=>a.id===candidate.comparison?.artifactId);if(artifact){const raw=JSON.parse(new TextDecoder().decode(await context.artifacts.read({sha256:artifact.sha256})));comparisons.push({id:candidate.id,comparison:raw});}}
      const selected=selectBenchmarkWinner({candidates:comparisons});
      await finalizeSwarmOutcome(context,run,task,selected.winnerId??undefined);
      context.message(run,task,selected.reason,"validation");
      context.change(run,task,current=>{for(const candidate of current.candidates){if(candidate.correctness!=="passed"||candidate.blockers.length||candidate.comparison?.decision!=="IMPROVED"||current.outcome&&current.outcome.outcomeSuccess!=="demonstrated"||current.modelPlan&&current.completion?.status!=="met")candidate.disposition="rejected";else if(candidate.id===selected.winnerId)candidate.disposition="recommended";}current.selectedCandidateId=current.candidates.find(candidate=>candidate.id===selected.winnerId&&candidate.disposition==="recommended")?.id;if(!advanceSwarmCampaign(current,task,context.recipe(run).investigationInstruments))transitionSwarm(current,"AWAITING_APPROVAL",current.modelPlan&&current.completion?.status!=="met"?"Explicit completion criteria remain unmet or review failed; findings retained for human review.":selected.reason);});
      return;
    }
    if(task.kind==="validate"){
      const candidate=context.store.get(run.id)!.candidates.find(candidate=>candidate.id===task.candidateId)!;
      if(!candidate.patchArtifactId){
        context.change(run,task,value=>{value.candidates.find(value=>value.id===candidate.id)!.correctness="failed";});
        context.message(run,task,`${candidate.id}: no patch to validate; validation workspace and checks skipped. No game-test failure is implied.`,"validation");
        return;
      }
    }
    let workspace:ExecutionWorkspace|undefined;
    try{
      workspace=await context.fork(run,task,signal);
      if(task.kind==="investigate"||task.kind==="repair"){
        if(task.kind==="repair"){
          const candidate=context.store.get(run.id)!.candidates.find(value=>value.id===task.candidateId)!;
          await context.applyPatch(run,task,workspace,await context.patch(run,candidate.id),signal);
          await context.verifyTree(run,task,workspace,candidate.sourceTree,signal);
        }
        await investigateCandidate({context,runtime,run,task,workspace,signal,maxTokenPriceUsd:options.maxTokenPriceUsd??0.00003,beforeModelCall:options.beforeModelCall});
        if(context.store.get(run.id)!.candidates.find(candidate=>candidate.id===task.candidateId)?.disposition==="rejected")return;
        const files=await context.provider.captureArtifacts({workspace,signal});
        const patch=files.find(file=>file.name.endsWith(".patch"));if(!patch||!patch.bytes.length){context.change(run,task,value=>{const candidate=value.candidates.find(c=>c.id===task.candidateId)!;candidate.blockers.push("Investigation produced no implementation patch.");candidate.disposition="rejected";});return;}
        if(patch.bytes.length>swarmPatchByteLimit)throw Error(`Patch exceeds the ${swarmPatchByteLimit}-byte task size; retain a smaller independently reviewable candidate.`);
        const policy=validateSwarmPatch({...context.recipe(run),text:new TextDecoder().decode(patch.bytes)});
        if(task.kind==="repair")await verifySwarmRepairPatch(context,run,task,new TextDecoder().decode(patch.bytes));
        const artifact=await context.artifact(run,task,{name:`${task.candidateId}.patch`,kind:"patch",bytes:patch.bytes,mediaType:"text/x-diff"});
        const tree=await context.execute(run,task,workspace,"git add -A && git write-tree",signal);
        const treeId=tree.stdout.trim();if(tree.exitCode!==0||tree.truncated||!/^[a-f0-9]{40,64}$/.test(treeId))throw Error("Candidate tree could not be recorded.");
        // Only the disposable remote index changes. Fixed metadata makes this
        // real Git object reproducible from the retained base and patch.
        const commit=await context.execute(run,task,workspace,`printf '%s\\n' 'Hyperfocus swarm candidate' | GIT_AUTHOR_DATE='2000-01-01T00:00:00Z' GIT_COMMITTER_DATE='2000-01-01T00:00:00Z' git -c user.name='Hyperfocus Swarm' -c user.email='swarm@hyperfocus.invalid' commit-tree ${treeId} -p ${run.request.repository.revision}`,signal);
        const revision=commit.stdout.trim();if(commit.exitCode!==0||commit.truncated||!/^[a-f0-9]{40,64}$/.test(revision))throw Error("Candidate commit identity could not be recorded.");
        await context.artifact(run,task,{name:`${task.candidateId}-revision.json`,kind:"report",mediaType:"application/json",bytes:JSON.stringify({revision,tree:treeId,parent:run.request.repository.revision,message:"Hyperfocus swarm candidate",author:{name:"Hyperfocus Swarm",email:"swarm@hyperfocus.invalid",date:"2000-01-01T00:00:00Z"},patchArtifactId:artifact.id})});
        context.change(run,task,value=>{const candidate=value.candidates.find(c=>c.id===task.candidateId)!;candidate.patchArtifactId=artifact.id;candidate.sourceRevision=revision;candidate.sourceTree=treeId;for(const blocker of swarmVerifierBlockers(policy))if(!candidate.blockers.includes(blocker))candidate.blockers.push(blocker);if(task.kind==="repair"){candidate.correctness="pending";candidate.validationArtifactIds=[];candidate.disposition="pending";}});
        for(const file of files.filter(f=>f!==patch))await context.artifact(run,task,{name:file.name,mediaType:file.mediaType,kind:"report",bytes:file.bytes});
      }else if(task.kind==="validate"){
        const candidate=context.store.get(run.id)!.candidates.find(c=>c.id===task.candidateId)!;
        const started=Date.now(),patch=await context.patch(run,candidate.id);
        const policy=validateSwarmPatch({...context.recipe(run),text:new TextDecoder().decode(patch)}),verifierBlockers=swarmVerifierBlockers(policy);
        if(verifierBlockers.length)context.change(run,task,current=>{const value=current.candidates.find(value=>value.id===candidate.id)!;for(const blocker of verifierBlockers)if(!value.blockers.includes(blocker))value.blockers.push(blocker);});
        await context.applyPatch(run,task,workspace,patch,signal);
        await context.verifyTree(run,task,workspace,candidate.sourceTree,signal);
        let passed=true;const checks=[];
        const commands=[...context.recipe(run).validationCommands,...(policy.addedTests.length?[`bun test ${policy.addedTests.join(" ")} --timeout 30000`]:[])];
        for(const command of commands){const result=await context.execute(run,task,workspace,command,signal,run.request.budget.maxTaskDurationMs);checks.push({command,...result});passed&&=result.exitCode===0&&!result.timedOut;}
        const evidence=context.recipe(run).executionKind==="engineering"?await captureEngineeringEvidence(context,run,task,workspace,signal):{artifactIds:[],missing:[]};
        passed&&=!evidence.missing.length&&checks.every(check=>!check.truncated);
        await context.verifyTree(run,task,workspace,candidate.sourceTree,signal);
        const artifact=await context.artifact(run,task,{name:`validation-${candidate.id}.json`,kind:"validation",mediaType:"application/json",bytes:JSON.stringify({passed,checks,...evidence,verifierChanges:policy.verifierChanges})});
        context.change(run,task,value=>{value.outcome?.evaluations.push({candidateId:candidate.id,kind:"correctness",evaluatorId:task.agentId,method:verifierBlockers.length?"Diagnostic checks of a proposal changing verification source; not independent correctness evidence.":"Trusted unchanged correctness fixtures in a fresh reconstructed candidate workspace; source tree checked before and after execution.",artifactIds:[artifact.id],result:passed?"passed":"failed",limitations:[...context.recipe(run).blockedPromotionReasons,...verifierBlockers]});});
        context.change(run,task,value=>{const current=value.candidates.find(c=>c.id===candidate.id)!;current.correctness=passed?"passed":"failed";current.validationArtifactIds.push(artifact.id);current.blockers.push(...context.recipe(run).blockedPromotionReasons);if(!passed)current.disposition="rejected";value.metrics.validationMs+=Date.now()-started;});
        context.message(run,task,`${candidate.id} ${verifierBlockers.length?"proposal checks":"correctness"} ${passed?"passed":"failed"}. ${[...context.recipe(run).blockedPromotionReasons,...verifierBlockers].join(" ")}`,"validation",[artifact.id]);
      }
    }catch(error){
      if((task.kind==="investigate"||task.kind==="repair")&&workspace)await preserveSwarmInterruptedPatch({context,run,task,workspace,reason:error});
      if(task.kind==="repair")try{context.change(run,task,value=>{const candidate=value.candidates.find(candidate=>candidate.id===task.candidateId)!;candidate.disposition="rejected";candidate.blockers.push(`Bounded repair stopped: ${error instanceof Error?error.message:String(error)}`.slice(0,2_000));});}catch{/* Recovered owner retains the decision. */}
      if(task.kind==="validate"){
        const detail=error instanceof Error?error.message:String(error);
        try{context.change(run,task,value=>{const candidate=value.candidates.find(candidate=>candidate.id===task.candidateId)!;candidate.correctness="failed";candidate.disposition="rejected";candidate.blockers.push(detail.slice(0,2000));});}catch{/* A recovered attempt owns subsequent candidate state. */}
      }
      throw error;
    }finally{if(workspace)await context.remove(workspace);}
  };
}
