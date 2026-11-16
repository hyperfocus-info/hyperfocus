import * as stylex from "@stylexjs/stylex";
import { createMemo, For, Show, type Accessor, type JSX } from "solid-js";
import { Button } from "../primitives/button";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { StatusChip, type StatusTone } from "../primitives/status-chip";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";
import { describeTaskProgress, type TaskProgress } from './progress';

/** Presentation records only. Hosts own task execution, evidence, and review policy. */
export type TaskReviewItem = {
  id: string;
  label: string;
  status: string;
  tone?: StatusTone;
  detail?: string;
  dependencies?: readonly string[];
  criteria?: readonly string[];
  progress?: TaskProgress;
};

export type TaskReviewCandidate = {
  id: string;
  label: string;
  status: string;
  tone?: StatusTone;
  summary: string;
  facts: readonly { label: string; value: string }[];
  actions?: JSX.Element;
};

export type TaskReviewEvent = { id: string; attribution: string; time: string; text: string };
export type TaskReviewArtifact = { id: string; label: string; detail: string };

const styles = stylex.create({
  stack: { gap: tokens.space3, display: "grid", minWidth: 0, },
  row: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  heading: { margin: 0, overflowWrap: "anywhere", minWidth: 0, },
  copy: { margin: 0, color: tokens.muted, overflowWrap: "anywhere" },
  item: { gap: tokens.space2, paddingBlock: tokens.space2, display: "grid", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0, },
  list: { margin: 0, padding: 0, listStyle: "none", minWidth: 0, },
  facts: { margin: 0, gap: tokens.space2, display: "grid", fontVariantNumeric: tokens.numericVariant, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", minWidth: 0, },
  value: { margin: 0, overflowWrap: "anywhere" },
  code: { margin: 0, padding: tokens.space3, borderRadius: tokens.radiusSmall, overflow: "auto", backgroundColor: tokens.panelRaised, color: tokens.foreground, fontFamily: tokens.fontMono, fontSize: tokens.fontCaption, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap", maxHeight: "26rem", minWidth: 0, },
  image: { display: "block", objectFit: "contain", maxHeight: "26rem", maxWidth: "100%", },
});

export function StableItems<T extends {id:string}>(props: {items:readonly T[];fallback?:JSX.Element;children:(item:Accessor<T>)=>JSX.Element}) {
  const byId=createMemo(()=>new Map(props.items.map(item=>[item.id,item] as const)));
  return <For each={props.items.map(item=>item.id)} fallback={props.fallback}>{id=>{
    const initial=byId().get(id);
    return initial ? props.children(()=>byId().get(id) ?? initial) : null;
  }}</For>;
}

export function TaskReviewFacts(props: { facts: readonly { label: string; value: string }[] }) {
  return <dl {...stylex.attrs(styles.facts, typography.caption)}><For each={props.facts}>{fact => <><dt {...stylex.attrs(styles.copy)}>{fact.label}</dt><dd {...stylex.attrs(styles.value)}>{fact.value}</dd></>}</For></dl>;
}

export function TaskReviewProgress(props: { items: readonly TaskReviewItem[]; emptyMessage?: string }) {
  return <ol aria-label="Task progress and dependencies" {...stylex.attrs(styles.list)} data-test-task-review-progress="">
    <StableItems items={props.items} fallback={<p {...stylex.attrs(styles.copy, typography.body)}>{props.emptyMessage ?? "No tasks yet."}</p>}>{item => <li {...stylex.attrs(styles.item)} data-task-id={item().id}>
      <div {...stylex.attrs(styles.row)}><strong {...stylex.attrs(typography.emphasis)}>{item().label}</strong><StatusChip tone={item().tone}>{item().status}</StatusChip></div>
      <Show when={item().detail}><p {...stylex.attrs(styles.copy, typography.body)}>{item().detail}</p></Show>
      <Show when={item().progress}>{progress => {
        const view = () => describeTaskProgress({ task: progress() });
        return <div><StatusChip tone={view().tone}>{view().label}</StatusChip>
          <Show when={view().active}><progress aria-label={`${item().label}: ${view().label}`} max={100} value={view().percentage ?? undefined} /></Show>
          <Show when={view().detail}><p {...stylex.attrs(styles.copy, typography.body)}>{view().detail}</p></Show></div>;
      }}</Show>
      <Show when={item().dependencies?.length}><p {...stylex.attrs(styles.copy, typography.caption)}>Depends on: {item().dependencies?.join(", ")}</p></Show>
      <Show when={item().criteria?.length}><Disclosure title="Acceptance criteria"><ul {...stylex.attrs(styles.copy, typography.body)}><For each={item().criteria}>{criterion => <li>{criterion}</li>}</For></ul></Disclosure></Show>
    </li>}</StableItems>
  </ol>;
}

export function TaskReviewCandidates(props: { candidates: readonly TaskReviewCandidate[]; conclusion?: string }) {
  return <section aria-label="Candidate comparison" {...stylex.attrs(styles.stack)} data-test-task-review-candidates="">
    <h3 {...stylex.attrs(styles.heading, typography.section)}>Compare candidates</h3>
    <Show when={props.conclusion}><p role="status" {...stylex.attrs(styles.copy, typography.body)}>{props.conclusion}</p></Show>
    <For each={props.candidates} fallback={<p {...stylex.attrs(styles.copy, typography.body)}>Candidates appear after workers preserve their results.</p>}>{candidate => <article {...stylex.attrs(styles.item)} data-candidate-id={candidate.id}>
      <div {...stylex.attrs(styles.row)}><h4 {...stylex.attrs(styles.heading, typography.emphasis)}>{candidate.label}</h4><StatusChip tone={candidate.tone}>{candidate.status}</StatusChip></div>
      <p {...stylex.attrs(styles.copy, typography.body)}>{candidate.summary}</p>
      <TaskReviewFacts facts={candidate.facts} />
      <Show when={candidate.actions}><div {...stylex.attrs(styles.row)}>{candidate.actions}</div></Show>
    </article>}</For>
  </section>;
}

export function TaskReviewEvents(props: { events: readonly TaskReviewEvent[] }) {
  return <Disclosure title={`Findings and activity (${props.events.length})`}><ol {...stylex.attrs(styles.list)} aria-label="Findings and activity" data-test-task-review-events="">
    <For each={props.events} fallback={<p {...stylex.attrs(styles.copy, typography.body)}>No findings recorded yet.</p>}>{event => <li {...stylex.attrs(styles.item)}>
      <p {...stylex.attrs(styles.copy, typography.caption)}>{event.attribution} · {event.time}</p>
      <p {...stylex.attrs(styles.heading, typography.body)}>{event.text}</p>
    </li>}</For>
  </ol></Disclosure>;
}

export function TaskReviewArtifacts(props: { artifacts: readonly TaskReviewArtifact[]; busy?: boolean; onInspect: (id: string) => void; onDownload?: (id:string) => void }) {
  return <Disclosure title={`Artifacts (${props.artifacts.length})`}><ul {...stylex.attrs(styles.list)} aria-label="Preserved artifacts">
    <StableItems items={props.artifacts} fallback={<p {...stylex.attrs(styles.copy, typography.body)}>No artifacts recorded yet.</p>}>{artifact => <li {...stylex.attrs(styles.item)}>
      <div {...stylex.attrs(styles.row)}><Button variant="secondary" size="small" tooltip={`Inspect ${artifact().label}`} disabled={props.busy} onClick={() => props.onInspect(artifact().id)}>{artifact().label}</Button><Show when={props.onDownload}><Button variant="secondary" size="small" tooltip={`Download ${artifact().label}`} disabled={props.busy} onClick={()=>props.onDownload?.(artifact().id)}>Download</Button></Show></div>
      <p {...stylex.attrs(styles.copy, typography.caption)}>{artifact().detail}</p>
    </li>}</StableItems>
  </ul></Disclosure>;
}

export function TaskReviewArtifactPreview(props: { label: string; text?: string; mediaUrl?: string; mediaType?: "image" | "video"; downloadUrl?: string }) {
  return <section aria-label={props.label} {...stylex.attrs(styles.stack)} data-test-task-review-artifact="">
    <h3 {...stylex.attrs(styles.heading, typography.section)}>{props.label}</h3>
    <Show when={props.text !== undefined}><pre {...stylex.attrs(styles.code)} tabindex="0">{props.text}</pre></Show>
    <Show when={props.mediaUrl && props.mediaType === "image"}><img {...stylex.attrs(styles.image)} src={props.mediaUrl} alt={props.label} /></Show>
    <Show when={props.mediaUrl && props.mediaType === "video"}><video {...stylex.attrs(styles.image)} src={props.mediaUrl} controls /></Show>
    <Show when={props.downloadUrl}><a href={props.downloadUrl} download={props.label}>Download {props.label}</a></Show>
  </section>;
}
