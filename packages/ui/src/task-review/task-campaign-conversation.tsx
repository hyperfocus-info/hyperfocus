import { formatCampaignDuration as duration } from "./campaign-time";
import * as stylex from "@stylexjs/stylex";
import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { ChatTranscript, type TranscriptMessage } from "../transcript/chat-transcript";
import { ChatComposer } from "../composer/chat-composer";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";

const styles=stylex.create({
  root:{gap:tokens.space2, display:"flex", flexDirection:"column", minWidth:0,},
  header:{gap:tokens.space2, alignItems:"center", display:"flex", flexWrap:"wrap", justifyContent:"space-between",},
  copy:{margin:0, color:tokens.muted, overflowWrap:"anywhere",},
  transcript:{borderBlockStyle:"solid", borderBlockColor:tokens.border, borderBlockWidth:tokens.borderWidth, display:"flex", flexDirection:"column", height:"clamp(12rem, 42dvh, 30rem)", minHeight:0, minWidth:0,},
});

/** Hosts supply durable events and commands; this composition owns only interaction. */
export function TaskCampaignConversation(props:{
  messages:readonly TranscriptMessage[];status:string;activity:string;connection:string;
  startedAt?:number;deadlineAt?:number;completedAt?:number;lastEventAt:number;
  value:string;onInput:(value:string)=>void;onSubmit:()=>void;canSteer:boolean;busy?:boolean;
  onInspect:(id:string)=>void;actions?:JSX.Element;
  phoneUrl?:string;
}) {
  const [now,setNow]=createSignal(Date.now());
  onMount(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);onCleanup(()=>clearInterval(timer));});

  function inspect(event:MouseEvent) {
    const anchor=event.target instanceof Element?event.target.closest("a"):null;
    const href=anchor?.getAttribute("href"),prefix="#swarm-artifact-";
    if(href?.startsWith(prefix)){event.preventDefault();props.onInspect(href.slice(prefix.length));}
  }
  return <section aria-label="Swarm conversation" data-test-swarm-conversation="" {...stylex.attrs(styles.root)}>
    <div {...stylex.attrs(styles.header)}><strong {...stylex.attrs(typography.emphasis)}>{props.status}</strong>{props.actions}</div>
    <Show when={props.phoneUrl}><p {...stylex.attrs(styles.copy,typography.caption)}><a href={props.phoneUrl}>Open Swarm on another device</a> · The cloud owns this run; you can disconnect this computer.</p></Show>
    <p role="status" {...stylex.attrs(styles.copy,typography.caption)}>{props.startedAt?`${duration((props.completedAt??now())-props.startedAt)} elapsed`:"Not started"}{props.deadlineAt&&!props.completedAt?` · ${duration(props.deadlineAt-now())} remaining`:""} · {props.connection}</p>
    <p {...stylex.attrs(styles.copy,typography.body)}>{props.activity}</p>
    <Show when={!props.completedAt&&now()-props.lastEventAt>30000}><p {...stylex.attrs(styles.copy,typography.caption)}>Last activity {duration(now()-props.lastEventAt)} ago. {props.connection.includes("Live")?"Awaiting the next result.":"Reconnect to check current progress."}</p></Show>
    <div {...stylex.attrs(styles.transcript)} onClick={inspect}><ChatTranscript messages={props.messages} maxRetainedMessages={200} emptyMessage="The coordinator will report progress here." /></div>
    <Show when={props.canSteer}><ChatComposer ariaLabel="Steer this run" value={props.value} onInput={props.onInput} onSubmit={props.onSubmit} disabled={props.busy} placeholder="Guide the next step…" /></Show>
  </section>;
}
