/** @jsxImportSource solid-js */
import { createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";
import { ChatTranscript, type TranscriptMessage } from "./chat-transcript";

type TranscriptBrowserSnapshot = {
  requestedMessages: number;
  totalMessages: number;
  renderedRows: number;
  uniqueRenderedMessages: number;
  domNodes: number;
  mountMs: number;
  appendP95Ms: number;
  clientHeight: number;
  scrollHeight: number;
  distanceFromEnd: number;
  usedJsHeapBytes?: number;
  hasBlockquote: boolean;
  hasCode: boolean;
  hasTable: boolean;
  streamingRowPreserved: boolean;
  streamingMarkdownUpdated: boolean;
  streamingUpdateApplications: number;
  streamingText?: string;
  streamBurstMutations?: number;
  streamBurstContentApplications?: number;
  streamBurstMs?: number;
  streamBurstFinalVisible?: boolean;
};

declare global {
  interface Window {
    __transcriptBrowserSnapshot?: TranscriptBrowserSnapshot;
  }
}

const startedAt = performance.now();
const requestedMessages = positiveCount(new URLSearchParams(location.search).get("count"), 10_000);
const streamRenderIntervalMs = nonNegativeCount(new URLSearchParams(location.search).get("streamInterval"), 32);
const runStreamBurst = new URLSearchParams(location.search).get("streamBurst") === "1";
let streamingContentApplications = 0;

function FixtureApp() {
  const [messages, setMessages] = createSignal(createMessages(0, requestedMessages));

  onMount(() => {
    void runWorkload(messages, setMessages);
  });

  return (
    <main style={{ height: "620px", margin: "0 auto", "max-width": "920px", padding: "12px", "box-sizing": "border-box" }}>
      <ChatTranscript
        messages={messages()}
        estimateMessageHeight={104}
        overscan={5}
        streamRenderIntervalMs={streamRenderIntervalMs}
        onStreamContentApplied={(messageId) => {
          if (messageId === "streaming-message") streamingContentApplications += 1;
        }}
      />
    </main>
  );
}

async function runWorkload(
  messages: () => readonly TranscriptMessage[],
  setMessages: (update: (current: TranscriptMessage[]) => TranscriptMessage[]) => void
) {
  await settleLayout();
  const appendSamples: number[] = [];
  for (let batch = 0; batch < 5; batch += 1) {
    const before = performance.now();
    setMessages((current) => [...current, ...createMessages(current.length, 20)]);
    await settleLayout();
    appendSamples.push(performance.now() - before);
  }
  const streamingId = "streaming-message";
  setMessages((current) => [...current, {
    id: streamingId,
    role: "assistant",
    content: "Starting",
    pending: true
  }]);
  const streamingRow = await waitForMessage(streamingId);
  setMessages((current) => current.map((message) => message.id === streamingId
    ? { ...message, content: "Starting **finished**" }
    : message));
  await waitForMarkdownUpdate(streamingId);
  await settleLayout();
  const updatedStreamingRow = await waitForMessage(streamingId);
  const streamingUpdateApplications = streamingContentApplications;
  streamingContentApplications = 0;
  const streamBurst = runStreamBurst && updatedStreamingRow
    ? await exerciseLargeStreamBurst(streamingId, updatedStreamingRow, setMessages)
    : undefined;
  const root = document.querySelector<HTMLElement>('[data-test-chat-transcript]');
  if (!root) throw new Error("Transcript browser fixture did not render its root.");
  const memory = Reflect.get(performance, "memory");
  const usedJsHeapBytes = readUsedJsHeapBytes(memory);
  const sortedAppend = [...appendSamples].sort((left, right) => left - right);
  const renderedMessageIds = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]"),
    (element) => element.dataset.messageId).filter((id): id is string => Boolean(id));
  window.__transcriptBrowserSnapshot = {
    requestedMessages,
    totalMessages: messages().length,
    renderedRows: root.querySelectorAll("[data-test-chat-transcript-item]").length,
    uniqueRenderedMessages: new Set(renderedMessageIds).size,
    domNodes: root.querySelectorAll("*").length,
    mountMs: performance.now() - startedAt,
    appendP95Ms: sortedAppend[Math.max(0, Math.ceil(sortedAppend.length * 0.95) - 1)] ?? 0,
    clientHeight: root.clientHeight,
    scrollHeight: root.scrollHeight,
    distanceFromEnd: root.scrollHeight - root.scrollTop - root.clientHeight,
    ...(usedJsHeapBytes === undefined ? {} : { usedJsHeapBytes }),
    hasBlockquote: Boolean(root.querySelector("blockquote")),
    hasCode: Boolean(root.querySelector("code")),
    hasTable: Boolean(root.querySelector("table")),
    streamingRowPreserved: streamingRow !== null && updatedStreamingRow === streamingRow,
    streamingMarkdownUpdated: updatedStreamingRow?.querySelector("strong")?.textContent === "finished" || Boolean(streamBurst),
    streamingUpdateApplications,
    streamingText: updatedStreamingRow?.textContent ?? undefined,
    ...(streamBurst ?? {})
  };
  document.documentElement.dataset.transcriptReady = "1";
}

