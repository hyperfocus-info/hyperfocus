import { createSignal,For,onCleanup,Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import type { Connection } from "@hyperfocus/ai-core/connections";
import { Button } from "./primitives/button";
import { Disclosure } from "./primitives/disclosure/disclosure";
import { tokens } from "./theme/tokens.stylex";
import { typography } from "./theme/typography";

const styles=stylex.create({
  list:{gap:tokens.space4, display:"flex", flexDirection:"column", minWidth:0,},
  row:{gap:tokens.space2, paddingBlock:tokens.space4, display:"flex", flexDirection:"column", borderBottomColor:tokens.border, borderBottomStyle:"solid", borderBottomWidth:tokens.borderWidth, minWidth:0,},
  heading:{gap:tokens.space2, alignItems:"center", display:"flex", flexWrap:"wrap", justifyContent:"space-between",},
  copy:{margin:0,overflowWrap:"anywhere"},muted:{color:tokens.muted},
});

/** Hosts own authentication and secrets. This surface presents typed status and explicit actions. */
export function ConnectionsPanel(props:{connections:readonly Connection[];busy?:boolean;
  onConnect:(id:string)=>void;onCancel:(id:string)=>void;onRevoke:(id:string)=>void}){
  return <div {...stylex.attrs(styles.list)}><For each={props.connections}>{connection=><section aria-label={`${connection.label} connection`} {...stylex.attrs(styles.row)}>
    <div {...stylex.attrs(styles.heading)}><strong {...stylex.attrs(typography.emphasis)}>{connection.label}</strong><span role="status">{connection.state==="ready"?"Connected":connection.state.replaceAll("_"," ")}</span></div>
    <p {...stylex.attrs(styles.copy)}>{connection.summary}</p>
    <Show when={connection.operation?.state==="action_required"&&connection.operation.action}>{action=><>
      <p {...stylex.attrs(styles.copy)}>Open the provider’s sign-in page and enter this code:</p>
      <strong {...stylex.attrs(typography.emphasis)}>{action().userCode}</strong>
      <a href={action().verificationUrl} target="_blank" rel="noopener noreferrer">Authorize {connection.label}</a>
      <p {...stylex.attrs(styles.copy,styles.muted)}>Keep this page open to see confirmation, or return later. The remote host owns sign-in.</p>
    </>}</Show>
    <div {...stylex.attrs(styles.heading)}>
      <Show when={connection.canConnect&&!["ready","connecting","action_required"].includes(connection.state)}><Button variant="primary" tooltip={`Start official ${connection.label} authorization on the remote host`} disabled={props.busy} onClick={()=>props.onConnect(connection.id)}>Connect {connection.label}</Button></Show>
      <Show when={["connecting","action_required"].includes(connection.state)}><Button variant="secondary" tooltip="Cancel this sign-in without cancelling saved work" disabled={props.busy} onClick={()=>props.onCancel(connection.id)}>Cancel sign-in</Button></Show>
    </div>
    <Disclosure title="Access and billing"><p>{connection.authorizationScope}</p><p>{connection.billingMode==="subscription"?"Existing subscription. No separately billed inference fallback.":connection.billingMode==="metered"?"Usage is metered within the host’s approved limits.":"No inference or compute billing."}</p>
      <Show when={connection.canRevoke&&connection.credentialSource!=="missing"}><Button variant="secondary" tooltip="Remove this host’s provider login; saved work will wait for authorization" disabled={props.busy} onClick={()=>props.onRevoke(connection.id)}>Disconnect {connection.label}</Button></Show>
    </Disclosure>
  </section>}</For></div>;
}

export function ConnectionAccessLink(props:{onIssue:()=>Promise<{url:string}>;onError:(error:unknown)=>void;disabled?:boolean}){
  const [url,setUrl]=createSignal(""),[busy,setBusy]=createSignal(false);let disposed=false;onCleanup(()=>{disposed=true;});
  async function issue(){setBusy(true);try{const value=await props.onIssue();if(!disposed)setUrl(value.url);}catch(error){if(!disposed)props.onError(error);}finally{if(!disposed)setBusy(false);}}
  return <div><Button variant="secondary" size="small" tooltip="Open remote provider connections for this host" disabled={props.disabled||busy()} onClick={()=>void issue()}>Manage remote connections</Button>
    <Show when={url()}><p><a href={url()} target="_blank" rel="noopener noreferrer">Open Connections</a> · This private link works on your phone.</p></Show>
  </div>;
}
