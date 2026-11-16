import {expect,test} from "bun:test";
import {runnerFixture} from "./runner-test-fixture";
import {preserveSwarmInterruptedPatch} from "./failure-evidence";
import {deferred} from "../test-fixtures";
import {swarmPatchByteLimit} from "./patch-transfer";

test("cancelling a running implementation retains its unvalidated patch before destroying compute",async()=>{
 const fixture=await runnerFixture();
 try{
  const execute=fixture.provider.execute;
  fixture.provider.execute=async input=>{const value=await execute(input);if(input.task.command==="produce-candidate-1"){input.onOutput?.({stream:"stdout",text:"Useful interrupted result\nAuthorization: Bearer synthetic-"});input.onOutput?.({stream:"stderr",text:"private-key-material\n"});fixture.coordinator.cancel(fixture.run.id);throw Error("SIMULATED cancellation after editing");}return value;};
  await fixture.coordinator.drain();const run=fixture.store.get(fixture.run.id)!;
  expect(run.status).toBe("CANCELLED");expect(run.artifacts.some(item=>item.name.endsWith("-partial.patch"))).toBe(true);
  expect(run.candidates.every(candidate=>!candidate.patchArtifactId)).toBe(true);expect(fixture.workspaces.size).toBe(0);
  const report=run.artifacts.find(item=>item.name.startsWith("candidate-1-")&&item.name.endsWith("-partial.json"))!;
  const detail=JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({sha256:report.sha256})));expect(detail.promotable).toBe(false);expect(detail.reason).toContain("SIMULATED cancellation");
  expect(detail.status).toBe("UNVALIDATED_INTERRUPTED_EVIDENCE");expect(detail.investigation.scope).toMatchObject({goal:run.request.goal,doneCriteria:run.request.doneCriteria});expect(detail.investigation.executedCommands.length).toBeGreaterThan(0);
  const logs=await Promise.all(run.artifacts.filter(item=>item.kind==="log").map(async item=>({id:item.id,text:new TextDecoder().decode(await fixture.artifacts.read({sha256:item.sha256}))})));
  const partial=logs.find(log=>log.text.includes("Useful interrupted result"));expect(partial).toBeDefined();expect(partial?.text).not.toContain("synthetic-private-key-material");expect(partial?.text).toContain("[redacted");
  expect(run.messages.some(message=>message.kind==="validation"&&message.artifactIds.includes(partial!.id))).toBe(true);
 }finally{await fixture.close();}
});
test("model budget interruption preserves evidence without promoting the incomplete patch",async()=>{
 const fixture=await runnerFixture();
 try{
  fixture.store.change(fixture.run.id,run=>{run.request.budget.maxCallsPerAgent=1;});
  await fixture.coordinator.drain();const run=fixture.store.get(fixture.run.id)!;
  expect(run.status).toBe("AWAITING_APPROVAL");expect(run.budgetExhausted).toBe(false);expect(run.budgetRejection?.scope).toBe("task");
  expect(run.artifacts.some(item=>item.name.endsWith("-partial.patch"))).toBe(true);
  expect(run.candidates.every(candidate=>!candidate.patchArtifactId)).toBe(true);expect(fixture.workspaces.size).toBe(0);
 }finally{await fixture.close();}
});
async function interruptedFixture(){const fixture=await runnerFixture({maxRetries:1}),signal=new AbortController().signal,baseline=fixture.claim()!;await fixture.context.workspace(fixture.run,baseline,signal);fixture.finish(baseline);const task=fixture.claim()!,workspace=await fixture.context.fork(fixture.run,task,signal);return{...fixture,task,workspace};}

