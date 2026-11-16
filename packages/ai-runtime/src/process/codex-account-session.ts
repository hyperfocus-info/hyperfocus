import { spawnBackgroundProcess,terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { codexSubscriptionEnvironment } from "./codex-account";

/** Bounded official account RPC transport. No tools, turns, API keys or raw provider errors. */
export async function openCodexAccountSession(options:{executable:string;codexHome:string;signal:AbortSignal;cwd?:string;env?:NodeJS.ProcessEnv;
  onNotification?:(method:string,params:unknown)=>void}){
  options.signal.throwIfAborted();
  const child=spawnBackgroundProcess({cmd:[options.executable,"app-server","--stdio","-c",'forced_login_method="chatgpt"',"-c",'cli_auth_credentials_store="file"'],
    cwd:options.cwd,env:codexSubscriptionEnvironment(options.codexHome,options.env),stdin:"pipe",stdout:"pipe",stderr:"ignore"});
  let sequence=0,closed=false,failure:Error|undefined;
  const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const fail=(error:Error)=>{failure=error;for(const value of pending.values()){clearTimeout(value.timer);value.reject(error);}pending.clear();};
  const abort=()=>{fail(Error("Codex authentication stopped."));void terminateProcessTree({process:child}).catch(()=>{});};
  options.signal.addEventListener("abort",abort,{once:true});
  const reading=(async()=>{
    let buffer="";const decoder=new TextDecoder();
    for await(const bytes of child.stdout){
      buffer+=decoder.decode(bytes,{stream:true});if(buffer.length>262144)throw Error("Codex account response exceeds limit.");
      let end:number;while((end=buffer.indexOf("\n"))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
        const value=JSON.parse(line);
        if(value.method&&value.id!==undefined)throw Error("Unexpected request during authentication.");
        if(typeof value.method==="string")options.onNotification?.(value.method,value.params);
        const waiter=pending.get(value.id);if(!waiter)continue;
        pending.delete(value.id);clearTimeout(waiter.timer);
        if(value.error)waiter.reject(Error("Codex rejected the authentication operation."));else waiter.resolve(value.result);
      }
    }
    if(!closed)throw Error("Codex account session disconnected.");
  })().catch(()=>{fail(Error("Codex account session disconnected."));void terminateProcessTree({process:child}).catch(()=>{});});
  function request(method:string,params:unknown={}){
    return new Promise<unknown>((resolve,reject)=>{
      if(failure||closed){reject(failure??Error("Codex account session closed."));return;}
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error("Codex account request timed out."));},20000);
      pending.set(id,{resolve,reject,timer});
      try{child.stdin.write(JSON.stringify({id,method,params})+"\n");}catch{clearTimeout(timer);pending.delete(id);reject(Error("Codex account request failed."));}
    });
  }
  async function close(){if(closed)return;closed=true;options.signal.removeEventListener("abort",abort);fail(Error("Codex account session closed."));await terminateProcessTree({process:child});await reading;await child.exited;}
  try{
    await request("initialize",{clientInfo:{name:"hyperfocus_connections",version:"1.0.0"},capabilities:{experimentalApi:false}});
    child.stdin.write(JSON.stringify({method:"initialized"})+"\n");
    return {request,close,exited:child.exited};
  }catch(error){await close();throw error;}
}
