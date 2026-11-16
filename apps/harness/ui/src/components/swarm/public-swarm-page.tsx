import { Button, Disclosure, typography } from "@hyperfocus/ui";
import type { SwarmFetch } from "@hyperfocus/ai-core/swarm";
import { swarmBrowserAccessReceiptSchema } from "@hyperfocus/ai-core/swarm";
import * as stylex from "@stylexjs/stylex";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { styles } from "../../app/app.styles";
import { formatShortTimestamp } from "../../lib/time-format";
import { createToastStoreForProvider, getActiveToastStore, setActiveToastStore } from "../../toast-store";
import { Toaster } from "../toaster";
import { HarnessSwarmDialog } from "./swarm-dialog";
import { createPublicSwarmFetch, openPublicSwarmSession, publicSwarmPrefix, type PublicSwarmSession } from "./public-session";

/** Dedicated browser entry: scoped coordinator access without the desktop app bootstrap. */
export function PublicSwarmPage(props:{fetch?:SwarmFetch}) {
  const lifetime=new AbortController();
  const [session,setSession]=createSignal<PublicSwarmSession>();
  const [error,setError]=createSignal("");
  const [closing,setClosing]=createSignal(false);
  const [phoneLink,setPhoneLink]=createSignal("");
  async function pairPhone(){
    const current=session();if(!current)return;
    try{
      const response=await createPublicSwarmFetch({session:current,origin:location.origin,request:props.fetch})(`${publicSwarmPrefix}/session/pair`,{method:"POST",headers:{"content-type":"application/json"},body:"{}",signal:lifetime.signal});
      if(!response.ok)throw Error(`Could not pair another device (${response.status}).`);
      setPhoneLink(swarmBrowserAccessReceiptSchema.parse(await response.json()).url);
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  let sessionRequest:AbortController|undefined;
  const previousToastStore=getActiveToastStore();
  const toastStore=createToastStoreForProvider();setActiveToastStore(toastStore);
  const openSession=()=>{
    sessionRequest?.abort();const active=new AbortController();sessionRequest=active;
    const code=new URLSearchParams(location.hash.slice(1)).get("code") ?? undefined;
    if(location.hash)history.replaceState(null,"",`${location.pathname}${location.search}`);
    const signal=AbortSignal.any([lifetime.signal,active.signal]);setError("");setSession(undefined);
    void openPublicSwarmSession({request:props.fetch ?? fetch,code,signal}).then(value=>{if(!signal.aborted)setSession(value);}).catch(cause=>{if(!signal.aborted)setError(cause instanceof Error ? cause.message : String(cause));});
  };
  const linkChanged=()=>{if(new URLSearchParams(location.hash.slice(1)).has("code"))openSession();};
  onCleanup(()=>{lifetime.abort();sessionRequest?.abort();window.removeEventListener("hashchange",linkChanged);toastStore.dispose();if(getActiveToastStore()===toastStore)setActiveToastStore(previousToastStore);});
  onMount(()=>{window.addEventListener("hashchange",linkChanged);openSession();});
  async function closeSession() {
    const current=session();if(!current)return;setClosing(true);
    try {
      const response=await createPublicSwarmFetch({session:current,origin:location.origin,request:props.fetch})(`${publicSwarmPrefix}/session`,{method:"DELETE",signal:lifetime.signal});
      if(!response.ok)throw new Error(`Could not close this session (${response.status}).`);
      setSession(undefined);setError("This browser session is closed. Open a new scoped link to return.");
    } catch(cause) {setError(cause instanceof Error ? cause.message : String(cause));}
    finally {setClosing(false);}
  }
  return <div {...stylex.attrs(styles.appShell,typography.body)} data-hyperfocus-swarm-site="public">
    <div {...stylex.attrs(styles.appContent)}>
      <header {...stylex.attrs(styles.commandBar)}><strong>Hyperfocus Swarm</strong><Show when={session()}>{value=><Disclosure title="Access and devices"><p>{value().access.access === "view" ? "Read-only access" : "Control access"} · Expires {formatShortTimestamp(value().access.expiresAt)}</p><Show when={value().access.access==="control"}><Button variant="secondary" size="small" tooltip="Create a private link for another device with the same access and expiry" onClick={()=>void pairPhone()}>Connect another device</Button></Show><Button variant="secondary" size="small" tooltip="Revoke this browser session" disabled={closing()} onClick={()=>void closeSession()}>Close session</Button><Show when={phoneLink()}><p>Open this private link on your phone within 24 hours, then bookmark the page: <a href={phoneLink()}>Phone access link</a></p></Show></Disclosure>}</Show></header>
      <Show when={error()}><p role="alert">{error()}</p></Show>
      <Show when={session()} keyed fallback={<p role="status">{error() ? "" : "Opening authorized swarm..."}</p>}>{value=><HarnessSwarmDialog projectId={value.access.projectId} projectName={value.context.name} goal="" initialRunId={value.access.runId} presentation="page" remote={{access:value.access.access,baseUrl:publicSwarmPrefix}} fetch={createPublicSwarmFetch({session:value,origin:location.origin,request:props.fetch})} onClose={()=>void closeSession()} />}</Show>
    </div><Toaster />
  </div>;
}
