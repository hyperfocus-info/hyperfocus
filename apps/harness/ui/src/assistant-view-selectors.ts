import type { HarnessViewState } from "./harness-store";

export function getVisibleAssistants(state: HarnessViewState) {
  if (state.assistants.scopeFilter === "all") return state.assistants.assistants;
  return state.assistants.assistants.filter((assistant) =>
    state.assistants.scopeFilter === "global"
      ? assistant.scope === "global"
      : assistant.scope === "project" && assistant.projectId === state.workspace.activeProjectId
  );
}

export function getSelectedAssistant(state: HarnessViewState) {
  const visibleAssistants = getVisibleAssistants(state);
  const selected = state.assistants.selectedAssistantId
    ? visibleAssistants.find((assistant) => assistant.id === state.assistants.selectedAssistantId)
    : undefined;
  return selected ?? visibleAssistants[0];
}
