import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { createRequestId } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { FolderOpen,LayoutPanelLeft,Palette } from "lucide-solid";
import { Show,type JSX } from "solid-js";
import { terminalStore } from "../../terminal/terminal-store";
import { isBuiltInThemeId } from "../../theme/theme-model";
import { ActionButton } from "../action-button";
import { DropdownControl } from "../primitives/dropdown";
import { PreferenceRow,PreferenceSection,PreferenceToggle,SegmentedControl } from "./preferences-controls";
import { PreferencesCustomThemeEditor,PreferencesThemePreview } from "./preferences-theme-actions";
import { preferenceStyles } from "./preferences.styles";

const projectSortOptions = [
  { value: "last-user-message", label: "Last message" },
  { value: "created-at", label: "Created" },
  { value: "manual", label: "Manual" }
];
const threadSortOptions = [
  { value: "last-user-message", label: "Last message" },
  { value: "created-at", label: "Created" }
];
const groupingOptions = [
  { value: "repository", label: "Repository" },
  { value: "repository-path", label: "Repository path" },
  { value: "separate", label: "Separate" }
];

function SettingControl(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap2, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBlock3, preferenceStyles.mdGridColumnsSetting, preferenceStyles.mdItemsCenter).class}>
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
        <div class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{props.title}</div>
        <div class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.text07, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>{props.description}</div>
      </div>
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>{props.children}</div>
    </div>
  );
}

export function PreferencesGeneral() {
  const panel = usePreferencesPanel();
  const { state, store, sendCommand } = panel.model;
  const { themeOptions, themeModeTooltip, themeModeLabel, themeModeIcon, cycleThemeMode } = panel.theme;
  const savedToggle = (checked: boolean, update: (value: boolean) => void) => panel.persistence.updateSavedPreference(() => update(checked));
  const saveTerminalRendererMode = (rendererMode: "solid-prototype" | "xterm-webgl") => {
    const requestId = createRequestId();
    const preferences = { ...terminalStore.state.preferences, rendererMode };
    terminalStore.applyServerEvent({ type: "terminal.preferences.saved", requestId, payload: { preferences, layout: terminalStore.state.layout } });
    sendCommand({ type: "terminal.preferences.save", requestId, payload: { preferences, layout: terminalStore.state.layout } });
  };
  return (
    <PreferenceSection title="General & UI" description="Compact workspace defaults with theme and density controls.">
      <PreferenceRow id="experience-mode" title="Interface mode" description="Choose a focused daily view or the complete technical cockpit.">
        <SegmentedControl
          ariaLabel="Interface mode"
          value={state.experienceMode}
          options={[
            { value: "simple", label: "Simple" },
            { value: "advanced", label: "Advanced" },
          ]}
          onChange={(value) => {
            if (value !== "simple" && value !== "advanced") return;
            panel.persistence.updateSavedPreference(() => store.setExperienceMode(value));
          }}
        />
      </PreferenceRow>
      <PreferenceRow id="appearance-density" title="Appearance and density" description="Pick a theme, mode, fonts, and optional custom colors.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumnsControl, preferenceStyles.smItemsCenter).class}>
            <DropdownControl kind="select" ariaLabel="Theme" icon={<Palette class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />} size="md" class={stylex.attrs(preferenceStyles.widthFull).class} value={state.themePreference.themeId} options={themeOptions()} onChange={(value) => { if (value !== "custom" && !isBuiltInThemeId(value)) return; store.setThemeId(value); panel.rerender(); }} />
            <ActionButton tooltip={themeModeTooltip()} ariaLabel={`Theme mode: ${themeModeLabel(state.themePreference.mode)}`} variant="secondary" class={stylex.attrs(preferenceStyles.height9, preferenceStyles.justifyStart, preferenceStyles.roundedLg, preferenceStyles.paddingInline3).class} icon={themeModeIcon()} onClick={cycleThemeMode}>
              <span class={stylex.attrs(preferenceStyles.minWidth11, preferenceStyles.textLeft).class}>{themeModeLabel(state.themePreference.mode)}</span>
            </ActionButton>
          </div>
          <PreferencesThemePreview />
          <Show when={state.themePreference.themeId === "custom"}><PreferencesCustomThemeEditor /></Show>
        </div>
      </PreferenceRow>
      <PreferenceRow id="terminal-display" title="Terminal and numeric display" description="Choose terminal rendering and dense numeric alignment defaults.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
          <SettingControl title="Terminal renderer" description="Solid is the default lightweight renderer; xterm keeps the full emulator path available.">
            <SegmentedControl ariaLabel="Terminal renderer" value={terminalStore.state.preferences.rendererMode === "solid-prototype" ? "solid" : "xterm"} options={[{ value: "solid", label: "Solid" }, { value: "xterm", label: "xterm" }]} onChange={(value) => saveTerminalRendererMode(value === "solid" ? "solid-prototype" : "xterm-webgl")} />
          </SettingControl>
          <SettingControl title="Numeric alignment" description="Right-align dense counts and numeric badges for easier scanning.">
            <PreferenceToggle checked={state.numericRightAlignmentEnabled} label="Right-align numbers" onChange={(checked) => savedToggle(checked, store.setNumericRightAlignmentEnabled)} />
          </SettingControl>
        </div>
      </PreferenceRow>
      <PreferenceRow id="navigation-sidebar" title="Sidebar and layout" description="Restore main panel sizes and choose project sidebar sorting/grouping.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
          <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<LayoutPanelLeft class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={panel.operational.handleResetPanelSizes}>Restore panel sizes</ActionButton>
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns3).class}>
            <DropdownControl kind="select" ariaLabel="Project sort" icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />} size="md" value={state.projectSidebarPreferences.projectSort} options={projectSortOptions} onChange={(value) => { if (value === "last-user-message" || value === "created-at" || value === "manual") store.setProjectSidebarPreferences({ projectSort: value }); }} />
            <DropdownControl kind="select" ariaLabel="Thread sort" icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />} size="md" value={state.projectSidebarPreferences.threadSort} options={threadSortOptions} onChange={(value) => { if (value === "last-user-message" || value === "created-at") store.setProjectSidebarPreferences({ threadSort: value }); }} />
            <DropdownControl kind="select" ariaLabel="Project grouping" icon={<FolderOpen class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />} size="md" value={state.projectSidebarPreferences.grouping} options={groupingOptions} onChange={(value) => { if (value === "repository" || value === "repository-path" || value === "separate") store.setProjectSidebarPreferences({ grouping: value }); }} />
          </div>
        </div>
      </PreferenceRow>
      <PreferenceRow id="notifications" title="Notifications" description="Background job alerts and CLI update checks.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <PreferenceToggle checked={state.backgroundJobNotificationsEnabled} label="Background job notifications" onChange={(checked) => savedToggle(checked, store.setBackgroundJobNotificationsEnabled)} />
          <PreferenceToggle checked={state.checkCliUpdatesDefault} label="Check CLI updates" onChange={(checked) => savedToggle(checked, store.setCheckCliUpdatesDefault)} />
        </div>
      </PreferenceRow>
    </PreferenceSection>
  );
}
