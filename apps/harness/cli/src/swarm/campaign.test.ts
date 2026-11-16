import { expect,test } from "bun:test";
import { outcomeFixture } from "./outcome/test-fixture";
import { advanceSwarmCampaign } from "./campaign";
import { createSwarmStore,transitionSwarm } from "./persistence/store";
import { createSwarmCoordinator } from "./coordinator";
import { executionFixture,swarmFixture } from "./test-fixtures";
import { swarmModelDeadline } from "./reasoning/model-turn";

test("a campaign stops early only when independent outcome evidence is demonstrated",async()=>{
  const fixture=await outcomeFixture({campaignRounds:3});
  try{await fixture.coordinator.drain();const run=fixture.current();expect(run.status).toBe("AWAITING_APPROVAL");
    expect(run.outcome?.outcomeSuccess).toBe("demonstrated");expect(run.completion?.status).toBe("met");
    expect(run.campaign?.round).toBe(1);expect(fixture.store.workspaces()).toHaveLength(0);
  }finally{await fixture.close();}
});

test("finalization time is reserved from exploratory work while independent review remains admissible",()=>{
  const fixture=swarmFixture();
  try{
    fixture.finish(fixture.claim()!);
    fixture.store.change(fixture.run.id,run=>{run.campaign={round:1,finalizationReserveMs:60000,rounds:[{number:1,candidateIds:run.candidates.map(c=>c.id),compareTaskId:run.tasks.at(-1)!.id,startedAt:run.createdAt}]};
      run.startedAt=Date.now()-run.request.budget.maxDurationMs+30000;});
    const run=fixture.store.get(fixture.run.id)!;
    expect(swarmModelDeadline(run,run.tasks.find(t=>t.kind==="investigate")!)).toBeLessThan(Date.now());
    const task=fixture.claim()!;expect(["review","compare","benchmark"]).toContain(task.kind);
    expect(fixture.store.get(run.id)!.tasks.filter(t=>t.kind==="investigate").every(t=>t.status==="BLOCKED")).toBe(true);
  }finally{fixture.db.close();}
});

test("campaign rejects a hypothesis then selects another round without relaunch or ledger reset",async()=>{
  const fixture=await outcomeFixture({campaignRounds:2,observed:false});
  try {
    const started=fixture.current().startedAt;
    await fixture.coordinator.drain();
    const run=fixture.current();
    expect(run.campaign?.round).toBe(2);
    expect(run.status).toBe("BLOCKED");expect(run.reason).toContain("iteration budget");
    expect(run.tasks.filter(task=>task.kind==="baseline")).toHaveLength(1);
    expect(run.outcome?.hypotheses.map(hypothesis=>hypothesis.experiment.instrumentId)).toEqual(["probe-1","probe-2"]);
    expect(run.tasks.filter(task=>task.kind==="experiment"&&task.artifactIds.length)).toHaveLength(2);
    expect(run.startedAt).toBe(started);expect(run.metrics.modelCalls).toBeGreaterThan(2);
    const reopened=createSwarmStore({db:fixture.db}).get(run.id)!;
    expect(reopened.campaign).toEqual(run.campaign);expect(reopened.metrics).toEqual(run.metrics);
    const count=reopened.tasks.length;
    expect(advanceSwarmCampaign(reopened,reopened.tasks.find(task=>task.kind==="compare")!,fixture.instruments)).toBe(true);
    expect(reopened.tasks).toHaveLength(count);
    expect(fixture.store.workspaces()).toHaveLength(0);
  } finally {await fixture.close();}
});

test("task budget failure does not retry the exhausted worker or cancel siblings",async()=>{
  const fixture=swarmFixture(),execution=executionFixture();
  const coordinator=createSwarmCoordinator({store:fixture.store,provider:execution.provider,computeUsdPerTask:0,handleTask:async({run,task})=>{
    if(task.kind==="investigate"&&task.candidateId==="candidate-1")fixture.store.reserveModel(run.id,task.id,run.request.budget.maxTokensPerAgent+1,0);
    if(task.kind==="compare")fixture.store.change(run.id,value=>transitionSwarm(value,"AWAITING_APPROVAL"));
  }});
  try {
    await coordinator.drain();const run=fixture.store.get(fixture.run.id)!;
    expect(run.status).toBe("AWAITING_APPROVAL");
    expect(run.tasks.find(task=>task.kind==="investigate"&&task.candidateId==="candidate-1")).toMatchObject({status:"FAILED",attempt:1});
    expect(run.tasks.filter(task=>task.kind==="investigate"&&task.candidateId!=="candidate-1").every(task=>task.status==="SUCCEEDED")).toBe(true);
    expect(run.budgetRejection?.scope).toBe("task");
  } finally {await coordinator.close();fixture.db.close();}
});