function createMessages(start: number, count: number): TranscriptMessage[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `message-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: markdownFor(index)
    };
  });
}

function markdownFor(index: number) {
  switch (index % 4) {
    case 0:
      return `## Update ${index}\n\nA paragraph with **strong text** and \`inline-${index}\`.`;
    case 1:
      return `> Evidence ${index}\n> remains visible in the bounded window.`;
    case 2:
      return `| Metric | Value |\n| --- | ---: |\n| Rows | ${index} |\n| Stable | yes |`;
    default:
      return `\`\`\`ts\nconst sample${index} = ${index};\n\`\`\``;
  }
}

function positiveCount(raw: string | null, fallback: number) {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeCount(raw: string | null, fallback: number) {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readUsedJsHeapBytes(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const bytes = Reflect.get(value, "usedJSHeapSize");
  return typeof bytes === "number" && Number.isFinite(bytes) ? bytes : undefined;
}

function settleLayout() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function waitForMessage(id: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const row = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (row) return row;
    await settleLayout();
  }
  return null;
}

async function waitForMarkdownUpdate(id: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const row = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (row?.querySelector("strong")?.textContent === "finished") return;
    await settleLayout();
  }
}

async function exerciseLargeStreamBurst(
  id: string,
  row: HTMLElement,
  setMessages: (update: (current: TranscriptMessage[]) => TranscriptMessage[]) => void
) {
  const largePrefix = Array.from(
    { length: 200 },
    (_, index) => `Paragraph ${index}: ${"measured markdown ".repeat(12)}`
  ).join("\n\n");
  let mutations = 0;
  const observer = new MutationObserver((records) => {
    mutations += records.length;
  });
  observer.observe(row, { childList: true, characterData: true, subtree: true });
  const startedAt = performance.now();
  for (let update = 0; update < 24; update += 1) {
    const content = `${largePrefix}\n\nUpdate ${update}`;
    setMessages((current) => current.map((message) => message.id === id
      ? { ...message, content, pending: true }
      : message));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  setMessages((current) => current.map((message) => message.id === id
    ? { ...message, content: `${largePrefix}\n\n**Burst final**`, pending: false }
    : message));
  const finalVisible = await waitForText(id, "Burst final");
  await settleLayout();
  observer.disconnect();
  return {
    streamBurstMutations: mutations,
    streamBurstContentApplications: streamingContentApplications,
    streamBurstMs: performance.now() - startedAt,
    streamBurstFinalVisible: finalVisible
  };
}

async function waitForText(id: string, text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (row?.textContent?.includes(text)) return true;
    await settleLayout();
  }
  return false;
}

export function mountTranscriptBrowserFixture() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Transcript browser fixture root is missing.");
  render(() => <FixtureApp />, root);
}
