/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import { CirclePause } from "lucide-solid";
import { ActionButton } from "../action-button";
import type { PreferencesPanelModel } from "../preferences-modal";
import type { PreferencesOperationalActions } from "./preferences-actions";
import { PreferenceRow, PreferenceSection, PreferenceToggle, RangeControl, SegmentedControl } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

export function PreferencesBackgroundJobs(props: {
  model: PreferencesPanelModel;
  actions: PreferencesOperationalActions;
  updateSavedPreference: (update: () => void) => void;
}) {
  const { state, store, enabledAssistantBackgroundJobCount } = props.model;
  const savedToggle = (checked: boolean, update: (value: boolean) => void) =>
    props.updateSavedPreference(() => update(checked));
  return (
    <PreferenceSection title="Background Jobs" description="Approval policy, capacity, notifications, and current jobs pane defaults.">
      <PreferenceRow id="job-defaults" title="Background job defaults" description="Choose approval posture and concurrent capacity for background work.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
          <SegmentedControl
            ariaLabel="Background approval policy"
            value={state.backgroundJobApprovalPolicyDefault}
            options={[
              { value: "allow-all", label: "Allow all" },
              { value: "allow-safe", label: "Allow safe" },
              { value: "ask-risky", label: "Ask risky" },
              { value: "always-ask", label: "Always ask" }
            ]}
            onChange={(value) => props.updateSavedPreference(() => store.setBackgroundJobApprovalPolicyDefault(value))}
          />
          <PreferenceToggle checked={state.assistantAutoApproveNonBlockingQuestionsDefault} label="Auto-approve non-blocking questions" onChange={(checked) => savedToggle(checked, store.setAssistantAutoApproveNonBlockingQuestionsDefault)} />
          <PreferenceToggle checked={state.backgroundJobNotificationsEnabled} label="Desktop notifications" onChange={(checked) => savedToggle(checked, store.setBackgroundJobNotificationsEnabled)} />
          <RangeControl
            label="Assistant max congestion"
            value={state.assistantMaxCongestionDefault}
            min={0.25}
            max={3}
            step={0.25}
            suffix="x"
            tooltip="Higher values allow more assistant job load before congestion delays apply, which can lead to jobs running over each other."
            formatValue={(value) => value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
            onChange={(value) => props.updateSavedPreference(() => store.setAssistantMaxCongestionDefault(value))}
          />
          <RangeControl
            label="Max background jobs"
            value={state.maxBackgroundJobsDefault}
            min={5}
            max={100}
            suffix=" jobs"
            tooltip="Caps concurrently running or queued scheduled background jobs."
            formatValue={(value) => Math.round(value).toString()}
            onChange={(value) => props.updateSavedPreference(() => store.setMaxBackgroundJobsDefault(value))}
          />
        </div>
      </PreferenceRow>
      <PreferenceRow id="assistant-job-controls" title="Assistant job controls" description="Pause enabled jobs owned by assistants across projects.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <ActionButton
            tooltip="Pause every enabled assistant-owned background job"
            disabled={enabledAssistantBackgroundJobCount() === 0}
            disabledReason="No enabled assistant-owned background jobs"
            variant="secondary"
            icon={<CirclePause class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
            ariaLabel="Pause assistant jobs"
            onClick={props.actions.handlePauseAssistantBackgroundJobs}
          >
            Pause assistant jobs
          </ActionButton>
          <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Enabled assistant jobs: {enabledAssistantBackgroundJobCount()}</div>
        </div>
      </PreferenceRow>
      <PreferenceRow id="jobs-view" title="Jobs view and sync state" description="Current jobs pane view preferences saved in this browser.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.textXs, preferenceStyles.colorMuted).class}>
          <div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.padding3, preferenceStyles.colorForeground).class}>Segment: {state.jobsPanePreferences.segment}</div>
          <div>Sort: {state.jobsPanePreferences.jobSort}</div>
          <div>Search: {state.jobsPanePreferences.search || "None"}</div>
        </div>
      </PreferenceRow>
    </PreferenceSection>
  );
}
