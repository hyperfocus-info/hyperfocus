import { resolveFxControls } from "../components/fx-control-field";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import type { AnyNodeConfig } from "./types";
import styles from "../styles/fx-node-registry.stylex";
import { renderControlGrid, renderMotionLane, renderScalarRows, renderSeries } from "./renderer-primitives";

type PhaserVisualizerShape = {
  combResponse: number[];
};

type PhaserConfigShape = {
  speedHz: number;
  centerFrequencyHz: number;
  stages: number;
  resonance: number;
  stereoPhaseOffset: number;
};

export function renderPhaserRackVisualizer(visualizer: PhaserVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Phaser</strong>
        <span class={styles["visualizer-badge"]}>All-pass</span>
      </div>
      {renderSeries("Response", visualizer?.combResponse ?? [])}
    </div>
  );
}

export function renderPhaserNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<PhaserConfigShape, PhaserVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["speedHz", "centerFrequencyHz"]);
  const focusControls = resolveFxControls(controls, ["stages", "resonance", "stereoPhaseOffset"]);
  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>All-pass sweep</strong>
          <span class={styles["visualizer-badge"]}>{config.stages} stages</span>
        </div>
        {renderSeries("Response", visualizer?.combResponse ?? [])}
      </div>
      <div class={styles["focus-section"]}>{renderControlGrid(rackControls, config, updateControl)}</div>
      <div class={styles["focus-section"]}>{renderControlGrid(focusControls, config, updateControl)}</div>
    </div>
  );
}

type AutoPanConfigShape = {
  rateHz: number;
  amount: number;
  lfoShape: string;
  phaseOffset: number;
  smoothing: number;
};

type AutoPanVisualizerShape = {
  panPosition: number;
};

export function renderAutoPanRackVisualizer(visualizer: AutoPanVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Pan lane</strong>
        <span class={styles["visualizer-badge"]}>{Number(visualizer?.panPosition ?? 0).toFixed(2)}</span>
      </div>
      {renderMotionLane(visualizer?.panPosition ?? 0)}
    </div>
  );
}

export function renderAutoPanNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<AutoPanConfigShape, AutoPanVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["rateHz", "amount"]);
  const focusControls = resolveFxControls(controls, ["lfoShape", "phaseOffset", "smoothing"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Auto-pan motion</strong>
          <span class={styles["visualizer-badge"]}>{config.lfoShape}</span>
        </div>
        {renderMotionLane(visualizer?.panPosition ?? 0)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Sweep macro</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Rate and amount stay mirrored in rack mode.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>LFO shape</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Shape, phase offset, and smoothing.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type RotarySpeakerVisualizerShape = {
  hornAngle: number;
  drumAngle: number;
};

export function renderRotarySpeakerRackVisualizer(visualizer: RotarySpeakerVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Rotary Speaker</strong>
        <span class={styles["visualizer-badge"]}>Horn / drum</span>
      </div>
      {renderScalarRows([["Horn angle", visualizer?.hornAngle ?? 0], ["Drum angle", visualizer?.drumAngle ?? 0]])}
    </div>
  );
}

export function renderRotarySpeakerNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<AnyNodeConfig, RotarySpeakerVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["fast", "drive"]);
  const focusControls = resolveFxControls(controls, ["hornDrumBalance", "micDistance", "acceleration"]);
  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Rotor motion</strong>
          <span class={styles["visualizer-badge"]}>Doppler + AM</span>
        </div>
        {renderScalarRows([["Horn angle", visualizer?.hornAngle ?? 0], ["Drum angle", visualizer?.drumAngle ?? 0]])}
      </div>
      <div class={styles["focus-section"]}>{renderControlGrid(rackControls, config, updateControl)}</div>
      <div class={styles["focus-section"]}>{renderControlGrid(focusControls, config, updateControl)}</div>
    </div>
  );
}

type PitchDriftVisualizerShape = {
  driftCents: number[];
};

export function renderPitchDriftRackVisualizer(visualizer: PitchDriftVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Pitch Drift</strong>
        <span class={styles["visualizer-badge"]}>Variable delay</span>
      </div>
      {renderSeries("Drift cents", visualizer?.driftCents ?? [])}
    </div>
  );
}

export function renderPitchDriftNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<AnyNodeConfig, PitchDriftVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["depth", "rateHz"]);
  const focusControls = resolveFxControls(controls, ["driftShape", "stereoOffset", "rangeCents"]);
  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Pitch motion</strong>
          <span class={styles["visualizer-badge"]}>Cents</span>
        </div>
        {renderSeries("Drift cents", visualizer?.driftCents ?? [])}
      </div>
      <div class={styles["focus-section"]}>{renderControlGrid(rackControls, config, updateControl)}</div>
      <div class={styles["focus-section"]}>{renderControlGrid(focusControls, config, updateControl)}</div>
    </div>
  );
}
