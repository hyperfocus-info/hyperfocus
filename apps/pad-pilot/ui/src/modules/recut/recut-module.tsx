import { PadPilot } from "../../padpilot/index";
import styles from "./recut-module.stylex";
import { PadGrid } from "./components/pad-grid";
import { ParameterControls } from "./components/parameter-controls";
import { WaveformDisplay } from "./components/waveform-display";
import { RecutModuleStoreProvider, useRecutModuleStore } from "./recut-module-store";

export function RecutModule() {
  return (
    <RecutModuleStoreProvider>
      <RecutModuleView />
    </RecutModuleStoreProvider>
  );
}

function RecutModuleView() {
  useRecutModuleStore();

  return (
    <PadPilot.ModuleWorkspace class={styles["module-root"]}>
      <header class={styles.brand}>
        <h2 class={styles["brand-h2"]}>RECUT</h2>
        <span>Sample slicer</span>
      </header>

      <WaveformDisplay />

      <div class={styles["bottom-grid"]}>
        <ControllerGuide />
        <PadGrid />
        <ParameterControls />
      </div>
    </PadPilot.ModuleWorkspace>
  );
}

function ControllerGuide() {
  const store = useRecutModuleStore();

  return (
    <PadPilot.ModuleWorkspace class={styles["controller-guide"]}>
      <span class={styles["section-label"]}>Controller</span>
      <div class={styles["guide-line"]}>Click waveform to select chops. Double-click adds chop. Delete removes selected chop.</div>
      <div class={styles["guide-line"]}>Face buttons trigger chops. Hold LB and/or RB for banks 2-4.</div>
      <div class={styles["guide-line"]}>Held pads: {store.derived.heldPadIndices().length} · Playing pads: {store.derived.playingPadIndices().length}</div>
      <div class={styles["guide-line"]}>Haptics: {store.derived.hapticStatus()}</div>
    </PadPilot.ModuleWorkspace>
  );
}
