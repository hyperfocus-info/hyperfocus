import type { Database } from "bun:sqlite";
import { durableOperationSchema,type DurableOperation } from "@hyperfocus/ai-core/connections";
import type { createAgentEventStore } from "./agent-events";

export const operationTerminal=(state:DurableOperation["state"])=>["succeeded","failed","cancelled"].includes(state);
/** State and notification commit together. Input carries references, never credentials or arbitrary commands. */
export function createOperationStore(db:Database,events:ReturnType<typeof createAgentEventStore>,now=Date.now){
  db.exec(`CREATE TABLE IF NOT EXISTS host_operations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,request_id TEXT NOT NULL,
    kind TEXT NOT NULL,subject_id TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(project_id,kind,request_id));`);
  function get(id:string){const row=db.query<{data:string},[string]>("SELECT data FROM host_operations WHERE id=?").get(id);return row?durableOperationSchema.parse(JSON.parse(row.data)):undefined;}
  function save(input:DurableOperation){
    const value=durableOperationSchema.parse(input);
    if(value.state!=="action_required")delete value.action;
    db.query("INSERT INTO host_operations VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data")
      .run(value.id,value.projectId,value.requestId,value.kind,value.subject.id,value.state,JSON.stringify(value));
    const recipient={projectId:value.projectId,recipientId:value.recipientId};
    events.subscribe(recipient,{type:"operation",id:value.id});
    events.publish({schema:"hyperfocus-agent-event-v1",id:`operation:${value.id}:${value.version}`,projectId:value.projectId,
      subject:{type:"operation",id:value.id},kind:`operation.${value.state}`,occurredAt:value.updatedAt,summary:value.summary,
      ...operationTerminal(value.state)?{}:{terminal:false},
      resultPath:`/api/connections/v1/operations/${value.id}`,artifacts:[]});
    return value;
  }
  function create(input:Pick<DurableOperation,"requestId"|"projectId"|"recipientId"|"kind"|"subject"|"summary"|"deadlineAt">){return db.transaction(()=>{
    const row=db.query<{id:string},[string,string,string]>("SELECT id FROM host_operations WHERE project_id=? AND kind=? AND request_id=?").get(input.projectId,input.kind,input.requestId);
    if(row){const prior=get(row.id)!;if(prior.subject.id!==input.subject.id||prior.subject.type!==input.subject.type||prior.recipientId!==input.recipientId)throw Error("Operation idempotency key belongs to another request.");return prior;}
    return save({...input,id:crypto.randomUUID(),state:"pending",createdAt:now(),updatedAt:now(),version:0});
  }).immediate();}
  function update(id:string,change:Pick<DurableOperation,"state"|"summary">&{action?:DurableOperation["action"]}){return db.transaction(()=>{
    const prior=get(id);if(!prior)throw Error("Unknown operation.");
    if(operationTerminal(prior.state))return prior;
    return save({...prior,...change,version:prior.version+1,updatedAt:Math.max(now(),prior.updatedAt+1)});
  }).immediate();}
  function pending(kind?:string){return db.query<{data:string},[]>("SELECT data FROM host_operations WHERE state NOT IN ('succeeded','failed','cancelled') ORDER BY rowid")
    .all().map(row=>durableOperationSchema.parse(JSON.parse(row.data))).filter(value=>!kind||value.kind===kind);}
  return {create,get,update,pending};
}
