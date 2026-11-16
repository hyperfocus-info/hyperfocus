import { expect,test } from "bun:test";
import { mkdtemp,mkdir,rm } from "node:fs/promises";
import { resolve,join } from "node:path";
import { createSwarmRequestSchema } from "@hyperfocus/ai-core/swarm";
import { createConnectionManager,type ConnectionAdapter } from "@hyperfocus/ai-runtime/connections";
import { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import { createSwarmHttpFixture } from "./test-fixture";
import { createSwarmConnectionGate } from "./connection-gate";

test("saved launch survives coordinator restart, starts once after connection, and cancellation prevents late launch",async()=>{
  const parent=resolve(import.meta.dir,"../../../.local/connection-tests");await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,"restart-"));
  let connected=false;
  const adapter:ConnectionAdapter={descriptor:{id:"fixture",providerId:"fixture",label:"Fixture",ownerId:"host",capabilities:["compute"],authorizationScope:"Fixture",authentication:"host-managed",billingMode:"none"},
    async inspect(){return {state:connected?"ready":"disconnected",credentialSource:connected?"ambient":"missing",summary:connected?"Ready":"Authorization required"};}};
  let fixture=createSwarmHttpFixture({directory});let operations=createOperationStore(fixture.store.db,fixture.store.agentEvents);
  let manager=createConnectionManager({operations,adapters:[adapter]});
  let gate=createSwarmConnectionGate({store:fixture.store,coordinator:fixture.coordinator,connections:manager,operations,requiredIds:["fixture"],ready:async()=>({available:true})});
  try{
    const run=fixture.coordinator.create(createSwarmRequestSchema.parse({projectId:"fixture-project",requestId:crypto.randomUUID(),goal:"Fixture",repository:{revision:"a".repeat(40)},backend:"local",reviewPlan:true}));
    const waiting=await gate.start(run.id);expect(waiting.status).toBe("READY");expect(waiting.startedAt).toBeUndefined();expect(waiting.connectionWait?.connectionIds).toEqual(["fixture"]);
    await gate.close();await manager.close();await fixture.close();
    fixture=createSwarmHttpFixture({directory});operations=createOperationStore(fixture.store.db,fixture.store.agentEvents);connected=true;
    manager=createConnectionManager({operations,adapters:[adapter]});gate=createSwarmConnectionGate({store:fixture.store,coordinator:fixture.coordinator,connections:manager,operations,requiredIds:["fixture"],ready:async()=>({available:true})});
    await gate.drain();const started=fixture.store.get(run.id)!;expect(started.startedAt).toBeNumber();expect(started.connectionWait).toBeUndefined();
    await gate.drain();expect(fixture.store.get(run.id)?.startedAt).toBe(started.startedAt);expect(operations.pending("swarm.start")).toHaveLength(0);
    connected=false;await manager.inspect("fixture",true);
    const cancelled=fixture.coordinator.create({...run.request,requestId:crypto.randomUUID()});await gate.start(cancelled.id);fixture.coordinator.cancel(cancelled.id);
    connected=true;await manager.inspect("fixture",true);await gate.drain();expect(fixture.store.get(cancelled.id)?.status).toBe("CANCELLED");expect(fixture.store.get(cancelled.id)?.startedAt).toBeUndefined();
  }finally{await gate.close();await manager.close();await fixture.close();await rm(directory,{recursive:true,force:true});}
});

test("readiness failures stay visible and an expired asynchronous admission cannot launch",async()=>{
  const parent=resolve(import.meta.dir,"../../../.local/connection-tests");await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,"deadline-"));
  const fixture=createSwarmHttpFixture({directory}),operations=createOperationStore(fixture.store.db,fixture.store.agentEvents);
  const manager=createConnectionManager({operations,adapters:[]});let now=Date.now(),attempt=0;
  const gate=createSwarmConnectionGate({store:fixture.store,coordinator:fixture.coordinator,connections:manager,operations,requiredIds:[],now:()=>now,
    ready:async()=>{if(++attempt===1)return {available:false,reason:"Artifact round-trip failed."};now+=960000;return {available:true};}});
  try{
    const run=fixture.coordinator.create(createSwarmRequestSchema.parse({projectId:"fixture-project",requestId:crypto.randomUUID(),goal:"Fixture",repository:{revision:"a".repeat(40)},backend:"local",reviewPlan:true}));
    const waiting=await gate.start(run.id);expect(waiting.connectionWait?.reason).toBe("Artifact round-trip failed.");
    await gate.drain();expect(fixture.store.get(run.id)?.startedAt).toBeUndefined();
    await gate.drain();expect(operations.pending("swarm.start")).toHaveLength(0);expect(fixture.store.get(run.id)?.reason).toContain("expired");
  }finally{await gate.close();await manager.close();await fixture.close();await rm(directory,{recursive:true,force:true});}
});
