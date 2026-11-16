import { typography } from "@hyperfocus/ui";
import {   Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {


  type AgentRunState
} from "@hyperfocus/ai-core/protocol";
import {  type ChatTimelineRow } from "../../lib/chat-timeline-model";
import { formatShortTimestamp } from "../../lib/time-format";
import { chatUtilityStyles } from "../chat-panel.utilities";

export function RunLedgerCompact(props: { run?: AgentRunState }) {
  const ledger = () => props.run?.ledger;
  return (
    <Show when={ledger()}>
      {(entry) => (
        <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p3).class}>
          <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Run ledger</div>
          <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.grid, chatUtilityStyles.gap1).class}>
            <Show when={entry().currentPhase}>{(value) => <div>Phase: {value()}</div>}</Show>
            <Show when={entry().nextStep}>{(value) => <div>Next: {value()}</div>}</Show>
            <Show when={entry().waitingOn}>{(value) => <div>Waiting: {value()}</div>}</Show>
            <Show when={entry().failureClass}>{(value) => <div>Failure: {value()}</div>}</Show>
            <Show when={entry().lastVerifiedAt}>{(value) => <div>Verified: {formatShortTimestamp(value())}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

export function RunProofBundleCompact(props: { run?: AgentRunState }) {
  const bundle = () => props.run?.proofBundle;
  const evidenceCount = () => (bundle()?.commands?.length ?? 0) + (bundle()?.browserEvidenceRefs?.length ?? 0) + (bundle()?.approvals?.length ?? 0);
  return (
    <Show when={bundle()}>
      {(proof) => (
        <div class={stylex.attrs(chatUtilityStyles.mt2, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite60, chatUtilityStyles.p3).class}>
          <div class={stylex.attrs(typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>Proof bundle</div>
          <div class={stylex.attrs(chatUtilityStyles.mt1, chatUtilityStyles.grid, chatUtilityStyles.gap1).class}>
            <Show when={proof().diffSummary}>{(value) => <div>Diff: {value()}</div>}</Show>
            <div>Evidence refs: {evidenceCount()}</div>
            <Show when={proof().finalReviewNotes}>{(value) => <div>Review: {value()}</div>}</Show>
          </div>
        </div>
      )}
    </Show>
  );
}

export function estimateTranscriptRowSize(row: ChatTimelineRow) {
  switch (row.kind) {
    case "tool-block":
      return 180;
    case "live":
      return row.message.kind === "status" ? 120 : 180;
    case "persisted":
      switch (row.message.metadata?.type ?? row.message.kind ?? "plain") {
        case "plan-summary":
          return 260;
        case "run-milestones":
          return 140;
        default:
          return row.message.attachments && row.message.attachments.length > 0 ? 220 : 180;
      }
  }
}

export const CHAT_TRANSCRIPT_LIMIT = 120;

export const CHAT_RUN_SUBTASK_LIMIT = 24;

export const CHAT_EVENT_LIMIT = 80;

