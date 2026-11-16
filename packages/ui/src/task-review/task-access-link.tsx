import { createSignal, onCleanup, Show } from "solid-js";
import { Button } from "../primitives/button";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { TaskRequestForm } from "./task-request-form";

/** Hosts authorize and issue access; this control holds the short-lived receipt only in memory. */
export function TaskAccessLink(props:{disabled?:boolean;onIssue:(access:"view"|"control")=>Promise<{url:string;expiresAt:number}>;onError:(cause:unknown)=>void;formatExpiry:(at:number)=>string}) {
  const [access,setAccess]=createSignal<"view"|"control">("view");
  const [receipt,setReceipt]=createSignal<{url:string;expiresAt:number}>();
  const [pending,setPending]=createSignal(false);
  const [copied,setCopied]=createSignal(false);
  let disposed=false;onCleanup(()=>{disposed=true;});
  async function issue() {
    if(props.disabled || pending())return;setPending(true);setCopied(false);setReceipt(undefined);
    try{const value=await props.onIssue(access());if(!disposed)setReceipt(value);}
    catch(cause){if(!disposed)props.onError(cause);}
    finally{if(!disposed)setPending(false);}
  }
  async function copy() {
    const value=receipt();if(!value)return;
    try{await navigator.clipboard.writeText(value.url);if(!disposed)setCopied(true);}
    catch(cause){if(!disposed)props.onError(cause);}
  }
  return <Disclosure title="Cloud link"><TaskRequestForm fields={[{id:"access",label:"Link permissions",value:access(),kind:"choice",description:"One-use link opens a scoped session for this run and its follow-ups. Control access can launch, steer, queue, cancel and reject work.",options:[{value:"view",label:"View only"},{value:"control",label:"Control this run"}]}]} onChange={(_id,value)=>setAccess(value === "control" ? "control" : "view")} onSubmit={()=>void issue()} actionLabel="Create cloud link" disabled={props.disabled || pending()}/>
    <Show when={receipt()}>{value=><><p>Expires {props.formatExpiry(value().expiresAt)}. The link can be opened once.</p><a href={value().url} target="_blank" rel="noopener noreferrer">Open cloud page</a><Button variant="secondary" size="small" tooltip="Copy the one-use access link" onClick={()=>void copy()}>{copied() ? "Link copied" : "Copy cloud link"}</Button></>}</Show>
  </Disclosure>;
}
