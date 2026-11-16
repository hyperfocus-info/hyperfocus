import { createHash } from "node:crypto";
import { runPairedBenchmarkLane, type BenchmarkMeasurement } from "@hyperfocus/performance/swarm";
import type { ExecutionWorkspace,SwarmRun,SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "./task-context";
import { compareBenchmarkReceipts, parseBenchmarkTrial, type BenchmarkTrial } from "./benchmark-receipt";

export async function benchmarkCandidates(options:{context:SwarmTaskContext;run:SwarmRun;task:SwarmTask;signal:AbortSignal}) {
  const {context,run,task,signal}=options;
  context.assertOwned(run,task);
  const candidates=context.store.get(run.id)!.candidates.filter(c=>c.correctness==="passed"&&c.patchArtifactId&&!c.comparison?.artifactId);
  if(!candidates.length){context.message(run,task,"No candidate passed correctness; benchmark lane was not provisioned.","validation");return;}
  const globalLease=context.store.lease("benchmark-lane",task.id,30_000);
  const heartbeat=setInterval(()=>{try{context.store.renewLease(globalLease,30_000);}catch{/* Trial lease assertions reject the next command. */}},10_000);
  let workspace:ExecutionWorkspace|undefined;
  try{
    workspace=await context.workspace(run,task,signal,"benchmark");
    const worker=workspace;const started=Date.now();
    const baselineTree=await context.execute(run,task,worker,`git rev-parse ${run.request.repository.revision}^{tree}`,signal);
    if(baselineTree.exitCode!==0||baselineTree.truncated||!/^[a-f0-9]{40,64}$/.test(baselineTree.stdout.trim()))throw Error("Immutable baseline tree could not be resolved.");
    for(const candidate of candidates){
      const patch=await context.patch(run,candidate.id);let currentSide="baseline";
      const receipts=new Map<string,BenchmarkTrial>(), requireCpuEvidence=context.recipe(run).id==="touch-of-death";
      const pairs=await runPairedBenchmarkLane({
        correctness:{passed:true,artifactIds:candidate.validationArtifactIds,blockers:[]},signal,
        leases:{
          async acquire(){context.store.assertLease(globalLease);return{resourceId:worker.id,ownerId:task.id,fence:globalLease.fence,expiresAt:Date.now()+30_000};},
          async renew(value){context.store.renewLease(globalLease,30_000);return{...value,expiresAt:Date.now()+30_000};},
          async assertHeld(){context.store.assertLease(globalLease);},async release(){context.store.assertLease(globalLease);},
        },
        async beginSession(){const result=await context.execute(run,task,worker,`git reset --hard ${run.request.repository.revision} && git clean -fd`,signal);if(result.exitCode!==0)throw Error("Benchmark reset failed.");currentSide="baseline";},
        async measure(input){
          context.store.assertLease(globalLease);
          if(currentSide!==input.side){const reset=await context.execute(run,task,worker,`git reset --hard ${run.request.repository.revision} && git clean -fd`,input.signal);if(reset.exitCode!==0)throw Error("Benchmark workspace reset failed.");if(input.side==="candidate")await context.applyPatch(run,task,worker,patch,input.signal);currentSide=input.side;}
          const expectedTree=input.side==="baseline"?baselineTree.stdout.trim():candidate.sourceTree;
          await context.verifyTree(run,task,worker,expectedTree,input.signal);
          const output=await context.execute(run,task,worker,context.recipe(run).benchmarkCommand,input.signal);
          if(output.exitCode!==0||output.timedOut||output.truncated)throw Error("Benchmark command failed or produced incomplete data.");
          const raw=await context.artifact(run,task,{name:`${candidate.id}-${input.session}-${input.pair}-${input.side}.json`,kind:"benchmark",mediaType:"application/json",bytes:output.stdout});
          await context.verifyTree(run,task,worker,expectedTree,input.signal);
          const trial=parseBenchmarkTrial({value:JSON.parse(output.stdout),requireCpuEvidence});
          receipts.set(raw.id,trial);
          const measurement:BenchmarkMeasurement={id:raw.id,sessionId:`${worker.id}-${input.session}`,sourceRevision:input.side==="baseline"?run.request.repository.revision:candidate.sourceRevision,scenario:trial.scenario,workloadHash:trial.workloadHash,metric:context.recipe(run).benchmarkMetric,unit:"ms",higherIsBetter:false,samples:trial.samples,warmupMs:trial.warmupMs,durationMs:trial.durationMs,
            environment:{workerId:worker.id,leaseFence:input.lease.fence,cpu:trial.cpuModel,runtime:trial.runtimeVersion,browser:null,fingerprint:createHash("sha256").update(`${trial.cpuModel}/${trial.platform}/${trial.architecture}/${trial.runtimeVersion}`).digest("hex"),hardwareIsolation:"shared",activeSwarmWorkloads:0},
            memory:{rssBytes:trial.memory.rssBytes,heapBytes:trial.memory.heapBytes,allocatedBytes:trial.memory.allocatedBytes??null,gcCount:trial.gc?.count??null,gcMs:trial.gc?.durationMs??null},artifactIds:[raw.id]};
          return measurement;
        },
        async persistTrial(input){await context.artifact(run,task,{name:`receipt-${input.measurement.id}.json`,kind:"benchmark",mediaType:"application/json",bytes:JSON.stringify(input)});},
      });
      const comparison=compareBenchmarkReceipts({baselineRevision:run.request.repository.revision,candidateRevision:candidate.sourceRevision,correctness:{passed:true,artifactIds:candidate.validationArtifactIds,blockers:candidate.blockers},pairs,receipts,requireCpuEvidence});
      const artifact=await context.artifact(run,task,{name:`comparison-${candidate.id}.json`,kind:"benchmark",mediaType:"application/json",bytes:JSON.stringify(comparison)});
      context.change(run,task,current=>{current.outcome?.evaluations.push({candidateId:candidate.id,kind:"performance",evaluatorId:task.agentId,method:"Exclusive alternating AB/BA trials across replicated sessions; confidence intervals, baseline drift, correctness, total CPU and tail guards.",artifactIds:[artifact.id],result:comparison.decision==="IMPROVED"?"passed":comparison.decision.includes("INCONCLUSIVE")?"inconclusive":"failed",limitations:["Railway physical CPUs are shared; this is a workload-scoped comparison.",...context.recipe(run).blockedPromotionReasons].slice(0,20)});});
      context.change(run,task,current=>{current.candidates.find(c=>c.id===candidate.id)!.comparison={decision:comparison.decision,reasons:comparison.reasons,improvementPercent:comparison.effect?.improvementPercent??null,artifactId:artifact.id};});
      context.message(run,task,`${candidate.id}: ${comparison.decision}. ${comparison.reasons.join(" ")}`,"validation",[artifact.id]);
    }
    context.change(run,task,current=>{current.metrics.benchmarkMs+=Date.now()-started;});
  }finally{clearInterval(heartbeat);if(workspace)await context.remove(workspace);context.store.releaseLease(globalLease);}
}
