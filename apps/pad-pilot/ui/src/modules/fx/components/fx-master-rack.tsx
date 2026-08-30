import { Show, createMemo } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { getActiveFxChain, getFxMasterMeters, getFxMasterState } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import styles from "../styles/fx-module.stylex";

export function FxMasterRack() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const activeChain = createMemo(() => getActiveFxChain(state.session.working.chains, state.ui.activeChainId));
  const masterState = createMemo(() => getFxMasterState(state.session.working));
  const masterMeters = createMemo(() => getFxMasterMeters(state.host.displayVisualizer, state.session.working, state.preferences.displayStereoMeters));

  return (
    <aside class={styles["master-rack"]}>
      <div class={styles["master-rack-header"]}>
        <span>Master Rack</span>
        <small class={styles["master-rack-header-small"]}>PadPilot master metering stays live while structural edits commit on drop.</small>
      </div>
      <div class={styles["master-meter-grid"]} data-testid="master-meter-grid">
        <PadPilot.Meter
          label="Input"
          labelPosition="top"
          leftValueDb={masterMeters().input.leftValueDb}
          rightValueDb={masterMeters().input.rightValueDb}
          stereo={masterMeters().input.stereo}
          valueDb={masterMeters().input.valueDb}
        />
        <PadPilot.Meter
          label="Output"
          labelPosition="top"
          leftValueDb={masterMeters().output.leftValueDb}
          rightValueDb={masterMeters().output.rightValueDb}
          stereo={masterMeters().output.stereo}
          valueDb={masterMeters().output.valueDb}
        />
        <PadPilot.Meter label="GR" valueDb={masterMeters().reduction} minDb={-24} maxDb={0} />
      </div>
      <div class={styles["master-knobs"]}>
        <PadPilot.Knob
          min={-18}
          max={18}
          value={masterState().inputGainDb}
          defaultValue={0}
          label="Input"
          tooltip="Master input gain"
          valueFormatter={(value) => `${value.toFixed(1)} dB`}
          onChange={(value) => actions.master.setInputGain(value, false)}
          onCommit={(value) => actions.master.setInputGain(value, true)}
          manualInput
          fineDragMultiplier={0.15}
        />
        <PadPilot.Knob
          min={0}
          max={1}
          value={masterState().wetDry}
          defaultValue={1}
          label="Wet/Dry"
          tooltip="Global FX wet/dry blend"
          valueFormatter={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => actions.master.setWetDry(value, false)}
          onCommit={(value) => actions.master.setWetDry(value, true)}
          manualInput
          fineDragMultiplier={0.15}
        />
        <PadPilot.Knob
          min={-18}
          max={18}
          value={masterState().outputGainDb}
          defaultValue={0}
          label="Output"
          tooltip="Master output gain"
          valueFormatter={(value) => `${value.toFixed(1)} dB`}
          onChange={(value) => actions.master.setOutputGain(value, false)}
          onCommit={(value) => actions.master.setOutputGain(value, true)}
          manualInput
          fineDragMultiplier={0.15}
        />
      </div>
      <Show when={activeChain()}>
        {(chain) => (
          <div class={styles["master-focus-panel"]}>
            <span class={styles["focus-label"]}>Active Chain</span>
            <strong>{chain().name}</strong>
            <small>{`${chain().nodes.length} nodes | Mix ${Math.round(chain().mix * 100)}%`}</small>
          </div>
        )}
      </Show>
    </aside>
  );
}
