import { createSignal,onCleanup,onMount,Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Button,typography } from "@hyperfocus/ui";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { ConnectionsPanel } from "@hyperfocus/ui/connections";
import { connectionSchema,type Connection } from "@hyperfocus/ai-core/connections";
import { z } from "zod";

const sessionSchema=z.object({csrfToken:z.string(),access:z.object({projectId:z.string(),recipientId:z.string(),expiresAt:z.number()})});
const styles=stylex.create({page:{padding:tokens.space4, marginInline:"auto", boxSizing:"border-box", height:"100dvh", maxWidth:"44rem", overflowY:"auto", width:"100%",},
  heading:{gap:tokens.space2, alignItems:"center", display:"flex", flexWrap:"wrap", justifyContent:"space-between",}});
const prefix="/api/connections/v1/browser";
export function PublicConnectionsPage(){
  const lifetime=new AbortController();const [session,setSession]=createSignal<z.infer<typeof sessionSchema>>();
  const [connections,setConnections]=createSignal<Connection[]>([]),[error,setError]=createSignal(""),[busy,setBusy]=createSignal(false),[live,setLive]=createSignal(false);
  let updates:AbortController|undefined;
  async function call(route:string,method="GET",body?:unknown){
    const response=await fetch(prefix+route,{method,credentials:"same-origin",signal:lifetime.signal,headers:{"content-type":"application/json",...(session()?{"x-connections-csrf":session()!.csrfToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw Error(`Connection request failed (${response.status}). Reopen an authorized link if access expired.`);return response.json();
  }
  async function watch(){
    updates?.abort();const controller=new AbortController();updates=controller;const signal=AbortSignal.any([lifetime.signal,controller.signal]);
    try{
      const response=await fetch(prefix+"/events",{credentials:"same-origin",signal});if(!response.ok||!response.body)throw Error("Live connection updates unavailable. Refresh to reconnect.");
      setLive(true);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
      try{while(!signal.aborted){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true});if(buffer.length>1048576)throw Error("Connection update exceeds limit.");
        let end:number;while((end=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split("\n").find(line=>line.startsWith("data: "));if(data)setConnections(connectionSchema.array().parse(JSON.parse(data.slice(6))));}
      }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(!signal.aborted)setError("Live updates disconnected. Refresh to reconnect; remote sign-in continues.");
    }catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:"Connection updates failed.");}finally{if(updates===controller)setLive(false);}
  }
  async function open(){try{
    const code=new URLSearchParams(location.hash.slice(1)).get("code");if(location.hash)history.replaceState(null,"",location.pathname);
    setSession(sessionSchema.parse(await call("/session",code?"POST":"GET",code?{code}:undefined)));
    setConnections(connectionSchema.array().parse(await call("/connections")));setError("");void watch();
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not open Connections.");}}
  async function action(id:string,kind:"connect"|"cancel"|"revoke"){
    setBusy(true);setError("");try{await call(`/connections/${id}/${kind}`,"POST",kind==="connect"?{requestId:crypto.randomUUID()}:{});
      setConnections(connectionSchema.array().parse(await call("/connections")));}
    catch(cause){setError(cause instanceof Error?cause.message:"Connection action failed.");}finally{setBusy(false);}
  }
  onMount(()=>void open());onCleanup(()=>{lifetime.abort();updates?.abort();});
  return <main {...stylex.attrs(styles.page,typography.body)}><header {...stylex.attrs(styles.heading)}><h1 {...stylex.attrs(typography.emphasis)}>Connections</h1><Button variant="secondary" size="small" tooltip="Refresh provider status and reconnect live updates" disabled={busy()} onClick={()=>void open()}>Refresh</Button></header>
    <p>Connect services to your remote Hyperfocus host. Waiting work resumes when its required connections are ready.</p>
    <Show when={session()}><p role="status">{live()?"Live updates":"Connecting to remote host"}</p></Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <ConnectionsPanel connections={connections()} busy={busy()} onConnect={id=>void action(id,"connect")} onCancel={id=>void action(id,"cancel")} onRevoke={id=>void action(id,"revoke")} />
  </main>;
}
