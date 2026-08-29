/** @jsxImportSource solid-js */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Logs, Terminal } from "lucide-solid";
import type { ExecutionToolActivity } from "@hyperfocus/ai-core/protocol";
import type { TimelineToolBlock } from "../lib/chat-timeline-model";
import { formatShortTimestamp } from "../lib/time-format";
import {
  formatToolActivityCopyText,
  formatToolActivityOwner,
  formatToolActivitySnippet,
  formatToolActivityTooltip,
  formatToolInvocationDescription,
  formatToolMetadata,
  getToolActivityDetailSections
} from "../lib/tool-activity-format";
import { ActionButton } from "./action-button";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { CopyTextButton } from "./primitives/copy-text-button";
import { Dialog } from "./primitives/dialog";

type StreamedToolBlockProps = {
  block: TimelineToolBlock;
  fileLinks?: FileLinkConfig;
  selectedActivityId?: string;
  onSelectedActivityIdChange?: (activityId?: string) => void;
};

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  root: { padding: "0.75rem", borderColor: "var(--border)", borderRadius: "1rem", borderStyle: "solid", borderWidth: "1px", backgroundColor: "rgb(255 255 255 / 0.55)", },
  header: { gap: "0.75rem", alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", },
  heading: { gap: "0.5rem", alignItems: "center", color: "var(--muted)", display: "flex", fontSize: "0.585rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", minWidth: 0, },
  icon: { height: "0.875rem", width: "0.875rem" },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { gap: "0.5rem", alignItems: "center", display: "flex", flexShrink: 0, },
  activityList: { gap: "0.25rem", display: "flex", flexDirection: "column", },
  activityListExpanded: { overflowY: "visible" },
  activityListCollapsed: { maxHeight: "10rem", overflowY: "auto", paddingRight: "0.25rem" },
  activityRow: { borderRadius: "0.5rem",
 gap: "0.5rem",
 paddingBlock: '0.375rem',
 paddingInline: '0.5rem',
 alignItems: "start",
 backgroundColor: { default: "transparent", ":hover": "rgb(255 255 255 / 0.8)" },
 color: "var(--foreground)",
 display: "grid",
 fontSize: "0.65rem",
 gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
 textAlign: "left",
 width: "100%", },
  activityDescription: { borderRadius: "0.5rem", outline: { default: "none", ":focus-visible": "none" }, boxShadow: { default: "none", ":focus-visible": "0 0 0 2px var(--ring)" }, cursor: "pointer", minWidth: 0, },
  activityIdentity: { gap: "0.25rem", alignItems: "center", display: "flex", minWidth: 0, },
  activityOwner: { overflow: "hidden", fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap", },
  muted: { color: "var(--muted)" },
  activityToolName: { overflow: "hidden", color: "var(--muted)", textOverflow: "ellipsis", whiteSpace: "nowrap", },
  invocationDescription: { overflow: "hidden", color: "var(--muted)", display: "block", fontSize: "0.62rem", lineHeight: "1rem", textOverflow: "ellipsis", whiteSpace: "nowrap", },
  toolCallSnippet: { borderColor: "var(--border)",
 borderRadius: "0.5rem",
 borderStyle: "solid",
 borderWidth: "1px",
 overflow: "hidden",
 paddingBlock: '0.32rem',
 paddingInline: '0.45rem',
 WebkitBoxOrient: "vertical",
 WebkitLineClamp: 3,
 backgroundColor: "var(--panel-strong)",
 color: "var(--foreground)",
 display: "-webkit-box",
 fontSize: "0.62rem",
 letterSpacing: 0,
 lineHeight: 1.45,
 overflowWrap: "anywhere",
 marginTop: "0.25rem",
 maxWidth: "100%", },
  activityStatus: { color: "var(--accent-strong)", flexShrink: 0, letterSpacing: "0.12em", textTransform: "uppercase" },
  detailButton: { flexShrink: 0, height: "1.75rem", width: "1.75rem", },
  footer: { gap: "0.75rem", alignItems: "center", color: "var(--muted)", display: "flex", fontSize: "0.575rem", justifyContent: "space-between", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "0.5rem", },
  dialog: { maxWidth: "64rem" },
  dialogContent: { maxHeight: "85vh" },
  dialogBody: { gap: "0.75rem", display: "flex", flexDirection: "column", fontSize: "0.75rem", },
  dialogSummary: { padding: "0.75rem", borderColor: "var(--border)", borderRadius: "0.75rem", borderStyle: "solid", borderWidth: "1px", gap: "0.75rem", alignItems: "start", backgroundColor: "rgb(255 255 255 / 0.7)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", },
  dialogSummaryCopy: { color: "var(--muted)",
 flexBasis: '0%',
 flexGrow: '1',
 flexShrink: '1',
 lineHeight: "1.25rem",
 minWidth: 0, },
  detailBlock: { padding: "0.75rem", borderColor: "var(--border)", borderRadius: "0.75rem", borderStyle: "solid", borderWidth: "1px", backgroundColor: "rgb(255 255 255 / 0.7)", },
  detailHeader: { gap: "0.75rem", alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", },
  detailTitle: { color: "var(--muted)", fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" },
  detailValue: { overflow: "visible", fontSize: "0.7rem", lineHeight: "1.25rem", overflowWrap: "break-word", whiteSpace: "pre-wrap", },
  monospace: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  danger: { color: "rgb(190 18 60)" },
  foreground: { color: "var(--foreground)" },
  spinning: { animationDuration: "1s", animationIterationCount: "infinite", animationName: spin, animationTimingFunction: "linear", },
  success: { color: "rgb(5 150 105)" },
  failure: { color: "rgb(225 29 72)" }
});

export function StreamedToolBlock(props: StreamedToolBlockProps) {
  let scroller: HTMLDivElement | undefined;
  const [expanded, setExpanded] = createSignal(false);
  const [atBottom, setAtBottom] = createSignal(true);
  const [internalSelectedActivityId, setInternalSelectedActivityId] = createSignal<string>();
  const activityKey = createMemo(() => props.block.activities.map((activity) => `${activity.id}:${activity.updatedAt}:${activity.status}`).join("|"));
  const selectedActivityId = () => (props.selectedActivityId !== undefined ? props.selectedActivityId : internalSelectedActivityId());

  function setSelectedActivityId(activityId?: string) {
    if (props.onSelectedActivityIdChange) {
      props.onSelectedActivityIdChange(activityId);
      return;
    }
    setInternalSelectedActivityId(activityId);
  }

  function openActivityDetails(activityId: string) {
    setSelectedActivityId(activityId);
  }

  const updateAtBottom = () => {
    if (!scroller) {
      setAtBottom(true);
      return;
    }
    setAtBottom(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4);
  };

  const scrollToBottom = () => {
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      setAtBottom(true);
    }
  };

  createEffect(() => {
    activityKey();
    if (atBottom()) {
      queueMicrotask(scrollToBottom);
    }
  });

  return (
    <article {...stylex.attrs(styles.root)} data-test-streamed-tool-block="">
      <div {...stylex.attrs(styles.header)}>
        <div {...stylex.attrs(styles.heading)}>
          <Terminal {...stylex.attrs(styles.icon)} />
          <span {...stylex.attrs(styles.truncate)}>Tool calls ({props.block.activities.length})</span>
        </div>
        <div {...stylex.attrs(styles.actions)}>
          <Show when={!atBottom()}>
            <ActionButton tooltip="Scroll tool calls to latest" icon={<ArrowDown {...stylex.attrs(styles.icon)} />} size="icon" variant="ghost" ariaLabel="Scroll tool calls to latest" onClick={scrollToBottom} />
          </Show>
          <ActionButton
            tooltip={expanded() ? "Collapse tool call block" : "Show all tool calls"}
            icon={expanded() ? <ChevronUp {...stylex.attrs(styles.icon)} /> : <ChevronDown {...stylex.attrs(styles.icon)} />}
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? "Less" : "Show all"}
          </ActionButton>
        </div>
      </div>
      <div
        ref={scroller}
        {...stylex.attrs(styles.activityList, expanded() ? styles.activityListExpanded : styles.activityListCollapsed)}
        onScroll={updateAtBottom}
      >
        <For each={props.block.activities}>
          {(activity) => (
            <article
              {...stylex.attrs(styles.activityRow)}
              title={formatToolActivityTooltip(activity)}
              onClick={(event) => {
                if (shouldIgnoreActivityRowClick(event.target)) {
                  return;
                }
                openActivityDetails(activity.id);
              }}
            >
              <ToolActivityStatusIcon status={activity.status} />
              <div
                {...stylex.attrs(styles.activityDescription)}
                role="button"
                tabIndex={0}
                aria-label={`Show details for ${formatToolActivitySnippet(activity, 96)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openActivityDetails(activity.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  openActivityDetails(activity.id);
                }}
              >
                <span {...stylex.attrs(styles.activityIdentity)}>
                  <span {...stylex.attrs(styles.activityOwner)}>{formatToolActivityOwner(activity)}</span>
                  <span {...stylex.attrs(styles.muted)}>|</span>
                  <span {...stylex.attrs(styles.activityToolName)}>{activity.toolName}</span>
                </span>
                <span {...stylex.attrs(styles.invocationDescription)}>
                  {formatToolInvocationDescription(activity)}
                </span>
                <span {...stylex.attrs(styles.toolCallSnippet)}>
                  <FileLinkedText text={formatToolActivitySnippet(activity)} fileLinks={props.fileLinks} />
                </span>
              </div>
              <span {...stylex.attrs(styles.activityStatus)}>
                {activity.exitCode === undefined ? activity.status : `${activity.status} ${activity.exitCode}`}
              </span>
              <ActionButton
                tooltip="Show tool call details"
                icon={<Logs {...stylex.attrs(styles.icon)} />}
                size="icon"
                variant="secondary"
                ariaLabel={`Show details for ${activity.toolName} ${activity.toolCallId}`}
                class={stylex.attrs(styles.detailButton).class}
                onClick={(event) => {
                  event.stopPropagation();
                  openActivityDetails(activity.id);
                }}
              />
            </article>
          )}
        </For>
      </div>
      <div {...stylex.attrs(styles.footer)}>
        <span>{formatShortTimestamp(props.block.updatedAt)}</span>
        <CopyTextButton value={props.block.activities.map(formatToolActivityCopyText).join("\n\n---\n\n")} tooltip="Copy tool calls" copiedTitle="Tool calls copied" copiedDescription="Tool call details copied to clipboard." size="sm" variant="ghost" ariaLabel="Copy tool calls">
          Copy
        </CopyTextButton>
      </div>
      <Show when={selectedActivityId()}>
        {(activityId) => {
          const activity = () => props.block.activities.find((candidate) => candidate.id === activityId());
          return (
            <Show when={activity()}>
              {(selectedActivity) => (
                <Dialog
                  open
                  title={`${selectedActivity().toolName} ${selectedActivity().status}`}
                  eyebrow="Tool call"
                  class={stylex.attrs(styles.dialog).class}
                  contentClass={stylex.attrs(styles.dialogContent).class}
                  onClose={() => setSelectedActivityId(undefined)}
                >
                  <div {...stylex.attrs(styles.dialogBody)}>
                    <div {...stylex.attrs(styles.dialogSummary)}>
                      <div {...stylex.attrs(styles.dialogSummaryCopy)}>
                        {formatToolInvocationDescription(selectedActivity())}
                      </div>
                      <CopyTextButton
                        value={formatToolActivityCopyText(selectedActivity())}
                        tooltip="Copy tool call details"
                        copiedTitle="Tool call copied"
                        copiedDescription="Tool call details copied to clipboard."
                        size="sm"
                        variant="secondary"
                        ariaLabel="Copy tool call details"
                      >
                        Copy details
                      </CopyTextButton>
                    </div>
                    <DetailBlock title="Metadata" value={formatToolMetadata(selectedActivity())} fileLinks={props.fileLinks} />
                    <For each={getToolActivityDetailSections(selectedActivity())}>
                      {(section) => (
                        <DetailBlock
                          title={section.title}
                          value={section.value}
                          mono={section.mono}
                          tone={section.tone}
                          copyTooltip={section.copyTooltip}
                          fileLinks={props.fileLinks}
                        />
                      )}
                    </For>
                  </div>
                </Dialog>
              )}
            </Show>
          );
        }}
      </Show>
    </article>
  );
}

function shouldIgnoreActivityRowClick(target: EventTarget | null) {
  return Boolean(target instanceof HTMLElement && target.closest("button, a, input, textarea, select"));
}

function DetailBlock(props: { title: string; value: string; mono?: boolean; tone?: "danger"; copyTooltip?: string; fileLinks?: FileLinkConfig }) {
  return (
    <section {...stylex.attrs(styles.detailBlock)}>
      <div {...stylex.attrs(styles.detailHeader)}>
        <div {...stylex.attrs(styles.detailTitle)}>{props.title}</div>
        <Show when={props.copyTooltip}>
          {(tooltip) => (
            <CopyTextButton
              value={props.value}
              tooltip={tooltip()}
              copiedTitle={`${props.title} copied`}
              copiedDescription={`${props.title} copied to clipboard.`}
              size="sm"
              variant="ghost"
              ariaLabel={tooltip()}
            >
              Copy
            </CopyTextButton>
          )}
        </Show>
      </div>
      <pre
        {...stylex.attrs(
          styles.detailValue,
          props.mono && styles.monospace,
          props.tone === "danger" ? styles.danger : styles.foreground
        )}
      >
        <FileLinkedText text={props.value} fileLinks={props.fileLinks} />
      </pre>
    </section>
  );
}

function ToolActivityStatusIcon(props: { status: ExecutionToolActivity["status"] }) {
  switch (props.status) {
    case "running":
      return <LoaderCircle {...stylex.attrs(styles.icon, styles.spinning)} aria-label="Tool running" />;
    case "completed":
      return <CheckCircle2 {...stylex.attrs(styles.icon, styles.success)} aria-label="Tool completed" />;
    case "failed":
    case "timed-out":
      return <CircleAlert {...stylex.attrs(styles.icon, styles.failure)} aria-label="Tool failed" />;
  }
}
