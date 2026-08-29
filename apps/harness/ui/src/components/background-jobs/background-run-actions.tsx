import { Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { createRequestId, type BackgroundJobRun } from "@hyperfocus/ai-core/protocol";
import { Pause, Play, RefreshCcw } from "lucide-solid";
import { harnessStore } from "../../harness-store";
import { ActionButton } from "../action-button";
import { backgroundJobsStyles as styles } from "../background-jobs.styles";

export function BackgroundRunActions(props: { run: BackgroundJobRun | undefined; executionPaused: boolean; executionPauseReason: string }) {
  const send = (action: "approve-run" | "reject-run" | "stop-run" | "retry-run", run: BackgroundJobRun) => harnessStore.actions.sendCommand({
    type: `background-job.${action}`,
    requestId: createRequestId(),
    payload: { projectId: run.projectId, runId: run.id }
  });
  return (
    <Show when={props.run}>
      {(run) => <>
        <Show when={run().status === "awaiting-approval"}>
          <ActionButton tooltip="Approve this background run" disabled={props.executionPaused} disabledReason={props.executionPauseReason} icon={<Play class={stylex.attrs(styles.iconMd).class} />} onClick={() => send("approve-run", run())}>Approve</ActionButton>
          <ActionButton tooltip="Reject this background run" variant="secondary" onClick={() => send("reject-run", run())}>Reject</ActionButton>
        </Show>
        <Show when={run().status === "running"}>
          <ActionButton tooltip="Stop this background run" variant="secondary" icon={<Pause class={stylex.attrs(styles.iconMd).class} />} onClick={() => send("stop-run", run())}>Stop</ActionButton>
        </Show>
        <Show when={run().status === "failed" || run().status === "cancelled"}>
          <ActionButton tooltip="Retry this background run" disabled={props.executionPaused} disabledReason={props.executionPauseReason} icon={<RefreshCcw class={stylex.attrs(styles.iconMd).class} />} onClick={() => send("retry-run", run())}>Retry</ActionButton>
        </Show>
      </>}
    </Show>
  );
}
