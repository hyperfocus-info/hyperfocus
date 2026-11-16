import { formatBytes } from "./preference-display-values";
import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import type { RunModelPreference } from "@hyperfocus/ai-core/protocol";
import { Input } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { FolderOpen,HelpCircle,Trash2 } from "lucide-solid";
import { Show } from "solid-js";
import { ActionButton } from "../action-button";
import { DropdownControl } from "../primitives/dropdown";
import { Tooltip } from "../primitives/tooltip";
import { AdvancedDisclosure,PreferenceRow,PreferenceSection,PreferenceToggle,RangeControl,SegmentedControl } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";


export function PreferencesSafety() {
  const panel = usePreferencesPanel();
  const { state, store } = panel.model;
  const { handleBranchfsCleanup } = panel.operational;
  const { updateSavedPreference } = panel.persistence;
  const subagentWorktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Subagents edit inside current working tree." },
    { value: "separate-worktrees", label: "Isolated mounts (BranchFS)", description: "Subagents work in isolated BranchFS mounts before merge." },
  ];
  const renderToggle = (checked: boolean, onInput: (checked: boolean) => void, label: string) => (
    <PreferenceToggle checked={checked} label={label} onChange={(value) => updateSavedPreference(() => onInput(value))} />
  );
  const renderModelPreferenceControl = (ariaLabel: string, value: RunModelPreference, onChange: (value: RunModelPreference) => void, tooltip: string) => (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>
        <span class={stylex.attrs(preferenceStyles.truncate).class}>{ariaLabel}</span>
        <Tooltip content={tooltip} side="right"><span tabIndex={0} aria-label={ariaLabel + " help"} class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.cursorHelp, preferenceStyles.colorMuted).class}><HelpCircle class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} /></span></Tooltip>
      </div>
      <SegmentedControl ariaLabel={ariaLabel} value={value} options={[{ value: "inference", label: "Inference" }, { value: "intelligence", label: "Intelligence" }]} onChange={(nextValue) => updateSavedPreference(() => onChange(nextValue))} />
    </div>
  );
    return (
      <PreferenceSection title="Safety & Guardrails" description="Execution gates, worktree strategy, and run-risk defaults.">
        <PreferenceRow id="plan-gate" title="Planning and approval" description="Choose what happens after an execution plan is ready.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <SegmentedControl
              ariaLabel="Plan gate mode"
              value={state.planExecutionModeDefault}
              options={[
                { value: "countdown", label: "Countdown" },
                { value: "approve", label: "Approve" },
                { value: "immediate", label: "Immediate" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setPlanExecutionModeDefault(value))}
            />
            <Show when={state.planExecutionModeDefault === "countdown"}>
              <RangeControl
                label="Countdown delay"
                min={0}
                max={300}
                suffix="s"
                value={state.planExecutionDelaySecondsDefault}
                onChange={(value) => updateSavedPreference(() => store.setPlanExecutionDelaySecondsDefault(value))}
              />
            </Show>
          </div>
        </PreferenceRow>
        <PreferenceRow id="worktree-git" title="Worktree and git safety" description="Control subagent isolation and dirty working tree guardrails.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <DropdownControl
              kind="select"
              ariaLabel="Select subagent worktree strategy"
              icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
              size="md"
              class={stylex.attrs(preferenceStyles.widthFull).class}
              value={state.subagentWorktreeStrategyDefault}
              options={subagentWorktreeOptions()}
              onChange={(value) => {
                if (value === "same-worktree" || value === "separate-worktrees") {
                  updateSavedPreference(() => store.setSubagentWorktreeStrategyDefault(value));
                }
              }}
            />
            {renderToggle(state.blockChatOnDirtyGitDefault, store.setBlockChatOnDirtyGitDefault, "Restrict chat on dirty git")}
            <AdvancedDisclosure title="Advanced git guard" description="Dirty git change limit before chat-triggered runs are refused.">
              <Input
                aria-label="Dirty git change limit"
                type="number"
                min="0"
                max="10000"
                disabled={!state.blockChatOnDirtyGitDefault}
                value={String(state.dirtyGitChangeLimitDefault)}
                onInput={(event) =>
                  updateSavedPreference(() => store.setDirtyGitChangeLimitDefault(Number(event.currentTarget.value) || 0))
                }
              />
            </AdvancedDisclosure>
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <ActionButton
                tooltip="Delete retained BranchFS workspaces and stop stale interrupted runs"
                icon={<Trash2 class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                size="sm"
                variant="secondary"
                onClick={handleBranchfsCleanup}
              >
                Clean BranchFS
              </ActionButton>
              <Show when={state.branchfsCleanupSummary}>
                {(summary) => (
                  <span class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.colorMuted).class}>
                    {summary().rootsDeleted} roots deleted | {formatBytes(summary().bytesDeleted)} freed
                    {summary().staleRunsStopped ? ` | ${summary().staleRunsStopped} stale runs stopped` : ""}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="run-safety" title="Run safety" description="Context compaction and correctness follow-up defaults.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <RangeControl
              label="Auto-compact threshold"
              min={10}
              max={95}
              suffix="%"
              value={state.autoCompactContextThresholdPercentDefault}
              onChange={(value) => updateSavedPreference(() => store.setAutoCompactContextThresholdPercentDefault(value))}
            />
            {renderModelPreferenceControl(
              "Single agent",
              state.singleAgentModelPreferenceDefault,
              store.setSingleAgentModelPreferenceDefault,
              "Controls the main executor when a plan runs without subagents. Inference will cost less and be faster, while Intelligence will be more precise."
            )}
            {renderModelPreferenceControl(
              "Sub agents",
              state.subagentModelPreferenceDefault,
              store.setSubagentModelPreferenceDefault,
              "Controls spawned parallel subagents. Inference will cost less and be faster, while Intelligence will keep subagents closer to the selected execution model and be more precise."
            )}
            <SegmentedControl
              ariaLabel="Correctness iteration"
              value={state.correctnessIterationModeDefault}
              options={[
                { value: "ask-before-iterate", label: "Ask" },
                { value: "auto-once", label: "Auto once" },
                { value: "auto-until-clean", label: "Until clean" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setCorrectnessIterationModeDefault(value))}
            />
            <AdvancedDisclosure title="Context compaction details" description="Pi compacts session context after threshold crossing, then continues with reduced history.">
              <p class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Lower values compact sooner. Higher values preserve more transcript before compaction.</p>
            </AdvancedDisclosure>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }
