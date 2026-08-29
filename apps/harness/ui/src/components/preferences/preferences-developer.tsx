/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import { Download, Import, RotateCcw, Trash2 } from "lucide-solid";
import { ActionButton } from "../action-button";
import type { PreferencesPanelModel } from "../preferences-modal";
import { PreferenceRow, PreferenceSection, PreferenceToggle } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

export function PreferencesDeveloper(props: {
  model: PreferencesPanelModel;
  updateSavedPreference: (update: () => void) => void;
  onClearApiKey: () => void;
  onExport: () => void;
  onResetPanelSizes: () => void;
}) {
  const { state, store, runtime } = props.model;
  const savedToggle = (checked: boolean, update: (value: boolean) => void) =>
    props.updateSavedPreference(() => update(checked));
  return (
    <PreferenceSection title="Developer & Advanced" description="Developer logging, trace defaults, portability, and reset controls.">
      <PreferenceRow id="logging-trace" title="Logging and trace UI" description="Defaults for developer visibility in new sessions.">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <PreferenceToggle checked={state.debugEnabled} label="Verbose developer logging" onChange={(checked) => savedToggle(checked, store.setDebugEnabled)} />
          <PreferenceToggle checked={state.tracePanelDefaultOpen} label="Open trace panel by default" onChange={(checked) => savedToggle(checked, store.setTracePanelDefaultOpen)} />
        </div>
      </PreferenceRow>
      <PreferenceRow id="portable-json" title="Import and export JSON" description="Portable preferences exclude API keys.">
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
          <ActionButton tooltip="Export preferences JSON" variant="secondary" icon={<Download class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={props.onExport}>Export prefs</ActionButton>
          <ActionButton tooltip="Import preferences JSON" variant="secondary" icon={<Import class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => runtime.importInput?.click()}>Import prefs</ActionButton>
        </div>
      </PreferenceRow>
      <PreferenceRow id="advanced-reset" title="Advanced reset controls" description="Clear provider keys or reset local layout state.">
        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
          <ActionButton tooltip="Clear all provider keys" variant="secondary" icon={<Trash2 class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={props.onClearApiKey}>Clear keys</ActionButton>
          <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={props.onResetPanelSizes}>Reset layout</ActionButton>
        </div>
      </PreferenceRow>
    </PreferenceSection>
  );
}
