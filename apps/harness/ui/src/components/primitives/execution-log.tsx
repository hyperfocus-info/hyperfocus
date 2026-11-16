import { executionLogLevelTone } from "./execution-log/level-tone";
/** @jsxImportSource solid-js */
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Logs } from "lucide-solid";
import { Show,createMemo,createSignal } from "solid-js";
import { formatShortTimestamp } from "../../lib/time-format";
import { cn } from "../../lib/utils";
import { FileLinkedText,type FileLinkConfig } from "../file-linked-text";
import { MarkdownContent } from "../markdown-content";
import { buttonVariants } from "./button";
import { CopyTextButton } from "./copy-text-button";
import { Dialog } from "./dialog";
import { Tooltip } from "./tooltip";
import { VirtualList } from "./virtual-list";

const defaultSummaryLength = 250;

export type ExecutionLogEntry = {
  id: string;
  message: string;
  rowSummary?: string;
  level: string;
  createdAt: string | number | Date | undefined;
  detail?: string;
  detailKind?: "markdown" | "plain";
  detailsJson?: unknown;
  detailsJsonSummary?: string;
  copyText?: string;
};

type ExecutionLogProps = {
  entries: ExecutionLogEntry[];
  emptyMessage?: string;
  summaryLength?: number;
  detailEyebrow?: string;
  selectedEntryId?: string;
  onSelectedEntryIdChange?: (entryId?: string) => void;
  onEntrySourceClick?: (entry: ExecutionLogEntry) => void;
  rowVariant?: "card" | "flat";
  fileLinks?: FileLinkConfig;
  class?: string;
};

const styles = stylex.create({
  root: { flex: "1", display: "flex", flexDirection: "column", minHeight: 0, },
  empty: { color: "var(--muted)", fontSize: tokens.fontBody },
  flatEmpty: { borderColor: "var(--border)",
 borderStyle: "dashed",
 borderBottomWidth: '0',
 borderLeftWidth: '2px',
 borderRightWidth: '0',
 borderTopWidth: '0',
 paddingBottom: '0.75rem',
 paddingLeft: '1rem',
 paddingRight: '0',
 paddingTop: '0.75rem', },
  cardEmpty: { padding: "0.75rem", borderColor: "var(--border)", borderRadius: "0.9rem", borderStyle: "dashed", borderWidth: "1px", backgroundColor: "var(--panel)", },
  list: { flex: "1", minHeight: 0, minWidth: 0, overflowX: "hidden", paddingRight: "0.5rem" },
  listContent: { minWidth: 0, width: "100%" },
  listItem: { minWidth: 0, paddingBottom: "0.75rem" },
  row: { borderColor: "var(--border)", borderStyle: "solid" },
  flatRow: { borderBottomWidth: '0',
 borderLeftWidth: '2px',
 borderRightWidth: '0',
 borderTopWidth: '0',
 paddingBottom: '0.75rem',
 paddingLeft: '1rem',
 paddingRight: '0.5rem',
 paddingTop: '0.75rem', },
  cardRow: { padding: "0.75rem", borderRadius: "0.9rem", borderWidth: "1px", backgroundColor: "var(--panel)", },
  interactiveRow: { borderColor: { default: null, ":hover": "var(--accent-strong)" }, outline: { default: null, ":focus-visible": "none" }, backgroundColor: { default: null, ":hover": "var(--panel-strong)" }, boxShadow: { default: null, ":focus-visible": "0 0 0 2px var(--ring)" }, cursor: "pointer", transitionDuration: "150ms", transitionProperty: "background-color, border-color", },
  error: { borderColor: tokens.danger },
  warningBorder: { borderColor: tokens.warning },
  success: { borderColor: tokens.success },
  running: { borderColor: tokens.accent },
  neutralBorder: { borderColor: "var(--border)" },
  rowLayout: { gap: "0.75rem", alignItems: "flex-start", display: "flex", flexWrap: "wrap", justifyContent: "space-between", },
  rowCopy: { flexBasis: '16rem',
 flexGrow: '1',
 flexShrink: '1',
 overflowWrap: "anywhere",
 minWidth: 0, },
  interactiveCopy: { borderRadius: "0.5rem", outline: { default: null, ":focus-visible": "none" }, boxShadow: { default: null, ":focus-visible": "0 0 0 2px var(--ring)" }, },
  summary: { color: "var(--foreground)", fontSize: tokens.fontBody, overflowWrap: "break-word" },
  metadata: { color: "var(--muted)", fontSize: tokens.fontCaption, letterSpacing: "normal", overflowWrap: "anywhere", textTransform: "none", marginTop: "0.25rem", },
  detailsButton: { flexShrink: 0 },
  icon: { height: "1rem", width: "1rem" },
  dialog: { maxWidth: "48rem" },
  dialogContent: { maxHeight: "80vh" },
  details: { gap: tokens.space3, display: "flex", flexDirection: "column", overflowWrap: "anywhere", minWidth: 0, },
  copyAction: { display: "flex", justifyContent: "flex-end" },
  disclosure: { paddingBlock: tokens.space2, cursor: "pointer", fontSize: tokens.fontControl, minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch }, },
  plainDetail: { padding: tokens.space3, borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", overflow: "auto", backgroundColor: tokens.background, color: tokens.foreground, fontSize: tokens.fontBody, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap", },
  json: { padding: tokens.space3, borderRadius: tokens.radiusSmall, overflow: "auto", backgroundColor: tokens.background, color: tokens.foreground, fontSize: tokens.fontCaption, lineHeight: 1.5, maxWidth: "100%", },
  warning: { padding: tokens.space3, borderColor: tokens.warning, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", color: tokens.foreground, fontSize: tokens.fontBody, }
});

