import { expect,test } from "bun:test";
import { Database } from "bun:sqlite";
import { createAgentEventStore } from "./agent-events";
import { createOperationStore } from "./operations";
import { createConnectionManager,type ConnectionAdapter } from "./connections";

function fixture(){
  let connected=false,starts=0,complete=()=>{};
  const adapter:ConnectionAdapter={descriptor:{id:"fixture",providerId:"fixture",label:"Fixture",ownerId:"host",capabilities:["inference"],authorizationScope:"Fixture only",authentication:"device-code",billingMode:"subscription"},
    async inspect(){return {state:connected?"ready":"disconnected",credentialSource:connected?"ambient":"missing",summary:connected?"Verified":"Connect first"};},
    async connect({signal,onAction}){starts++;onAction({kind:"device-code",verificationUrl:"https://auth.example.test/device",userCode:"FIXTURE-ONLY",expiresAt:Date.now()+60000});
      await new Promise<void>((resolve,reject)=>{complete=()=>{signal.removeEventListener("abort",abort);connected=true;resolve();};const abort=()=>reject(Error("Cancelled"));signal.addEventListener("abort",abort,{once:true});});},
    async revoke(){connected=false;}};
  return {adapter,complete:()=>complete(),get starts(){return starts;}};
}
const recipient={projectId:"project",recipientId:"thread"};
const input={projectId:"project",recipientId:"thread",requestId:"connect-1"};
test("device sign-in survives observer disconnect, deduplicates delivery and sends credential-free events",async()=>{
  const db=new Database(":memory:"),events=createAgentEventStore(db),operations=createOperationStore(db,events),provider=fixture();
  const manager=createConnectionManager({operations,adapters:[provider.adapter]});
  try{
    const operation=manager.connect("fixture",input);expect(manager.connect("fixture",input).id).toBe(operation.id);expect(provider.starts).toBe(1);
    expect((await manager.inspect("fixture")).operation?.action?.userCode).toBe("FIXTURE-ONLY");
    const inbox=events.resume(recipient);expect(JSON.stringify(inbox)).not.toContain("FIXTURE-ONLY");
    for(const event of inbox.events)events.acknowledge(recipient,event.id);
    const controller=new AbortController(),disconnected=events.wait(recipient,{timeoutMs:1000,signal:controller.signal});controller.abort();await expect(disconnected).rejects.toBeDefined();
    const callback=events.wait(recipient,{timeoutMs:1000});provider.complete();
    expect((await callback).events.some(event=>event.kind==="operation.succeeded")).toBe(true);
    expect(operations.get(operation.id)?.action).toBeUndefined();expect((await manager.inspect("fixture")).state).toBe("ready");
    await manager.revoke("fixture");expect((await manager.inspect("fixture")).state).toBe("disconnected");
  }finally{await manager.close();db.close();}
});
test("restart reconciles persisted sign-in without trusting a stale code or launching another login",async()=>{
  const db=new Database(":memory:"),events=createAgentEventStore(db),operations=createOperationStore(db,events);
  const op=operations.create({...input,kind:"connection.connect",subject:{type:"connection",id:"fixture"},summary:"Waiting",deadlineAt:Date.now()+60000});
  operations.update(op.id,{state:"action_required",summary:"Authorize",action:{kind:"device-code",verificationUrl:"https://auth.example.test/device",userCode:"OLD-CODE",expiresAt:Date.now()+60000}});
  const restored=Database.deserialize(db.serialize()),provider=fixture(),recovered=createOperationStore(restored,createAgentEventStore(restored));
  const manager=createConnectionManager({operations:recovered,adapters:[provider.adapter]});
  try{await manager.recover();expect(recovered.get(op.id)?.state).toBe("failed");expect(recovered.get(op.id)?.action).toBeUndefined();expect(provider.starts).toBe(0);
    expect(createAgentEventStore(restored).resume(recipient).events.some(value=>value.kind==="operation.failed")).toBe(true);
  }finally{await manager.close();restored.close();db.close();}
});
test("cancel settles the owned process and late completion cannot mark the operation successful",async()=>{
  const db=new Database(":memory:"),provider=fixture(),operations=createOperationStore(db,createAgentEventStore(db));
  const manager=createConnectionManager({operations,adapters:[provider.adapter]});
  try{const operation=manager.connect("fixture",input);await manager.cancel("fixture");provider.complete();await Promise.resolve();
    expect(operations.get(operation.id)?.state).toBe("cancelled");expect((await manager.inspect("fixture")).state).toBe("disconnected");
  }finally{await manager.close();db.close();}
});
