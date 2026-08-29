import styles from "../recut-module.module.css";
import { PadPilot } from "../../../padpilot/index";
import { useRecutModuleStore } from "../recut-module-store";

export function ParameterControls() {
  const store = useRecutModuleStore();

  return (
    <section class={styles["parameter-controls"]}>
      <div class={styles["section-label"]}>Parameters</div>
      <PadPilot.Slider
        orientation="horizontal"
        min={-24}
        max={24}
        value={store.state().pitchSemitones}
        onChange={store.actions.setPitchSemitones}
        label={`Pitch ${store.state().pitchSemitones.toFixed(1)} st`}
        tooltip="Pitch in semitones."
      />
      <PadPilot.Slider
        orientation="horizontal"
        min={-24}
        max={24}
        value={store.state().gainDb}
        onChange={store.actions.setGainDb}
        label={`Gain ${store.state().gainDb.toFixed(1)} dB`}
        tooltip="Per-slice output gain."
      />
      <PadPilot.Toggle
        value={store.state().stretchEnabled}
        label="Stretch Mode"
        onChange={store.actions.setStretchEnabled}
      />
      <PadPilot.Toggle
        value={store.state().granularEnabled}
        label="Granular"
        onChange={store.actions.setGranularEnabled}
      />
      <PadPilot.Slider
        orientation="horizontal"
        min={2}
        max={250}
        value={store.state().grainSizeMs}
        onChange={store.actions.setGrainSizeMs}
        label={`Grains ${Math.round(store.state().grainSizeMs)} ms`}
        tooltip="Macro grain size."
      />
      <PadPilot.Slider
        orientation="horizontal"
        min={0}
        max={1}
        value={store.state().grainDensity}
        onChange={store.actions.setGrainDensity}
        label={`Density ${Math.round(store.state().grainDensity * 100)}%`}
        tooltip="Macro grain density."
      />
    </section>
  );
}
