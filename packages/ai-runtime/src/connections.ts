import { connectionSchema,connectionRequestSchema,type Connection,type DurableOperation } from "@hyperfocus/ai-core/connections";
import { operationTerminal,type createOperationStore } from "./operations";

export type ConnectionStatus=Pick<Connection,"state"|"summary"|"credentialSource">;
export interface ConnectionAdapter {
  descriptor:Omit<Connection,"state"|"summary"|"checkedAt"|"operation"|"credentialSource"|"canConnect"|"canRevoke">;
  inspect(signal:AbortSignal):Promise<ConnectionStatus>;
  connect?(input:{signal:AbortSignal;onAction:(action:NonNullable<DurableOperation["action"]>)=>void}):Promise<void>;
  revoke?(signal:AbortSignal):Promise<void>;
}
/** One host owns provider sessions. Browser disconnect only releases observation, never authentication. */
export function createConnectionManager(options:{adapters:ConnectionAdapter[];operations:ReturnType<typeof createOperationStore>;now?:()=>number;onChange?:()=>void}){
  const now=options.now??Date.now,adapters=new Map(options.adapters.map(value=>[value.descriptor.id,value]));
  const active=new Map<string,{operationId:string;controller:AbortController;done:Promise<void>}>();
  const cache=new Map<string,Connection>();let closed=false;
  const listeners=new Set<()=>void>();
  function adapter(id:string){const value=adapters.get(id);if(!value)throw Error("Unknown connection.");return value;}
  function describe(id:string,status:ConnectionStatus,operation?:DurableOperation){
    const value=adapter(id);const result=connectionSchema.parse({...value.descriptor,...status,checkedAt:now(),canConnect:Boolean(value.connect),canRevoke:Boolean(value.revoke),operation});
    cache.set(id,result);options.onChange?.();for(const listener of listeners)listener();return result;
  }
  async function inspect(id:string,refresh=false):Promise<Connection>{
    const value=adapter(id),worker=active.get(id),cached=cache.get(id);
    if(worker&&cached)return {...cached,operation:options.operations.get(worker.operationId)};
    if(cached&&!refresh&&now()-cached.checkedAt<30000)return cached;
    let status:ConnectionStatus;
    try{status=await value.inspect(AbortSignal.timeout(20000));}
    catch{status={state:"unavailable",credentialSource:cached?.credentialSource??"missing",summary:"Connection check failed. Retry when the provider is reachable."};}
    return describe(id,status,cached?.operation);
  }
  function connect(id:string,input:unknown){
    if(closed)throw Error("Connection host is stopping.");
    const value=adapter(id);if(!value.connect)throw Error("This connection is managed by the host; interactive sign-in is unavailable.");
    const request=connectionRequestSchema.parse(input),existing=active.get(id);
    if(existing){const current=options.operations.get(existing.operationId)!;
      if(current.projectId!==request.projectId||current.recipientId!==request.recipientId)throw Error("Another authorized session is already connecting this provider.");return current;}
    const operation=options.operations.create({...request,kind:"connection.connect",subject:{type:"connection",id},summary:`Connecting ${value.descriptor.label}.`,deadlineAt:now()+900000});
    if(operationTerminal(operation.state))return operation;
    const controller=new AbortController();
    const running=options.operations.update(operation.id,{state:"running",summary:`Connecting ${value.descriptor.label}.`});
    describe(id,{state:"connecting",summary:running.summary,credentialSource:"missing"},running);
    const worker={operationId:operation.id,controller,done:Promise.resolve()};active.set(id,worker);
    worker.done=(async()=>{
      const timer=setTimeout(()=>controller.abort(Error("Sign-in deadline reached.")),Math.max(1,operation.deadlineAt-now()));
      try{
        await value.connect!({signal:controller.signal,onAction:action=>{
          if(controller.signal.aborted)return;
          const next=options.operations.update(operation.id,{state:"action_required",summary:`Authorize ${value.descriptor.label} in your browser.`,action});
          describe(id,{state:"action_required",summary:next.summary,credentialSource:"missing"},next);
        }});
        controller.signal.throwIfAborted();
        const status=await value.inspect(controller.signal);
        if(!["ready","unavailable"].includes(status.state)||status.credentialSource==="missing")throw Error("Provider did not verify the connection.");
        const next=options.operations.update(operation.id,{state:"succeeded",summary:`${value.descriptor.label} authentication verified. ${status.summary}`});
        describe(id,status,next);
      }catch{
        const current=options.operations.get(operation.id)!;
        const next=operationTerminal(current.state)?current:options.operations.update(operation.id,{state:"failed",summary:controller.signal.aborted?"Sign-in stopped or expired. Connect again to retry.":"Sign-in failed. Check the provider settings and connect again."});
        describe(id,{state:"disconnected",summary:next.summary,credentialSource:"missing"},next);
      }finally{clearTimeout(timer);active.delete(id);options.onChange?.();}
    })();
    return running;
  }
  async function cancel(id:string){
    adapter(id);const worker=active.get(id);if(!worker)return;
    options.operations.update(worker.operationId,{state:"cancelled",summary:"Sign-in cancelled by the owner."});
    worker.controller.abort(Error("Sign-in cancelled."));await worker.done;
  }
  async function revoke(id:string){const value=adapter(id);if(!value.revoke)throw Error("Revoke this host-managed credential at its provider.");await cancel(id);await value.revoke(AbortSignal.timeout(20000));cache.delete(id);return inspect(id,true);}
  async function recover(){
    for(const operation of options.operations.pending("connection.connect")){
      const value=adapters.get(operation.subject.id);if(!value)continue;
      const status=await inspect(value.descriptor.id,true);
      const ready=status.credentialSource!=="missing"&&["ready","unavailable"].includes(status.state);
      const next=options.operations.update(operation.id,{state:ready?"succeeded":"failed",summary:ready?"Connection verified after host restart.":"Host restarted during sign-in. Connect again; waiting work remains saved."});
      describe(value.descriptor.id,status,next);
    }
  }
  return {inspect,connect,cancel,revoke,recover,has:(id:string)=>adapters.has(id),
    subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
    async list(){return Promise.all([...adapters.keys()].map(id=>inspect(id)));},
    async close(){closed=true;for(const worker of active.values())worker.controller.abort(Error("Host stopping."));await Promise.all([...active.values()].map(worker=>worker.done));},
  };
}
