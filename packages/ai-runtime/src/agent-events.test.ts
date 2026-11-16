import { Database } from "bun:sqlite";
import { expect,test } from "bun:test";
import { createAgentEventStore } from "./agent-events";
import type { AgentEvent } from "@hyperfocus/ai-core/agent-events";
const recipient={projectId:"project",recipientId:"thread-1"};
const subject={type:"swarm",id:"run-1"};
const event:AgentEvent={schema:"hyperfocus-agent-event-v1",id:"result-1",projectId:"project",subject,kind:"swarm.result.ready",
  occurredAt:1,summary:"Independent checks passed; human integration is pending.",resultPath:"/api/swarm/v1/runs/run-1",artifacts:[]};

test("offline result survives serialized storage, replays until acknowledged, and isolates recipients",async()=>{
  const db=new Database(":memory:"),store=createAgentEventStore(db);let reopened:Database|undefined;
  try{
    store.subscribe(recipient,subject);expect(store.resume(recipient).waiting).toEqual([subject]);
    store.publish(event);store.publish(event);
    reopened=Database.deserialize(db.serialize());const recovered=createAgentEventStore(reopened);
    expect(recovered.resume(recipient).events).toEqual([event]);expect(recovered.resume(recipient).events).toEqual([event]);
    expect(recovered.resume({...recipient,recipientId:"other"}).events).toEqual([]);
    expect(()=>recovered.acknowledge({...recipient,projectId:"other"},event.id)).toThrow("outside");
    recovered.acknowledge(recipient,event.id);recovered.acknowledge(recipient,event.id);
    expect(recovered.resume(recipient).events).toEqual([]);
    expect(()=>recovered.publish({...event,summary:"Different evidence"})).toThrow("reused");
  }finally{reopened?.close();db.close();}
});

test("native wait wakes on commit, abort releases listener, and rollback cannot publish phantom evidence",async()=>{
  const db=new Database(":memory:"),store=createAgentEventStore(db);
  try{
    store.subscribe(recipient,subject);
    const cancellation=new AbortController();const abandoned=store.wait(recipient,{timeoutMs:1000,signal:cancellation.signal});
    cancellation.abort();await expect(abandoned).rejects.toThrow();expect(store.waitingConnections).toBe(0);
    expect(()=>db.transaction(()=>{store.publish(event);throw Error("rollback");})()).toThrow("rollback");
    expect(store.resume(recipient).events).toEqual([]);
    const callback=store.wait(recipient,{timeoutMs:1000});store.publish(event);
    expect((await callback).events).toEqual([event]);expect(store.waitingConnections).toBe(0);
  }finally{db.close();}
});

test("quiet waits time out without consuming or cancelling their durable subscription",async()=>{
  const db=new Database(":memory:"),store=createAgentEventStore(db);
  try{store.subscribe(recipient,subject);expect(await store.wait(recipient,{timeoutMs:1})).toMatchObject({events:[],waiting:[subject]});
    expect(store.waitingConnections).toBe(0);store.publish(event);expect(store.resume(recipient).events).toEqual([event]);
  }finally{db.close();}
});

test("acknowledged progress remains waiting across restart until the terminal callback",async()=>{
  const db=new Database(":memory:"),store=createAgentEventStore(db);let reopened:Database|undefined;
  const progress={...event,id:"progress-1",kind:"operation.running",terminal:false};
  try{
    store.subscribe(recipient,subject);store.publish(progress);store.acknowledge(recipient,progress.id);
    reopened=Database.deserialize(db.serialize());const recovered=createAgentEventStore(reopened);
    expect(recovered.resume(recipient)).toEqual({events:[],waiting:[subject],hasMore:false});
    const callback=recovered.wait(recipient,{timeoutMs:1000});recovered.publish(event);
    expect(await callback).toEqual({events:[event],waiting:[],hasMore:false});
    recovered.acknowledge(recipient,event.id);expect(recovered.resume(recipient).waiting).toEqual([]);
  }finally{reopened?.close();db.close();}
});
