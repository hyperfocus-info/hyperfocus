import * as stylex from "@stylexjs/stylex";
import { createComponent, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { tokens } from "../theme/tokens.stylex";
import { createCoalescedText } from "./coalesced-text";
import { createMeasuredWindowModel } from "./measured-window-model";

export type TranscriptMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  pending?: boolean;
};

export type ChatTranscriptProps = {
  messages: readonly TranscriptMessage[];
  emptyMessage?: string;
  estimateMessageHeight?: number;
  overscan?: number;
  stickToEnd?: boolean;
  streamRenderIntervalMs?: number;
  /** Bounds presentation-owned measurements and Markdown owners; hosts should page durable history separately. */
  maxRetainedMessages?: number;
  hasPrevious?: boolean;
  previousLabel?: string;
  onRequestPrevious?: () => void;
  onStreamContentApplied?: (messageId: string, contentLength: number) => void;
};

type VisibleTranscriptRow = {
  index: () => number;
  setIndex: (index: number) => void;
  key: string;
};

const styles = stylex.create({
  root: { padding: "0.25rem", overflow: "auto", minHeight: 0, },
  content: { position: "relative", width: "100%" },
  item: { boxSizing: "border-box", display: "flex", flexDirection: "column", position: "absolute", left: 0, paddingBottom: "0.65rem", top: 0, width: "100%" },
  empty: { margin: "auto", padding: "2rem", color: tokens.muted, fontSize: "0.8rem", textAlign: "center", },
  message: { padding: "0.7rem", borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", color: tokens.foreground, maxWidth: "92%", },
  assistant: { alignSelf: "flex-start", backgroundColor: tokens.panel },
  system: { alignSelf: "stretch", backgroundColor: "transparent", color: tokens.muted, maxWidth: "100%" },
  user: { alignSelf: "flex-end", backgroundColor: tokens.panelRaised },
  pending: { opacity: 0.72 },
  header: { color: tokens.muted, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
  markdown: { fontSize: "0.78rem", lineHeight: 1.55, overflowWrap: "anywhere" }
});

const markdownRemarkPlugins = [remarkGfm, remarkBreaks];
const markdownRehypePlugins = [rehypeSanitize];

export function ChatTranscript(props: ChatTranscriptProps) {
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [viewportHeight, setViewportHeight] = createSignal(480);
  const [scrollOffset, setScrollOffset] = createSignal(0);
  const [measurementVersion, setMeasurementVersion] = createSignal(0);
  const estimateSize = createMemo(() => positiveNumber(props.estimateMessageHeight, 112));
  const overscan = nonNegativeInteger(props.overscan, 6);
  const retainedLimit = createMemo(() => positiveInteger(props.maxRetainedMessages, 512));
  const retainedStart = createMemo(() => Math.max(0, props.messages.length - retainedLimit()));
  const retainedMessages = createMemo(() => props.messages.slice(retainedStart()));
  const windowModel = createMeasuredWindowModel();
  let visibleRowCache = new Map<string, VisibleTranscriptRow>();
  let stuckToEnd = true;
  let programmaticOffset = 0;
  const rowObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (!(entry.target instanceof HTMLDivElement)) continue;
      const element = entry.target;
      if (element === viewport()) updateViewportSize(element);
      else measureRow(element, entry);
    }
  }) : undefined;
  const messageKeys = createMemo(() => retainedMessages().map((message, index) => transcriptRowKey(message.id, retainedStart() + index)));
  const structureSize = createMemo(() => {
    windowModel.sync(messageKeys(), estimateSize());
    return windowModel.totalSize;
  });
  const totalSize = createMemo(() => {
    structureSize();
    measurementVersion();
    return windowModel.totalSize;
  });
  const visibleRows = createMemo(() => {
    const messages = retainedMessages();
    if (messages.length === 0) return [];
    structureSize();
    measurementVersion();
    const { first, last } = windowModel.windowAt(scrollOffset(), viewportHeight(), overscan);
    const nextCache = new Map<string, VisibleTranscriptRow>();
    const rows: VisibleTranscriptRow[] = [];
    for (let index = first; index <= last; index += 1) {
      const key = transcriptRowKey(messages[index].id, retainedStart() + index);
      const row = visibleRowCache.get(key) ?? createVisibleTranscriptRow(index, key);
      row.setIndex(index);
      nextCache.set(key, row);
      rows.push(row);
    }
    visibleRowCache = nextCache;
    return rows;
  });

  function scrollToEnd() {
      if (props.stickToEnd === false || !retainedMessages().length) return;
    scheduleAfterLayout(() => {
      const element = viewport();
      if (!element) return;
      const nextOffset = Math.max(0, totalSize() - element.clientHeight);
      programmaticOffset = nextOffset;
      element.scrollTop = nextOffset;
      setScrollOffset(nextOffset);
    });
  }

  onMount(() => {
    const element = viewport();
    if (element) {
      updateViewportSize(element);
      rowObserver?.observe(element);
    }
    scrollToEnd();
  });
  onCleanup(() => rowObserver?.disconnect());
  createEffect(on(
      () => retainedMessages().length,
    (count, previous) => {
      if (count > (previous ?? 0) && stuckToEnd) scrollToEnd();
    },
    { defer: true }
  ));
  createEffect(on(
    totalSize,
    () => {
      if (stuckToEnd) scrollToEnd();
    },
    { defer: true }
  ));

  function trackScroll(element: HTMLDivElement) {
    setScrollOffset(element.scrollTop);
    stuckToEnd = Math.abs(element.scrollTop - programmaticOffset) <= 1 ||
      element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
  }

  function attachRow(element: HTMLDivElement) {
    rowObserver?.observe(element);
    scheduleAfterLayout(() => measureRow(element));
    onCleanup(() => rowObserver?.unobserve(element));
  }

  function measureRow(element: HTMLDivElement, entry?: ResizeObserverEntry) {
    const key = element.dataset.virtualKey;
    if (!key || !element.isConnected) return;
    const borderSize = entry?.borderBoxSize[0]?.blockSize;
    const height = Math.ceil(borderSize || element.getBoundingClientRect().height || element.offsetHeight);
    if (height > 0 && windowModel.measure(key, height)) {
      setMeasurementVersion((version) => version + 1);
    }
  }

  function updateViewportSize(element: HTMLDivElement) {
    setViewportHeight(Math.max(1, element.clientHeight || element.getBoundingClientRect().height || 480));
  }

  return (
    <div
      {...stylex.attrs(styles.root)}
      ref={setViewport}
      data-test-chat-transcript=""
      role="log"
      aria-label="Chat transcript"
      aria-live="polite"
      aria-relevant="additions text"
      onScroll={(event) => trackScroll(event.currentTarget)}
      data-retained-message-count={retainedMessages().length}
      data-retained-start={retainedStart()}
    >
      <Show when={retainedMessages().length > 0} fallback={<p {...stylex.attrs(styles.empty)}>{props.emptyMessage ?? "No messages yet."}</p>}>
        <Show when={(retainedStart() > 0 || props.hasPrevious) && props.onRequestPrevious}>
          <button type="button" onClick={() => props.onRequestPrevious?.()}>
            {props.previousLabel ?? "Load earlier messages"}
          </button>
        </Show>
        <div {...stylex.attrs(styles.content)} style={{ height: `${totalSize()}px` }} data-test-chat-transcript-content="">
          <For each={visibleRows()}>
            {(row) => {
              return (
                <div
                  {...stylex.attrs(styles.item)}
                  ref={attachRow}
                  data-index={row.index()}
                  data-virtual-key={row.key}
                  data-test-chat-transcript-item=""
                  style={{ transform: `translateY(${windowModel.offsetAt(row.index())}px)` }}
                >
                  <TranscriptMessageRow
                    getMessage={() => retainedMessages()[row.index()]}
                    streamRenderIntervalMs={props.streamRenderIntervalMs}
                    onStreamContentApplied={props.onStreamContentApplied}
                  />
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function TranscriptMessageRow(props: {
  getMessage: () => TranscriptMessage;
  streamRenderIntervalMs?: number;
  onStreamContentApplied?: (messageId: string, contentLength: number) => void;
}) {
  const message = createMemo(props.getMessage);
  const content = createCoalescedText(
    () => message().content,
    {
      enabled: () => Boolean(message().pending),
      intervalMs: () => props.streamRenderIntervalMs,
      onApply(value) {
        props.onStreamContentApplied?.(message().id, value.length);
      }
    }
  );
  return (
    <article
      {...stylex.attrs(
        styles.message,
        message().role === "assistant" && styles.assistant,
        message().role === "system" && styles.system,
        message().role === "user" && styles.user,
        message().pending && styles.pending
      )}
      data-message-id={message().id}
      data-role={message().role}
    >
      <header {...stylex.attrs(styles.header)}>{message().role}</header>
      <div {...stylex.attrs(styles.markdown)}>
        {createComponent(SolidMarkdown, {
          remarkPlugins: markdownRemarkPlugins,
          rehypePlugins: markdownRehypePlugins,
          get renderingStrategy() {
            return message().pending ? "reconcile" : "memo";
          },
          skipHtml: true,
          get children() {
            return content();
          }
        })}
      </div>
    </article>
  );
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function transcriptRowKey(id: string, index: number) {
  return `${id}:${index}`;
}

function createVisibleTranscriptRow(index: number, key: string): VisibleTranscriptRow {
  const [readIndex, setIndex] = createSignal(index);
  return { index: readIndex, setIndex, key };
}

function scheduleAfterLayout(callback: () => void) {
  queueMicrotask(() => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => callback());
    else callback();
  });
}
