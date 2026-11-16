import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { MoreHorizontal } from "lucide-solid";
import { ActionMenu, Button, MenuItem } from "@hyperfocus/ui";
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { harnessStore } from "../harness-store";
import { ActionButton } from "../components/action-button";
import { UsageSummary } from "../components/usage/usage-summary";
import { NotificationInbox } from "../components/notification-inbox";
import { styles } from "./app.styles";

export function HeaderActions(props: { executionTooltip: string; traceTooltip: string }) {
  const state = harnessStore.state;
  return <div {...stylex.attrs(styles.headerActions)}>
    <UsageSummary />
    <NotificationInbox />
    <ActionButton tooltip={props.executionTooltip}
      variant="ghost" size="sm"
      class={stylex.attrs(styles.executionControl, state.executionControl.isPaused ? styles.executionPaused : styles.executionRunning).class}
      onClick={() => harnessStore.actions.sendCommand({ type: state.executionControl.isPaused ? "execution.resume-all" : "execution.pause-all", requestId: createRequestId() })}>
      {state.executionControl.isPaused ? "Resume" : "Pause"}
    </ActionButton>
    <ActionMenu ariaLabel="Workspace actions" trigger={({ toggle, open, menuId }) =>
      <Button variant="ghost" size="icon" class={stylex.attrs(styles.headerIconTarget).class} tooltip="Workspace actions" aria-label="Workspace actions" aria-expanded={open()} aria-controls={menuId} data-tour-id="help-button" onClick={toggle}>
        <MoreHorizontal {...stylex.attrs(styles.icon16)} />
      </Button>}>
      <MenuItem onSelect={() => harnessStore.openHelpDialog()}>Help and tutorials</MenuItem>
      <Show when={state.experienceMode === "advanced"}>
        <MenuItem aria-label={props.traceTooltip} onSelect={() => harnessStore.toggleTracePanel()}>Trace panel: {state.tracePanelMode}</MenuItem>
      </Show>
    </ActionMenu>
  </div>;
}
