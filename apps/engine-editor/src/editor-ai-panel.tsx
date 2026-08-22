import * as stylex from "@stylexjs/stylex";
import { createHarnessClient, type HarnessClientSnapshot } from "@hyperfocus/ai-core";
import { Button, ChatComposer, ChatTranscript, type TranscriptMessage } from "@hyperfocus/ui";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { reduceTranscript, transcriptFromSnapshot } from "./editor-ai-model";

const ENDPOINT_KEY = "hyperfocus.editor.harness-endpoint.v1";

export function EditorAiPanel() {
  const [open, setOpen] = createSignal(false);
  const [endpoint, setEndpoint] = createSignal(localStorage.getItem(ENDPOINT_KEY) ?? "http://127.0.0.1:8787");
  const [snapshot, setSnapshot] = createSignal<HarnessClientSnapshot>({ state: "idle", agents: [] });
  const [messages, setMessages] = createSignal<readonly TranscriptMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [selectedAgent, setSelectedAgent] = createSignal<"pi" | "copilot-cli" | "codex-cli">("codex-cli");
  let client: ReturnType<typeof createHarnessClient> | undefined;
  let disposeSnapshot: (() => void) | undefined;
  let disposeEvents: (() => void) | undefined;

  const disconnect = () => {
    disposeSnapshot?.();
    disposeEvents?.();
    client?.disconnect();
    client = undefined;
  };
  const connect = () => {
    disconnect();
    localStorage.setItem(ENDPOINT_KEY, endpoint());
    client = createHarnessClient({ endpoint: endpoint() });
    disposeSnapshot = client.subscribe((next) => {
      setSnapshot(next);
      if (next.state === "connected") {
        setMessages(transcriptFromSnapshot(next));
        const firstAgent = next.agents[0]?.id;
        if (firstAgent) setSelectedAgent(firstAgent);
      }
    });
    disposeEvents = client.onEvent((event) => setMessages((current) => reduceTranscript(current, event)));
    client.connect();
  };
  onCleanup(disconnect);

  const send = () => {
    const content = draft().trim();
    if (!content || !client) return;
    try {
      client.sendChat({ content, agentId: selectedAgent() });
      setMessages((current) => [...current, { id: `local-${crypto.randomUUID()}`, role: "user", content }]);
      setDraft("");
    } catch (error) {
      setSnapshot((current) => ({ ...current, state: "error", error: error instanceof Error ? error.message : "Could not send" }));
    }
  };
  const connected = createMemo(() => snapshot().state === "connected");

  return (
    <>
      <div {...stylex.attrs(styles.launcher)}><Button variant="primary" tooltip="Open optional AI chat" onClick={() => setOpen((value) => !value)}>AI</Button></div>
      <Show when={open()}>
        <aside {...stylex.attrs(styles.panel)} aria-label="AI chat" data-test-editor-ai-panel="">
          <header {...stylex.attrs(styles.header)}>
            <div><strong>Harness chat</strong><span>{connected() ? "Connected" : "Optional local backend"}</span></div>
            <Button variant="ghost" size="icon" tooltip="Close AI chat" aria-label="Close AI chat" onClick={() => setOpen(false)}>×</Button>
          </header>
          <div {...stylex.attrs(styles.connection)}>
            <input aria-label="Harness address" value={endpoint()} onInput={(event) => setEndpoint(event.currentTarget.value)} disabled={snapshot().state === "connecting"} />
            <Button variant="secondary" size="small" tooltip={connected() ? "Disconnect from harness" : "Connect to local harness"} onClick={connected() ? disconnect : connect}>{connected() ? "Disconnect" : "Connect"}</Button>
          </div>
          <Show when={snapshot().error}><p {...stylex.attrs(styles.error)} role="alert">{snapshot().error}</p></Show>
          <ChatTranscript messages={messages()} emptyMessage={connected() ? "Ask the harness about the active project." : "Connect your local harness to enable AI chat. The editor remains fully usable offline."} />
          <ChatComposer
            value={draft()}
            onInput={setDraft}
            onSubmit={send}
            disabled={!connected()}
            options={{ agents: snapshot().agents.map((agent) => ({ id: agent.id, label: agent.label })) }}
            selected={{ agent: selectedAgent() }}
            onSelect={(kind, id) => { if (kind === "agent" && (id === "pi" || id === "copilot-cli" || id === "codex-cli")) setSelectedAgent(id); }}
          />
        </aside>
      </Show>
    </>
  );
}

const styles = stylex.create({
  launcher: { boxShadow: tokens.shadow, position: "fixed", zIndex: 700, bottom: "2.5rem", right: "1rem", },
  panel: { padding: "0.75rem", borderColor: tokens.border, borderRadius: "14px", borderStyle: "solid", borderWidth: "1px", gap: "0.65rem", backgroundColor: tokens.background, boxShadow: tokens.shadow, color: tokens.foreground, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto", position: "fixed", zIndex: 699, bottom: "5.4rem", height: "min(46rem, calc(100vh - 8rem))", right: "1rem", width: "min(31rem, calc(100vw - 2rem))", },
  header: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  connection: { gap: "0.4rem", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", },
  error: { margin: 0, color: tokens.danger, fontSize: "0.72rem", }
});
