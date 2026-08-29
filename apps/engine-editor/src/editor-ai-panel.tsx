import * as stylex from "@stylexjs/stylex";
import { createHarnessClient, type HarnessClientSnapshot } from "@hyperfocus/ai-core";
import { Button, ChatComposer, ChatTranscript, type TranscriptMessage } from "@hyperfocus/ui";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { extractEditorPatchProposal, projectAwareEditorPrompt, reduceTranscript, summarizeEditorPatchProposal, transcriptFromSnapshot } from "./editor-ai-model";
import { readEditorAiAgent, readEditorAiHarnessEndpoint, writeEditorAiAgent, writeEditorAiHarnessEndpoint } from "./app/editor-preferences";

const LEGACY_ENDPOINT_KEY = "hyperfocus.editor.harness-endpoint.v1";

const styles = stylex.create({
  launcher: { boxShadow: tokens.shadow, position: "fixed", zIndex: 700, bottom: "2.5rem", right: "1rem", },
  panel: { padding: "0.75rem", borderColor: tokens.border, borderRadius: "14px", borderStyle: "solid", borderWidth: "1px", gap: "0.65rem", backgroundColor: tokens.background, boxShadow: tokens.shadow, color: tokens.foreground, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto auto auto", position: "fixed", zIndex: 699, bottom: "5.4rem", height: "min(46rem, calc(100vh - 8rem))", right: "1rem", width: "min(31rem, calc(100vw - 2rem))", },
  header: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  connection: { gap: "0.4rem", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", },
  error: { margin: 0, color: tokens.danger, fontSize: "0.72rem", },
  proposal: { padding: "0.55rem", borderColor: tokens.border, borderRadius: "10px", borderStyle: "solid", borderWidth: "1px", gap: "0.5rem", alignItems: "center", backgroundColor: tokens.panelRaised, display: "flex", justifyContent: "space-between", },
  proposalActions: { gap: "0.35rem", display: "flex", },
  proposalDiff: { color: tokens.muted, fontFamily: tokens.fontMono, fontSize: "0.68rem", marginBlockEnd: 0, marginBlockStart: "0.35rem", paddingInlineStart: "1rem" },
  status: { margin: 0, color: tokens.muted, fontSize: "0.72rem", },
});

export function EditorAiPanel() {
  const [open, setOpen] = createSignal(false);
  const [endpoint, setEndpoint] = createSignal(initialEndpoint());
  const [snapshot, setSnapshot] = createSignal<HarnessClientSnapshot>({ state: "idle", agents: [] });
  const [messages, setMessages] = createSignal<readonly TranscriptMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [selectedAgent, setSelectedAgent] = createSignal<"pi" | "copilot-cli" | "codex-cli">(readEditorAiAgent());
  const [proposalStatus, setProposalStatus] = createSignal("");
  const [proposalBaseRevision, setProposalBaseRevision] = createSignal<number>();
  const [appliedProposal, setAppliedProposal] = createSignal<{ revision: number; commands: number }>();
  let client: ReturnType<typeof createHarnessClient> | undefined;
  let disposeSnapshot: (() => void) | undefined;
  let disposeEvents: (() => void) | undefined;
  const queuedOptimisticRequestIds = new Set<string>();

  const disconnect = () => {
    disposeSnapshot?.();
    disposeEvents?.();
    client?.disconnect();
    client = undefined;
    queuedOptimisticRequestIds.clear();
  };
  const connect = () => {
    disconnect();
    const storedEndpoint = writeEditorAiHarnessEndpoint(endpoint());
    setEndpoint(storedEndpoint);
    try {
      client = createHarnessClient({ endpoint: storedEndpoint });
      disposeSnapshot = client.subscribe((next) => {
        setSnapshot(next);
        if (next.state === "connected") {
          const persisted = transcriptFromSnapshot(next);
          setMessages((current) => [...persisted, ...current.filter((message) =>
            message.id.startsWith("local-") && queuedOptimisticRequestIds.has(message.id.slice("local-".length))) ]);
          const preferred = readEditorAiAgent();
          const selected = next.agents.some((agent) => agent.id === preferred) ? preferred : next.agents[0]?.id;
          if (selected) { setSelectedAgent(selected); writeEditorAiAgent(selected); }
        }
      });
      disposeEvents = client.onEvent((event) => {
        if ((event.type === "chat.message-appended" || event.type === "thread.message-appended") && event.payload.message.role === "user") {
          queuedOptimisticRequestIds.delete(event.requestId);
        }
        setMessages((current) => reduceTranscript(current, event));
      });
      void client.connect().catch(() => { /* Connection errors are published through the snapshot. */ });
    } catch (error) {
      disconnect();
      setSnapshot({ state: "error", agents: [], error: error instanceof Error ? error.message : "Could not connect" });
    }
  };
  onCleanup(disconnect);

  const send = () => {
    const content = draft().trim();
    if (!content || !client) return;
    try {
      setAppliedProposal(undefined);
      setProposalStatus("");
      const editorSnapshot = globalThis.__hyperfocusEditorCommands?.snapshot();
      setProposalBaseRevision(editorSnapshot?.revision);
      const sent = client.sendChat({ content: projectAwareEditorPrompt(content, editorSnapshot, currentEditorViewContext()), agentId: selectedAgent() });
      if (sent.delivery.status === "rejected") throw new Error(`Could not send chat: ${sent.delivery.reason}`);
      if (sent.delivery.status === "queued") queuedOptimisticRequestIds.add(sent.requestId);
      setMessages((current) => [...current, { id: `local-${sent.requestId}`, role: "user", content, pending: true }]);
      setDraft("");
    } catch (error) {
      setSnapshot((current) => ({ ...current, state: "error", error: error instanceof Error ? error.message : "Could not send" }));
    }
  };
  const connected = createMemo(() => snapshot().state === "connected" || snapshot().state === "recovering");
  const proposal = createMemo(() => {
    const assistant = [...messages()].reverse().find((message) => message.role === "assistant" && !message.pending);
    return assistant ? extractEditorPatchProposal(assistant.content) : undefined;
  });
  const applyProposal = async () => {
    const session = globalThis.__hyperfocusEditorCommands;
    const plan = proposal();
    if (!session || !plan) return;
    const baseRevision = proposalBaseRevision();
    if (baseRevision === undefined || session.snapshot().revision !== baseRevision) {
      setProposalStatus("The project changed after this proposal was requested. Ask again so preconditions are based on the current revision.");
      return;
    }
    setProposalStatus("Validating and applying proposal…");
    const beforeRevision = session.snapshot().revision;
    const handoff = await session.execute({ ...plan, requestId: `${plan.requestId}-editor-${crypto.randomUUID()}` });
    if (!handoff.ok) {
      setProposalStatus(`Not applied: ${handoff.error ?? "validation failed"}`);
      return;
    }
    const undoableCommands = handoff.snapshot.revision - beforeRevision;
    setAppliedProposal(undoableCommands > 0 ? { revision: handoff.snapshot.revision, commands: undoableCommands } : undefined);
    setProposalStatus(`Applied ${handoff.completedCommands} validated change${handoff.completedCommands === 1 ? "" : "s"}. Review the canvas or Undo.`);
  };
  const revertProposal = async () => {
    const session = globalThis.__hyperfocusEditorCommands;
    const applied = appliedProposal();
    if (!session || !applied) return;
    if (session.snapshot().revision !== applied.revision) {
      setProposalStatus("The project changed after this proposal. Use normal Undo so newer work is not discarded.");
      return;
    }
    const handoff = await session.execute({
      requestId: `revert-ai-${crypto.randomUUID()}`,
      intent: "Revert the last applied AI patch proposal",
      commands: Array.from({ length: applied.commands }, () => ({ type: "history.undo" as const })),
    });
    setProposalStatus(handoff.ok ? "Proposal reverted." : `Could not revert: ${handoff.error ?? "unknown error"}`);
    if (handoff.ok) setAppliedProposal(undefined);
  };

  return (
    <>
      <div {...stylex.attrs(styles.launcher)}><Button variant="primary" tooltip="Open optional AI chat" onClick={() => setOpen((value) => {
        if (!value) { setEndpoint(readEditorAiHarnessEndpoint()); setSelectedAgent(readEditorAiAgent()); }
        return !value;
      })}>AI</Button></div>
      <Show when={open()}>
        <aside {...stylex.attrs(styles.panel)} aria-label="AI chat" data-test-editor-ai-panel="">
          <header {...stylex.attrs(styles.header)}>
            <div><strong>Project-aware AI</strong><span>{connected() ? globalThis.__hyperfocusEditorCommands?.snapshot().project.name ?? "Editor connected" : "Optional local backend"}</span></div>
            <Button variant="ghost" size="icon" tooltip="Close AI chat" aria-label="Close AI chat" onClick={() => setOpen(false)}>×</Button>
          </header>
          <div {...stylex.attrs(styles.connection)}>
            <input aria-label="Harness address" value={endpoint()} onInput={(event) => setEndpoint(event.currentTarget.value)} disabled={snapshot().state === "connecting"} />
            <Button variant="secondary" size="small" tooltip={connected() ? "Disconnect from harness" : "Connect to local harness"} onClick={connected() ? disconnect : connect}>{connected() ? "Disconnect" : "Connect"}</Button>
          </div>
          <Show when={snapshot().error}><p {...stylex.attrs(styles.error)} role="alert">{snapshot().error}</p></Show>
          <ChatTranscript messages={messages()} emptyMessage={connected() ? "Ask about the open editor project. Suggested edits require an explicit Apply." : "Connect your local harness to enable project-aware AI chat. The editor remains fully usable offline."} />
          <Show when={proposal()} keyed>
            {(plan) => <section {...stylex.attrs(styles.proposal)} aria-label="Proposed editor changes">
              <div><strong>{plan.intent}</strong><span>{plan.commands.length} validated project patch{plan.commands.length === 1 ? "" : "es"}</span><ul {...stylex.attrs(styles.proposalDiff)}>{summarizeEditorPatchProposal(plan).map((item) => <li>{item}</li>)}</ul></div>
              <div {...stylex.attrs(styles.proposalActions)}>
                <Button variant="primary" size="small" tooltip="Apply this reviewed patch to the project" disabled={Boolean(appliedProposal())} onClick={() => void applyProposal()}>Apply</Button>
                <Show when={appliedProposal()}><Button variant="secondary" size="small" tooltip="Undo the applied patch while the project revision is unchanged" onClick={() => void revertProposal()}>Revert</Button></Show>
              </div>
            </section>}
          </Show>
          <Show when={proposalStatus()}><p {...stylex.attrs(styles.status)} role="status">{proposalStatus()}</p></Show>
          <ChatComposer
            value={draft()}
            onInput={setDraft}
            onSubmit={send}
            disabled={!connected()}
            options={{ agents: snapshot().agents.map((agent) => ({ id: agent.id, label: agent.label })) }}
            selected={{ agent: selectedAgent() }}
            onSelect={(kind, id) => { if (kind === "agent" && (id === "pi" || id === "copilot-cli" || id === "codex-cli")) { setSelectedAgent(id); writeEditorAiAgent(id); } }}
          />
        </aside>
      </Show>
    </>
  );
}

function initialEndpoint() {
  const storedEndpoint = readEditorAiHarnessEndpoint();
  const legacy = localStorage.getItem(LEGACY_ENDPOINT_KEY);
  if (!legacy || storedEndpoint !== "http://127.0.0.1:8787") return storedEndpoint;
  const migrated = writeEditorAiHarnessEndpoint(legacy);
  localStorage.removeItem(LEGACY_ENDPOINT_KEY);
  return migrated;
}

function currentEditorViewContext() {
  const sourcePath = document.querySelector<HTMLElement>("#script-editor-path")?.textContent?.trim();
  return {
    workspace: globalThis.__engineEditor?.activeWorkspace,
    selectedEntityId: globalThis.__engineEditor?.selectedEntityId ?? undefined,
    activeSourcePath: sourcePath && sourcePath !== "No script selected" ? sourcePath : undefined,
  };
}
