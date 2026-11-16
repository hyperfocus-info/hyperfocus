import { useAssistantsPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { createRequestId,type Assistant } from "@hyperfocus/ai-core/protocol";
import { ActionMenu,Button,MenuItem } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { ActionButton } from "../action-button";
import { FileLinkedText } from "../file-linked-text";
import { StatusChip } from "../primitives/status-chip";
import { detailStyles } from "./assistant-detail.styles";

export function AssistantDetailHeader(props: { assistant: () => Assistant; }) {
  const controller = useAssistantsPanel();
  const { assistant } = props;
  const { assistantRunStateTone, executionPaused, executionPauseReason, handleDeleteAssistant, openEditAssistant,
    sendCommand, setSelectedCircuitBreakerAssistantId, state } = controller;
  return <header {...stylex.attrs(detailStyles.header)}>
    <div {...stylex.attrs(detailStyles.identity)}>
      <h2 {...stylex.attrs(detailStyles.title)}>{assistant().name}</h2>
      <div {...stylex.attrs(detailStyles.actions)}>
        <StatusChip tone={assistantRunStateTone(assistant().runState)}>{assistant().runState}</StatusChip>
        <span {...stylex.attrs(detailStyles.caption)}>{assistant().scope} assistant / {assistant().unreadQuestionCount} unread questions</span>
      </div>
      <Show when={assistant().description}><p {...stylex.attrs(detailStyles.caption)}><FileLinkedText text={assistant().description ?? ""} fileLinks={controller.assistantChatFileLinks()} /></p></Show>
    </div>
    <div {...stylex.attrs(detailStyles.actions)}>
      <Show when={assistant().circuitBreakerState === "tripped"}>
        <ActionButton tooltip="Inspect circuit breaker failure and retry" ariaLabel="Inspect failure" variant="secondary"
          onClick={() => setSelectedCircuitBreakerAssistantId(assistant().id)}>Inspect failure</ActionButton>
      </Show>
      <ActionButton tooltip={assistant().runState === "paused" ? "Resume assistant background work" : "Pause assistant background work"}
        variant="secondary" onClick={() => sendCommand({ type: assistant().runState === "paused" ? "assistant.resume" : "assistant.pause",
          requestId: createRequestId(), payload: { assistantId: assistant().id } })}>
        {assistant().runState === "paused" ? "Resume" : "Pause"}
      </ActionButton>
      <ActionMenu ariaLabel="Assistant actions" trigger={({ toggle, open, menuId }) =>
        <Button variant="ghost" tooltip="Assistant actions" aria-label="Assistant actions" aria-expanded={open()} aria-controls={menuId} onClick={toggle}>More</Button>}>
        <p {...stylex.attrs(detailStyles.caption)}>Bootstrap: {assistant().bootstrapState}</p>
        <MenuItem onSelect={() => openEditAssistant(assistant())}>Edit assistant</MenuItem>
        <MenuItem disabled={executionPaused()} aria-description={executionPauseReason}
          onSelect={() => sendCommand({ type: "assistant.bootstrap.retry", requestId: createRequestId(), payload: { assistantId: assistant().id } })}>Retry bootstrap</MenuItem>
        <Show when={assistant().scope === "global"}>
          <MenuItem disabled={!state.workspace.activeProjectId} aria-description={!state.workspace.activeProjectId ? "Open project first" : undefined}
            onSelect={() => state.workspace.activeProjectId && sendCommand({ type: "assistant.clone-to-project", requestId: createRequestId(),
              payload: { assistantId: assistant().id, projectId: state.workspace.activeProjectId } })}>Clone to project</MenuItem>
        </Show>
        <MenuItem tone="danger" onSelect={() => handleDeleteAssistant(assistant())}>Delete assistant</MenuItem>
      </ActionMenu>
    </div>
  </header>;
}
