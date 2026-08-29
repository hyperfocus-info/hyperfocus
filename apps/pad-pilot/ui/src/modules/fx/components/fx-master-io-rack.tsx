import { Ear, Scale } from "lucide-solid";
import { createMemo } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { getFxMasterMeters, getFxMasterState } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import styles from "./fx-master-io-rack.stylex";

/** FxMasterIoRack renders the strict Master I/O right rail with no GR meter. */
export function FxMasterIoRack() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const masterState = createMemo(() => getFxMasterState(state.session.working));
  const masterMeters = createMemo(() => getFxMasterMeters(state.host.displayVisualizer, state.session.working, state.preferences.displayStereoMeters));

  return (
    <aside class={styles.rack} data-testid="fx-master-io-rack">
      <div class={styles.header}>
        <strong class={styles["header-strong"]}>Master I/O</strong>
      </div>

      <div class={styles["meter-row"]}>
        <PadPilot.Meter
          class={styles["tall-meter"]}
          data-testid="master-input-meter"
          label="Input"
          labelPosition="top"
          leftValueDb={masterMeters().input.leftValueDb}
          rightValueDb={masterMeters().input.rightValueDb}
          stereo={masterMeters().input.stereo}
          valueDb={masterMeters().input.valueDb}
        />
        <PadPilot.Meter
          class={styles["tall-meter"]}
          data-testid="master-output-meter"
          label="Output"
          labelPosition="top"
          leftValueDb={masterMeters().output.leftValueDb}
          rightValueDb={masterMeters().output.rightValueDb}
          stereo={masterMeters().output.stereo}
          valueDb={masterMeters().output.valueDb}
        />
      </div>

      <div class={styles["knob-row"]}>
        <PadPilot.Knob
          data-testid="master-in-knob"
          min={-18}
          max={18}
          value={masterState().inputGainDb}
          defaultValue={0}
          label="Input"
          valueFormatter={(value) => `${value.toFixed(1)} dB`}
          onChange={(value) => actions.master.setInputGain(value, false)}
          onCommit={(value) => actions.master.setInputGain(value, true)}
          manualInput
          size={58}
        />
        <PadPilot.Knob
          data-testid="master-mix-knob"
          min={0}
          max={1}
          value={masterState().wetDry}
          defaultValue={1}
          label="Mix"
          valueFormatter={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => actions.master.setWetDry(value, false)}
          onCommit={(value) => actions.master.setWetDry(value, true)}
          manualInput
          size={58}
        />
        <PadPilot.Knob
          data-testid="master-out-knob"
          min={-18}
          max={18}
          value={masterState().outputGainDb}
          defaultValue={0}
          label="Output"
          valueFormatter={(value) => `${value.toFixed(1)} dB`}
          onChange={(value) => actions.master.setOutputGain(value, false)}
          onCommit={(value) => actions.master.setOutputGain(value, true)}
          manualInput
          size={58}
        />
      </div>

      <div class={styles["compare-row"]}>
        <PadPilot.ToggleButton
          class={styles["compare-row-child"]}
          data-testid="fx-dry-compare"
          icon={<Ear size={13} />}
          onClick={() => actions.audition.setDryCompare(!state.ui.dryCompare)}
          tooltip={state.ui.dryCompare ? "Return to processed signal" : "Compare unprocessed signal"}
          value={state.ui.dryCompare}
        >
          {state.ui.dryCompare ? "Processed" : "Dry A/B"}
        </PadPilot.ToggleButton>
        <PadPilot.Button
          class={styles["compare-row-child"]}
          data-testid="fx-peak-match"
          icon={<Scale size={13} />}
          onClick={actions.master.matchOutputPeak}
          tooltip="Match current output peak to input peak"
        >
          Peak Match
        </PadPilot.Button>
      </div>
    </aside>
  );
}
