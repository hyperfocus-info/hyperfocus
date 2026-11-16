import { Input } from "@hyperfocus/ui";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, For, Show } from "solid-js";
import { harnessStore } from "../../harness-store";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { Textarea } from "../primitives/textarea";
import { useChatPanel } from "./state/panel-context";

const styles = stylex.create({
  stack: { gap: "0.75rem", display: "flex", flexDirection: "column", minWidth: 0, },
  row: { gap: "0.5rem", alignItems: "center", display: "flex", flexWrap: "wrap", },
  list: { gap: "0.25rem", display: "flex", flexDirection: "column", maxHeight: "14rem", overflowY: "auto", },
  status: { color: "var(--muted)", fontSize: tokens.fontControl },
});

export function ThreadCollaboration(props: { open: boolean; onClose: () => void }) {
  const { project, activeThread } = useChatPanel();
  const [search, setSearch] = createSignal("");
  const [target, setTarget] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [deliveryId, setDeliveryId] = createSignal(crypto.randomUUID());
  const [submitted, setSubmitted] = createSignal(false);
  const parent = () => activeThread()?.lineage;
  const children = () => project().threads.filter(thread => thread.lineage?.parentThreadId === project().activeThreadId);
  const candidates = createMemo(() => project().threads.filter(thread => thread.id !== project().activeThreadId && thread.status !== "archived"
    && thread.title.toLowerCase().includes(search().toLowerCase())));
  const sent = () => project().session.messages.some(entry => entry.metadata?.type === "thread-message" && entry.metadata.deliveryId === deliveryId());
  function openThread(threadId: string) {
    harnessStore.actions.sendCommand({ type: "thread.activate", requestId: createRequestId(), payload: { projectId: project().id, threadId } });
    props.onClose();
  }
  function edit(value: string) { setMessage(value); setDeliveryId(crypto.randomUUID()); setSubmitted(false); }
  return <Dialog open={props.open} onClose={props.onClose} title="Threads and subagents">
    <div {...stylex.attrs(styles.stack)}>
      <Show when={parent()}>{lineage => <div {...stylex.attrs(styles.row)}>
        <span>{lineage().relationship === "subagent" ? "Subagent of" : "Forked from"}</span>
        <Button tooltip="Open parent thread" variant="ghost" size="sm" onClick={() => openThread(lineage().parentThreadId)}>
          {project().threads.find(thread => thread.id === lineage().parentThreadId)?.title ?? lineage().parentThreadId}
        </Button>
        <Show when={lineage().status}><span {...stylex.attrs(styles.status)}>{lineage().status}</span></Show>
      </div>}</Show>
      <Show when={children().length}>
        <nav aria-label="Child threads" {...stylex.attrs(styles.list)}><For each={children()}>{thread =>
          <Button tooltip="Open child thread" variant="ghost" size="sm" onClick={() => openThread(thread.id)}>
            {thread.title} · {thread.lineage?.relationship} · {thread.lineage?.status ?? thread.badgeState}
          </Button>
        }</For></nav>
      </Show>
      <label for="thread-recipient-search">Message another thread</label>
      <Input id="thread-recipient-search" placeholder="Find a thread" value={search()} onInput={event => setSearch(event.currentTarget.value)} />
      <div role="group" aria-label="Recipient thread" {...stylex.attrs(styles.list)}>
        <For each={candidates()} fallback={<span>No matching threads</span>}>{thread =>
          <Button tooltip="Choose recipient" variant={target() === thread.id ? "secondary" : "ghost"} size="sm" aria-pressed={target() === thread.id}
            onClick={() => { setTarget(thread.id); setDeliveryId(crypto.randomUUID()); setSubmitted(false); }}>
            {thread.title}<Show when={thread.lineage?.relationship}> · {thread.lineage?.relationship}</Show>
          </Button>
        }</For>
      </div>
      <Textarea aria-label="Message to thread" value={message()} maxLength={16000} onInput={event => edit(event.currentTarget.value)} />
      <div {...stylex.attrs(styles.row)}>
        <Button tooltip="Send and start a recipient turn" variant="default" disabled={!target() || !message().trim() || sent()} onClick={() => {
          const accepted = harnessStore.actions.sendCommand({ type: "thread.message", requestId: createRequestId(), payload: {
            projectId: project().id, sourceThreadId: project().activeThreadId, targetThreadId: target(), message: message().trim(), deliveryId: deliveryId()
          } });
          setSubmitted(accepted !== false);
        }}>{sent() ? "Queued" : submitted() ? "Retry send" : "Send message"}</Button>
        <span role="status" {...stylex.attrs(styles.status)}>{sent() ? "Recipient will run when available." : "Sending starts a turn; busy threads queue it."}</span>
      </div>
    </div>
  </Dialog>;
}
