import * as stylex from "@stylexjs/stylex";
import type { ChatTimelineRow } from "../../lib/chat-timeline-model";
import { formatShortTimestamp } from "../../lib/time-format";
import { MarkdownContent, type MarkdownContentProps } from "../markdown-content";
import { CopyTextButton } from "../primitives/copy-text-button";
import { StreamedToolBlock } from "../streamed-tool-block";
import { chatPanelStyles as styles } from "../chat-panel.styles";

type TransientTranscriptRow = Exclude<ChatTimelineRow, { kind: "persisted" }>;

export function TransientTranscriptRow(props: {
  row: TransientTranscriptRow;
  agentLabel: string;
  fileLinks: MarkdownContentProps["fileLinks"];
  liveMessageCount: number;
  timestamp: string | number | Date | undefined;
}) {
  if (props.row.kind === "tool-block") {
    return <StreamedToolBlock block={props.row.block} fileLinks={props.fileLinks} />;
  }
  const row = props.row;
  return (
    <article {...stylex.attrs(styles.transcriptMessage)}>
      <div {...stylex.attrs(styles.transcriptAvatar)} aria-hidden="true">{props.agentLabel.trim().slice(0, 1).toUpperCase() || "A"}</div>
      <div
        {...stylex.attrs(
          styles.transcriptCard,
          styles.transcriptBubble,
          styles.transcriptCardLive,
          row.message.kind === "status" ? styles.transcriptStatus : styles.transcriptAssistant
        )}
      >
        <div {...stylex.attrs(styles.transcriptRole, styles.transcriptRoleHarness)}>{props.agentLabel}</div>
        <MarkdownContent
          content={() => row.message.content}
          size="compact"
          live={!row.message.locked && row.liveIndex === props.liveMessageCount - 1}
          fileLinks={props.fileLinks}
        />
        <div {...stylex.attrs(styles.messageActionRow)}>
          <div {...stylex.attrs(styles.messageTimestamp)}>{formatShortTimestamp(props.timestamp)}</div>
          <CopyTextButton
            value={row.message.content}
            tooltip="Copy harness message"
            copiedTitle="Message copied"
            copiedDescription="Message copied to clipboard."
            size="sm"
            variant="ghost"
            ariaLabel="Copy harness message"
          >Copy</CopyTextButton>
        </div>
      </div>
    </article>
  );
}
