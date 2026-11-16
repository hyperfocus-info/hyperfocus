import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-solid";
import type { JSX } from "solid-js";
import { ideStore,type IdeAutoSaveMode,type IdeEditorSettings,type IdeIndentStyle,type IdeTabSize,type IdeWordWrapMode } from "../../ide/ide-store";
import { ActionButton } from "../action-button";
import { PreferenceRow,PreferenceSection,SegmentedControl } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

function renderSettingControl(title: string, description: string, control: JSX.Element) {
  return (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap2, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBlock3, preferenceStyles.mdGridColumnsSetting, preferenceStyles.mdItemsCenter).class}>
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
        <div class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{title}</div>
        <div class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.text07, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>{description}</div>
      </div>
      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>{control}</div>
    </div>
  );
}

export function PreferencesIdeSettings() {
  const panel = usePreferencesPanel();
  const { updateSavedPreference } = panel.persistence;
  const renderToggle = (checked: boolean, onInput: (checked: boolean) => void, label: string) => (
    <label class={stylex.attrs(preferenceStyles.inlineFlex, preferenceStyles.minHeight9, preferenceStyles.cursorPointer, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2, preferenceStyles.transition, preferenceStyles.hoverBackgroundSoftAccent).class}>
      <span class={stylex.attrs(preferenceStyles.textXs, preferenceStyles.fontMedium, preferenceStyles.colorForeground).class}>{label}</span>
      <input class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.accentColor).class} type="checkbox" checked={checked} onInput={(event) => updateSavedPreference(() => onInput(event.currentTarget.checked))} />
    </label>
  );
    const settings = () => ideStore.state.editorSettings;
    const setSetting = <K extends keyof IdeEditorSettings>(key: K, value: IdeEditorSettings[K]) => {
      ideStore.setEditorSetting(key, value);
    };
    return (
      <PreferenceSection title="IDE Settings" description="IDE behavior and formatting defaults for this browser.">
        <PreferenceRow
          id="ide-editor-settings"
          title="IDE behavior"
          description="Each IDE default is labeled with its effect."
          layout="wide-label"
        >
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
            {renderSettingControl(
              "Auto save",
              "Choose when dirty IDE files save without pressing the save command.",
              <SegmentedControl<IdeAutoSaveMode>
                ariaLabel="Auto save"
                value={settings().autoSave}
                options={[
                  { value: "off", label: "Off" },
                  { value: "afterDelay", label: "After delay" },
                  { value: "onFocusChange", label: "On focus change" }
                ]}
                onChange={(value) => setSetting("autoSave", value)}
              />
            )}
            {renderSettingControl(
              "Word wrap",
              "Wrap long lines in the IDE viewport instead of scrolling horizontally.",
              <SegmentedControl<IdeWordWrapMode>
                ariaLabel="Word wrap"
                value={settings().wordWrap}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" }
                ]}
                onChange={(value) => setSetting("wordWrap", value)}
              />
            )}
            {renderSettingControl(
              "Indent style",
              "Pick whether Tab inserts spaces or tab characters.",
              <SegmentedControl<IdeIndentStyle>
                ariaLabel="Indent style"
                value={settings().insertSpaces}
                options={[
                  { value: "spaces", label: "Spaces" },
                  { value: "tabs", label: "Tabs" }
                ]}
                onChange={(value) => setSetting("insertSpaces", value)}
              />
            )}
            {renderSettingControl(
              "Tab size",
              "Set indentation width for tab stops and inserted spaces.",
              <SegmentedControl<IdeTabSize>
                ariaLabel="Tab size"
                value={settings().tabSize}
                options={[
                  { value: 2, label: "2" },
                  { value: 4, label: "4" }
                ]}
                onChange={(value) => setSetting("tabSize", value)}
              />
            )}
            {renderSettingControl(
              "Format on save",
              "Run available formatting when an editable file is saved.",
              renderToggle(settings().formatOnSave, (value) => setSetting("formatOnSave", value), "Enabled")
            )}
            {renderSettingControl(
              "Breadcrumbs",
              "Show the current file path above the IDE.",
              renderToggle(settings().breadcrumbsEnabled, (value) => setSetting("breadcrumbsEnabled", value), "Enabled")
            )}
            {renderSettingControl(
              "Bracket pair colorization",
              "Use matching colors for nested brackets in code.",
              renderToggle(settings().bracketPairColorization, (value) => setSetting("bracketPairColorization", value), "Enabled")
            )}
            <ActionButton
              tooltip="Restore IDE defaults"
              variant="secondary"
              class={stylex.attrs(preferenceStyles.justifySelfStart).class}
              icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              onClick={() => {
                ideStore.resetEditorSettings();
              }}
            >
              Restore IDE defaults
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }
