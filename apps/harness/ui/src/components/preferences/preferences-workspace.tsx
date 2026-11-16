import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { Save } from "lucide-solid";
import { ActionButton } from "../action-button";
import { ModeEditorPanel } from "../mode-editor-panel";
import type { PreferencesPanelModel } from "../preferences-modal";
import { Textarea } from "../primitives/textarea";
import { PreferenceRow,PreferenceSection,PreferenceToggle } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

function updateWorkspaceDraft(model: PreferencesPanelModel, kind: "rules" | "memory", value: string) {
  const { state, store } = model;
  store.applyServerEvent({
    type: "workspace.updated",
    requestId: kind === "rules" ? "local-workspace-rules" : "local-workspace-memory",
    payload: {
      workspace: {
        ...state.workspace,
        projects: state.workspace.projects,
        workspaceModes: state.workspace.workspaceModes ?? [],
        workspaceRuleSource:
          kind === "rules"
            ? value.trim()
              ? {
                  id: "workspace-rules",
                  scope: "workspace",
                  label: "Workspace rules",
                  content: value,
                  updatedAt: new Date().toISOString()
                }
              : undefined
            : state.workspace.workspaceRuleSource,
        workspaceMemorySummary:
          kind === "memory"
            ? value.trim()
              ? {
                  id: "workspace-memory",
                  scope: "workspace",
                  label: "Workspace memory",
                  content: value,
                  updatedAt: new Date().toISOString(),
                  source: "user"
                }
              : undefined
            : state.workspace.workspaceMemorySummary,
        activeProjectId: state.workspace.activeProjectId
      }
    }
  });
}

export function PreferencesWorkspace() {
  const panel = usePreferencesPanel();
  const { model } = panel;
  const { state, store, sendCommand, workspaceModes, workspaceRuleDraft } = model;
  const savedToggle = (checked: boolean, update: (value: boolean) => void) =>
    panel.persistence.updateSavedPreference(() => update(checked));
  return (
    <PreferenceSection title="Workspace & Memory" description="Human-readable alignment, pull-based project notes, and archive behavior.">
      <PreferenceRow id="workspace-context" title="Workspace rules" description="Prefer repository AGENTS.md files for durable direction; use this typed workspace override only when every project needs the same rule.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
          <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>Workspace rules</span>
            <Textarea rows="5" value={workspaceRuleDraft()} onInput={(event) => updateWorkspaceDraft(model, "rules", event.currentTarget.value)} />
          </label>
          <ActionButton tooltip="Save explicit workspace rules" variant="secondary" icon={<Save class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={panel.operational.handleSaveWorkspaceContext}>
            Save workspace rules
          </ActionButton>
        </div>
      </PreferenceRow>
      <PreferenceRow id="memory-bank" title="Project note settings" description="Expose pull-based note search and optionally record only exceptional run learnings. Project AGENTS.md, types, and tests remain the source of truth.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <PreferenceToggle checked={state.memoryBankEnabledDefault} label="Enable Pi project note search" onChange={(checked) => savedToggle(checked, store.setMemoryBankEnabledDefault)} />
          <PreferenceToggle checked={state.memoryBankRecordRunsDefault} label="Record exceptional run learnings" onChange={(checked) => savedToggle(checked, store.setMemoryBankRecordRunsDefault)} />
        </div>
      </PreferenceRow>
      <PreferenceRow id="auto-archive" title="Auto-archive preferences" description="Default behavior for completed threads.">
        <PreferenceToggle checked={state.autoArchiveCompletedThreadsDefault} label="Auto-archive completed threads" onChange={(checked) => savedToggle(checked, store.setAutoArchiveCompletedThreadsDefault)} />
      </PreferenceRow>
      <ModeEditorPanel
        title="Workspace custom modes"
        scope="workspace"
        modes={workspaceModes()}
        draftOwner={store}
        draftKey="workspace"
        onSave={(mode) => store.actions.saveMode({ type: "mode.save", requestId: createRequestId(), payload: { scope: "workspace", mode } })}
        onDelete={(modeId) => sendCommand({ type: "mode.delete", requestId: createRequestId(), payload: { scope: "workspace", modeId } })}
      />
    </PreferenceSection>
  );
}
