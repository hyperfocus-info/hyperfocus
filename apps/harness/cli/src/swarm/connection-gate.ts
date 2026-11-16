import type { createConnectionManager } from "@hyperfocus/ai-runtime/connections";
import type { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import type { SwarmStore } from "./persistence/store";
import type { SwarmCoordinator } from "./coordinator";

/** A durable launch intent. Only this cloud owner starts work after required connections become ready. */
export function createSwarmConnectionGate(options:{store:SwarmStore;coordinator:SwarmCoordinator;
  connections:ReturnType<typeof createConnectionManager>;operations:ReturnType<typeof createOperationStore>;
  requiredIds:string[];ready:()=>Promise<{available:boolean;reason?:string}>;now?:()=>number}){
  const now=options.now??Date.now;let draining:Promise<void>|undefined,closed=false;
  async function dispatch(){
    for(const operation of options.operations.pending("swarm.start")){
      if(closed)return;
      const run=options.store.get(operation.subject.id);
      if(!run||!["READY","RUNNING"].includes(run.status)){
        options.operations.update(operation.id,{state:"cancelled",summary:"Campaign launch no longer requested."});continue;
      }
      if(run.status==="RUNNING"){
        options.operations.update(operation.id,{state:"succeeded",summary:"Cloud campaign launch recovered."});continue;
      }
      if(now()>=operation.deadlineAt){
        options.operations.update(operation.id,{state:"failed",summary:"Connection wait expired. Review the saved plan before launching again."});
        options.store.change(run.id,value=>{delete value.connectionWait;value.reason="Connection wait expired; no workers were started.";});continue;
      }
      const connections=await Promise.all(options.requiredIds.map(id=>options.connections.inspect(id)));
      const missing=connections.filter(value=>value.state!=="ready");
      if(missing.length){
        const reason=missing.map(value=>`${value.label}: ${value.summary}`).join(" ").slice(0,2000);
        if(run.connectionWait?.reason!==reason)options.store.change(run.id,value=>{
          if(value.status!=="READY")return;value.connectionWait={operationId:operation.id,connectionIds:missing.map(value=>value.id),reason,deadlineAt:operation.deadlineAt};value.reason=reason;
        });continue;
      }
      const ready=await options.ready();
      if(!ready.available){
        const reason=ready.reason??"Remote execution readiness is unavailable.";
        if(run.connectionWait?.reason!==reason)options.store.change(run.id,value=>{if(value.status!=="READY")return;
          value.connectionWait={operationId:operation.id,connectionIds:[],reason,deadlineAt:operation.deadlineAt};value.reason=reason;});continue;
      }
      // Readiness may await provider I/O. Never launch on a stale admission result.
      if(closed||now()>=operation.deadlineAt||options.operations.get(operation.id)?.state==="cancelled")continue;
      options.store.db.transaction(()=>{
        const current=options.store.get(run.id);if(current?.status!=="READY")return;
        options.store.change(run.id,value=>{delete value.connectionWait;delete value.reason;});
        options.coordinator.start(run.id);
        options.operations.update(operation.id,{state:"succeeded",summary:"Required connections verified. The cloud campaign has started."});
      }).immediate();
    }
  }
  function drain(){if(closed)return Promise.resolve();return draining??=dispatch().finally(()=>{draining=undefined;});}
  async function start(id:string){
    const run=options.store.get(id);if(!run)throw Error("Unknown campaign.");if(run.status!=="READY")throw Error("Campaign is not ready to launch.");
    const pending=options.operations.pending("swarm.start").find(value=>value.subject.id===id);
    if(!pending)options.operations.create({requestId:`start:${id}:${crypto.randomUUID()}`,projectId:run.request.projectId,
      recipientId:run.request.agentRecipientId??run.request.requestId,kind:"swarm.start",subject:{type:"swarm",id},
      summary:"Launch requested. Waiting for required remote connections.",deadlineAt:now()+900000});
    await drain();return options.store.get(id)!;
  }
  const unsubscribe=options.connections.subscribe(()=>{void drain().catch(()=>{});});
  const timer=setInterval(()=>{void drain().catch(()=>{});},1000);
  return {start,drain,async close(){closed=true;clearInterval(timer);unsubscribe();await draining;}};
}
