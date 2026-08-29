import { PadPilot } from "../../../padpilot/index";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";

export function FxPreferencesModal() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  let firstCheckboxRef: HTMLInputElement | undefined;

  return (
    <PadPilot.Drawer
      open={state.ui.preferencesModalOpen}
      onOpenChange={(open) => {
        if (!open) {
          actions.preferences.closeModal();
        }
      }}
      edge="right"
      size="md"
      showScrim
      title="PadPilot Preferences"
      description="Display-only settings for the FX workspace."
      initialFocusRef={() => firstCheckboxRef}
    >
      <PadPilot.PreferencePanel title="Workspace Settings" description="These preferences only affect the FX view layer.">
        <PadPilot.PreferencePanel.Section title="Display" description="Visibility options for master, chain, and node metering.">
          <PadPilot.CheckboxField
            ref={firstCheckboxRef}
            checked={state.preferences.displayStereoMeters}
            label="Display L/R channels"
            description="Show separate left and right meter bars when stereo data is available."
            onInput={(event) => actions.preferences.set("displayStereoMeters", event.currentTarget.checked)}
          />
          <PadPilot.CheckboxField
            checked={state.preferences.displayNodeMeters}
            label="Display node meters"
            description="Show node input and output metering on each FX card."
            onInput={(event) => actions.preferences.set("displayNodeMeters", event.currentTarget.checked)}
          />
          <PadPilot.CheckboxField
            checked={state.preferences.displayChainMeters}
            label="Display chain meters"
            description="Show chain-level metering beside each chain lane."
            onInput={(event) => actions.preferences.set("displayChainMeters", event.currentTarget.checked)}
          />
        </PadPilot.PreferencePanel.Section>
      </PadPilot.PreferencePanel>
    </PadPilot.Drawer>
  );
}
