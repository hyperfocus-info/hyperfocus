import { transcriptRowKey } from "./transcript-identity";
import { positiveNumberOr as positiveNumber, nonNegativeSafeIntegerOr as nonNegativeInteger, positiveSafeIntegerOr as positiveInteger } from "@hyperfocus/utilities/math";
import * as stylex from "@stylexjs/stylex";
import { createComponent, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";
import { Button } from "../primitives/button";
import { transcriptMarkdownComponents } from "./transcript-markdown";
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
  shell: { display: "flex", flexDirection: "column", height: "100%", maxWidth: "100%", minHeight: 0, minWidth: 0, },
  root: { padding: tokens.space1, flex: "1", outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` }, boxSizing: "border-box", outlineOffset: "-2px", overflowAnchor: "none", minHeight: 0, minWidth: 0, overflowX: "hidden", overflowY: "auto", },
  content: { position: "relative", width: "100%" },
  item: { boxSizing: "border-box", display: "flex", flexDirection: "column", position: "absolute", left: 0, paddingBottom: tokens.space6, top: 0, width: "100%" },
  empty: { margin: "auto", paddingBlock: tokens.space3, paddingInline: tokens.space2, color: tokens.muted, overflowWrap: "anywhere", textAlign: "start", maxWidth: "36rem", },
  message: { padding: tokens.space3, borderRadius: tokens.radiusSmall, boxSizing: "border-box", color: tokens.foreground, userSelect: "text", maxWidth: "100%", minWidth: 0, },
  assistant: { alignSelf: "stretch", backgroundColor: "transparent" },
  system: { alignSelf: "stretch", backgroundColor: "transparent", color: tokens.muted },
  user: { alignSelf: "flex-end", backgroundColor: tokens.panelRaised, maxWidth: "92%" },
  header: { gap: tokens.space2, color: tokens.muted, display: "flex", flexWrap: "wrap", marginBottom: tokens.space2, },
  markdown: { overflowWrap: "anywhere", minWidth: 0 },
  latest: { display: "flex", flexShrink: 0, justifyContent: "center", paddingTop: tokens.space2, },
  announcement: { margin: "-1px", padding: 0, overflow: "hidden", clipPath: "inset(50%)", position: "absolute", whiteSpace: "nowrap", height: "1px", width: "1px", },
});

const markdownRemarkPlugins = [remarkGfm, remarkBreaks];
const markdownRehypePlugins = [rehypeSanitize];

export function ChatTranscript(props: ChatTranscriptProps) {
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [viewportHeight, setViewportHeight] = createSignal(480);
  const [scrollOffset, setScrollOffset] = createSignal(0);
  const [measurementVersion, setMeasurementVersion] = createSignal(0);
  const [awayFromEnd, setAwayFromEnd] = createSignal(false);
  const estimateSize = createMemo(() => positiveNumber(props.estimateMessageHeight, 112));
  const overscan = nonNegativeInteger(props.overscan, 6);
  const retainedLimit = createMemo(() => positiveInteger(props.maxRetainedMessages, 512));
  const retainedStart = createMemo(() => Math.max(0, props.messages.length - retainedLimit()));
  const retainedMessages = createMemo(() => props.messages.slice(retainedStart()));
  const windowModel = createMeasuredWindowModel();
  let visibleRowCache = new Map<string, VisibleTranscriptRow>();
  let stuckToEnd = props.stickToEnd !== false;
  let endOffset = 0;
  let previousKeys: readonly string[] = [];
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
    const keys = messageKeys();
    const offset = untrack(scrollOffset);
    const anchorIndex = windowModel.indexAtOffset(offset);
    const anchorKey = previousKeys[anchorIndex];
    const withinRow = offset - windowModel.offsetAt(anchorIndex);
    windowModel.sync(keys, estimateSize());
    if (!stuckToEnd && anchorKey) {
      const nextIndex = keys.indexOf(anchorKey);
      if (nextIndex >= 0) preserveReadingOffset(windowModel.offsetAt(nextIndex) + withinRow);
    }
    previousKeys = keys;
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

  function scrollToEnd(force = false) {
    if ((!force && props.stickToEnd === false) || !retainedMessages().length) return;
    scheduleAfterLayout(() => {
      const element = viewport();
      if (!element) return;
      const nextOffset = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = nextOffset;
      endOffset = element.scrollTop;
      setScrollOffset(endOffset);
    });
  }

  function preserveReadingOffset(offset: number) {
    const next = Math.max(0, offset);
    setScrollOffset(next);
    scheduleAfterLayout(() => {
      const element = viewport();
      if (element && !stuckToEnd && scrollOffset() === next) element.scrollTop = next;
    });
  }

  function returnToLatest() {
    stuckToEnd = true;
    setAwayFromEnd(false);
    scrollToEnd(true);
    viewport()?.focus({ preventScroll: true });
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
    stuckToEnd = stuckToEnd && Math.abs(element.scrollTop - endOffset) <= 1 ||
      element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
    setAwayFromEnd(!stuckToEnd);
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
    const anchor = windowModel.indexAtOffset(scrollOffset());
    const anchorTop = windowModel.offsetAt(anchor);
    if (height > 0 && windowModel.measure(key, height)) {
      if (!stuckToEnd) preserveReadingOffset(scrollOffset() + windowModel.offsetAt(anchor) - anchorTop);
      setMeasurementVersion((version) => version + 1);
    }
  }

  function updateViewportSize(element: HTMLDivElement) {
    setViewportHeight(Math.max(1, element.clientHeight || element.getBoundingClientRect().height || 480));
    if (stuckToEnd) scrollToEnd();
  }

  function rowOffset(index: number) {
    structureSize();
    measurementVersion();
    return windowModel.offsetAt(index);
  }

  return (
    <div {...stylex.attrs(styles.shell)} data-test-transcript-shell="">
    <div
      {...stylex.attrs(styles.root)}
      ref={setViewport}
      data-test-chat-transcript=""
      role="log"
      aria-label="Chat transcript"
      aria-live="off"
      aria-relevant="additions text"
      tabindex="0"
      onScroll={(event) => trackScroll(event.currentTarget)}
      data-retained-message-count={retainedMessages().length}
      data-retained-start={retainedStart()}
    >
      <Show when={retainedMessages().length > 0} fallback={<p {...stylex.attrs(typography.body, styles.empty)}>{props.emptyMessage ?? "No messages yet."}</p>}>
        <Show when={(retainedStart() > 0 || props.hasPrevious) && props.onRequestPrevious}>
          <Button variant="secondary" size="small" tooltip="Request earlier conversation history" onClick={() => props.onRequestPrevious?.()}>
            {props.previousLabel ?? "Load earlier messages"}
          </Button>
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
                  style={{ transform: `translateY(${rowOffset(row.index())}px)` }}
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
    <Show when={awayFromEnd()}><div {...stylex.attrs(styles.latest)}><Button data-test-transcript-latest="" variant="secondary" size="small" tooltip="Scroll to the newest message" onClick={returnToLatest}>Return to latest</Button></div></Show>
    <div role="status" {...stylex.attrs(styles.announcement)}>{props.messages.at(-1)?.pending ? "Assistant is responding." : props.messages.length ? `${props.messages.length} messages in conversation.` : ""}</div>
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
        message().role === "user" && styles.user
      )}
      data-message-id={message().id}
      data-role={message().role}
    >
      <header {...stylex.attrs(typography.caption, styles.header)}>{message().role === "user" ? "You" : message().role === "assistant" ? "Assistant" : "System"}<Show when={message().pending}><span>Responding…</span></Show></header>
      <div {...stylex.attrs(typography.body, styles.markdown)}>
        {createComponent(SolidMarkdown, {
          components: transcriptMarkdownComponents,
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