test("timeout recovery retains bounded findings and exact command receipts without inference or completion",async()=>{
 const fixture=await interruptedFixture();
 try{
  await fixture.context.execute(fixture.run,fixture.task,fixture.workspace,"verify-fixture",new AbortController().signal);
  fixture.context.message(fixture.run,fixture.task,"Observed cause: "+"x".repeat(5000),"evidence");
  const before=fixture.store.get(fixture.run.id)!.metrics.modelCalls;
  expect(await preserveSwarmInterruptedPatch({...fixture,reason:Error("TASK_TIMED_OUT")})).toBe(true);
  const run=fixture.store.get(fixture.run.id)!,artifact=run.artifacts.find(value=>value.name.endsWith("-partial.json"))!;
  const report=JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({sha256:artifact.sha256})));
  expect(report).toMatchObject({status:"UNVALIDATED_INTERRUPTED_EVIDENCE",promotable:false,reason:"TASK_TIMED_OUT",investigation:{sourceRevision:run.request.repository.revision,taskId:fixture.task.id}});
  expect(report.investigation.findings.at(-1).text.length).toBeLessThan(900);expect(report.investigation.executedCommands.at(-1)).toMatchObject({exitCode:0,status:"returned"});
  expect(run.metrics.modelCalls).toBe(before);expect(run.tasks.find(task=>task.id===fixture.task.id)?.status).toBe("RUNNING");expect(run.candidates.every(candidate=>!candidate.patchArtifactId)).toBe(true);
 }finally{await fixture.close();}
});

test("an explicit implementation checkpoint preserves bytes without promoting or stopping its worker",async()=>{
 const fixture=await interruptedFixture();
 try{
  await fixture.context.execute(fixture.run,fixture.task,fixture.workspace,"produce-candidate-1",new AbortController().signal);
  expect(await preserveSwarmInterruptedPatch({...fixture,reason:"Checkpoint",checkpoint:true})).toBe(true);
  const run=fixture.store.get(fixture.run.id)!;
  expect(run.tasks.find(task=>task.id===fixture.task.id)?.status).toBe("RUNNING");
  expect(run.candidates.every(candidate=>!candidate.patchArtifactId)).toBe(true);
  expect(run.artifacts.some(artifact=>artifact.name.endsWith("-partial.patch"))).toBe(true);
 }finally{await fixture.close();}
});
test("lease recovery fences a patch captured by the previous attempt",async()=>{
 const fixture=await interruptedFixture(),began=deferred(),release=deferred();
 try{
  const capture=fixture.provider.captureArtifacts;
  fixture.provider.captureArtifacts=async input=>{began.resolve();await release.promise;return capture(input);};
  const saving=preserveSwarmInterruptedPatch({...fixture,reason:Error("interrupted")});await began.promise;
  fixture.store.change(fixture.run.id,run=>{run.tasks.find(task=>task.id===fixture.task.id)!.leaseUntil=Date.now()-1;});fixture.store.recover();release.resolve();
  expect(await saving).toBe(false);expect(fixture.store.get(fixture.run.id)!.artifacts.some(item=>item.name.includes("-partial"))).toBe(false);
 }finally{release.resolve();fixture.coordinator.cancel(fixture.run.id);await fixture.close();}
});
test("partial patch capture has an independent bounded timeout and records the missing evidence",async()=>{
 const fixture=await interruptedFixture();let aborted=false;
 try{
  fixture.provider.captureArtifacts=async({signal})=>new Promise((_,reject)=>signal?.addEventListener("abort",()=>{aborted=true;reject(signal.reason);},{once:true}));
  expect(await preserveSwarmInterruptedPatch({...fixture,reason:Error("cancelled"),timeoutMs:10})).toBe(true);
  expect(aborted).toBe(true);const run=fixture.store.get(fixture.run.id)!;
  expect(run.artifacts.some(item=>item.name.endsWith("-partial.patch"))).toBe(false);
  expect(run.messages.some(message=>message.text.includes("capture timed out"))).toBe(true);
 }finally{fixture.coordinator.cancel(fixture.run.id);await fixture.close();}
});
test("oversized unfinished patches leave a report instead of silently truncating promotable code",async()=>{
 const fixture=await interruptedFixture();
 try{
  fixture.provider.captureArtifacts=async()=>[{name:"candidate.patch",mediaType:"text/x-diff",sha256:"a".repeat(64),bytes:new Uint8Array(swarmPatchByteLimit+1)}];
  expect(await preserveSwarmInterruptedPatch({...fixture,reason:Error("budget")})).toBe(true);const run=fixture.store.get(fixture.run.id)!;
  expect(run.artifacts.some(item=>item.name.endsWith("-partial.patch"))).toBe(false);expect(run.messages.some(message=>message.text.includes(`exceeded the ${swarmPatchByteLimit}-byte`))).toBe(true);
 }finally{fixture.coordinator.cancel(fixture.run.id);await fixture.close();}
});