export function ExecutionLog(props: ExecutionLogProps) {
  const [internalSelectedEntryId, setInternalSelectedEntryId] = createSignal<string>();
  const summaryLength = () => props.summaryLength ?? defaultSummaryLength;
  const selectedEntryId = () => {
    const controlledEntryId = props.selectedEntryId;
    return controlledEntryId !== undefined ? controlledEntryId : internalSelectedEntryId();
  };
  const selectedEntry = createMemo(() => {
    const entryId = selectedEntryId();
    return entryId ? props.entries.find((entry) => entry.id === entryId) : undefined;
  });

  function setSelectedEntryId(entryId?: string) {
    if (props.onSelectedEntryIdChange) {
      props.onSelectedEntryIdChange(entryId);
      return;
    }
    setInternalSelectedEntryId(entryId);
  }

  function openEntryDetails(entryId: string) {
    setSelectedEntryId(entryId);
  }

  function openEntrySource(entry: ExecutionLogEntry) {
    props.onEntrySourceClick?.(entry);
  }

  function shouldIgnoreRowSourceClick(target: EventTarget | null) {
    return Boolean(
      target instanceof HTMLElement &&
        target.closest("button, a, input, textarea, select, [data-execution-log-source-action]")
    );
  }

  return (
    <div data-test-execution-log="" class={cn(stylex.attrs(styles.root).class, props.class)}>
      <Show
        when={props.entries.length > 0}
        fallback={
          <div
            class={cn(
              stylex.attrs(styles.empty, props.rowVariant === "flat" ? styles.flatEmpty : styles.cardEmpty).class
            )}
          >
            {props.emptyMessage ?? "No execution log yet."}
          </div>
        }
      >
        <VirtualList
          class={stylex.attrs(styles.list).class}
          contentClass={stylex.attrs(styles.listContent).class}
          itemClass={stylex.attrs(styles.listItem).class}
          items={props.entries}
          getKey={(entry) => entry.id}
          estimateSize={118}
          pagination={{ kind: "reverse", initialCount: 80, batchSize: 80 }}
        >
          {(entry) => {
            const rowSummary = () => entry.rowSummary ?? entry.message;
            return (
              <>
                <article
                  class={cn(
                    stylex.attrs(
                      styles.row,
                      props.rowVariant === "flat" ? styles.flatRow : styles.cardRow,
                      styles[executionLogLevelTone(entry.level)],
                      Boolean(props.onEntrySourceClick) && styles.interactiveRow
                    ).class
                  )}
                  onClick={(event) => {
                    if (!props.onEntrySourceClick || shouldIgnoreRowSourceClick(event.target)) {
                      return;
                    }
                    openEntrySource(entry);
                  }}
                >
                  <div {...stylex.attrs(styles.rowLayout)}>
                    <div
                      class={cn(
                        stylex.attrs(styles.rowCopy, Boolean(props.onEntrySourceClick) && styles.interactiveCopy).class
                      )}
                      data-execution-log-source-action={props.onEntrySourceClick ? "" : undefined}
                      role={props.onEntrySourceClick ? "button" : undefined}
                      aria-label={props.onEntrySourceClick ? `Open source for ${entry.message}` : undefined}
                      tabIndex={props.onEntrySourceClick ? 0 : undefined}
                      onClick={(event) => {
                        if (!props.onEntrySourceClick) {
                          return;
                        }
                        event.stopPropagation();
                        openEntrySource(entry);
                      }}
                      onKeyDown={(event) => {
                        if (!props.onEntrySourceClick || (event.key !== "Enter" && event.key !== " ")) {
                          return;
                        }
                        event.preventDefault();
                        openEntrySource(entry);
                      }}
                    >
                      <div {...stylex.attrs(styles.summary)}>
                        <FileLinkedText text={() => truncateLogText(rowSummary(), summaryLength())} fileLinks={props.fileLinks} />
                      </div>
                      <div {...stylex.attrs(styles.metadata)}>
                        {entry.level} | {formatShortTimestamp(entry.createdAt)}
                      </div>
                    </div>
                    <Tooltip content="Show execution log details">
                      <button
                        class={cn(buttonVariants({ variant: "secondary", size: "icon" }), stylex.attrs(styles.detailsButton).class)}
                        type="button"
                        aria-label={`Show details for ${entry.message}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEntryDetails(entry.id);
                        }}
                      >
                        <Logs {...stylex.attrs(styles.icon)} />
                      </button>
                    </Tooltip>
                  </div>
                </article>
              </>
            );
          }}
        </VirtualList>
      </Show>

      <Show when={selectedEntry()}>
        {(entry) => (
          <Dialog
            open
            title={truncateLogText(entry().message, 96)}
            eyebrow={props.detailEyebrow ?? "Execution log details"}
            description={`${entry().level} | ${formatShortTimestamp(entry().createdAt)}`}
            class={stylex.attrs(styles.dialog).class}
            contentClass={stylex.attrs(styles.dialogContent).class}
            onClose={() => setSelectedEntryId(undefined)}
          >
            <div {...stylex.attrs(styles.details)}>
              <Show when={entry().copyText ?? [entry().message, entry().detail, entry().detailsJson === undefined ? undefined : JSON.stringify(entry().detailsJson, null, 2)].filter(Boolean).join("\n\n")}>
                {(copyText) => (
                  <div {...stylex.attrs(styles.copyAction)}>
                    <CopyTextButton
                      value={copyText()}
                      tooltip="Copy execution log details"
                      copiedTitle="Execution log copied"
                      copiedDescription="Execution log details copied to clipboard."
                      size="sm"
                      variant="secondary"
                      ariaLabel="Copy execution log details"
                    >
                      Copy details
                    </CopyTextButton>
                  </div>
                )}
              </Show>
              <MarkdownContent content={entry().message} size="compact" fileLinks={props.fileLinks} />
              <Show when={entry().detail}>
                {(detail) => (
                  <Show
                    when={entry().detailKind === "plain"}
                    fallback={<MarkdownContent content={detail()} tone="muted" size="compact" fileLinks={props.fileLinks} />}
                  >
                    <pre {...stylex.attrs(styles.plainDetail)}>
                      <FileLinkedText text={detail()} fileLinks={props.fileLinks} />
                    </pre>
                  </Show>
                )}
              </Show>
              <Show when={entry().detailsJson !== undefined}>
                <details><summary {...stylex.attrs(styles.disclosure)}>Structured event data</summary>
                <pre {...stylex.attrs(styles.json)}>
                  <FileLinkedText text={() => JSON.stringify(entry().detailsJson, null, 2)} fileLinks={props.fileLinks} />
                </pre>
                </details>
              </Show>
              <Show when={entry().detailsJsonSummary}>
                {(summary) => (
                  <div {...stylex.attrs(styles.warning)}>
                    <FileLinkedText text={summary()} fileLinks={props.fileLinks} />
                  </div>
                )}
              </Show>
            </div>
          </Dialog>
        )}
      </Show>
    </div>
  );
}

export function truncateLogText(value: string, maxLength = defaultSummaryLength) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
