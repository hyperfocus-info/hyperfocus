import { resolveFxControls } from "../components/fx-control-field";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import styles from "../fx-node-registry.stylex";
import { renderControlGrid, renderMeterFill, renderSeries, renderSignedSeries } from "./renderer-primitives";

type CompressorConfigShape = {
  thresholdDb: number;
  ratio: number;
  makeupDb: number;
  attackMs: number;
  releaseMs: number;
};

type CompressorVisualizerShape = {
  inputCurve: number[];
  gainCurve: number[];
  expansionMode: boolean;
};

/**
 * Renders a compressor-specific rack visualizer with the T-junction meter treatment.
 */
export function renderCompressorRackVisualizer(visualizer: CompressorVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Dynamics</strong>
        <span class={`${styles["visualizer-badge"]} ${visualizer?.expansionMode ? styles["visualizer-badge-alert"] : ""}`}>
          {visualizer?.expansionMode ? "Expansion" : "Compression"}
        </span>
      </div>
      <div class={styles["compressor-graph"]}>
        {renderSeries("Input", visualizer?.inputCurve ?? [])}
        {renderSignedSeries(visualizer?.expansionMode ? "Expansion" : "Gain delta", visualizer?.gainCurve ?? [])}
      </div>
    </div>
  );
}

/**
 * Renders a compressor focus editor with the native dynamics controls.
 */
export function renderCompressorNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<CompressorConfigShape, CompressorVisualizerShape>) {
  const primaryControls = resolveFxControls(controls, ["thresholdDb", "ratio", "makeupDb"]);
  const timingControls = resolveFxControls(controls, ["attackMs", "releaseMs"]);
  const expansionMode = () => config.ratio < 1 || visualizer?.expansionMode;

  return (
    <div class={`${styles["focus-editor"]} ${expansionMode() ? styles["focus-editor-alert"] : ""}`}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Dynamics engine</strong>
          <span class={`${styles["visualizer-badge"]} ${expansionMode() ? styles["visualizer-badge-alert"] : ""}`}>
            {expansionMode() ? "Expansion mode" : "Compression mode"}
          </span>
        </div>
        <div class={styles["compressor-graph"]}>
          {renderSeries("Input", visualizer?.inputCurve ?? [])}
          {renderSignedSeries(expansionMode() ? "Expansion delta" : "Gain reduction", visualizer?.gainCurve ?? [])}
        </div>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Rack controls</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Threshold, ratio, and makeup remain available while focused.</small>
        </div>
        {renderControlGrid(primaryControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Timing</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Attack and release shape the detector response.</small>
        </div>
        {renderControlGrid(timingControls, config, updateControl)}
      </div>
    </div>
  );
}

type NoiseGateConfigShape = {
  thresholdDb: number;
  rangeDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
};

type NoiseGateVisualizerShape = {
  signalLevelDb: number;
  thresholdDb: number;
};

/**
 * Renders the measured gate output against its configured threshold.
 */
export function renderNoiseGateRackVisualizer(visualizer: NoiseGateVisualizerShape | null) {
  const signalDb = visualizer?.signalLevelDb ?? -80;
  const thresholdDb = visualizer?.thresholdDb ?? -36;
  const aboveThreshold = signalDb >= thresholdDb;
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Gate</strong>
        <span class={`${styles["visualizer-badge"]} ${aboveThreshold ? styles["visualizer-badge-success"] : styles["visualizer-badge-alert"]}`}>
          {aboveThreshold ? "Above threshold" : "Below threshold"}
        </span>
      </div>
      <div class={styles["noisegate-status"]}>
        <span class={`${styles["noisegate-light"]} ${aboveThreshold ? styles["noisegate-light-open"] : styles["noisegate-light-closed"]}`} />
        <div class={styles["noisegate-meter"]}>
          <span class={styles["noisegate-meter-fill"]} style={{ height: renderMeterFill(signalDb, -80, 6) }} />
          <span class={styles["noisegate-threshold"]} style={{ bottom: renderMeterFill(thresholdDb, -80, 6) }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a noise gate focus editor with measured output and threshold feedback.
 */
export function renderNoiseGateNodeEditor({
  controls,
  config,
  nodeFrame,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<NoiseGateConfigShape, NoiseGateVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["thresholdDb", "rangeDb"]);
  const timingControls = resolveFxControls(controls, ["attackMs", "holdMs", "releaseMs"]);
  const signalDb = visualizer?.signalLevelDb ?? nodeFrame?.outputPeakDb ?? -120;
  const thresholdDb = visualizer?.thresholdDb ?? config.thresholdDb;
  const aboveThreshold = signalDb >= thresholdDb;

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Gate monitor</strong>
          <span class={`${styles["visualizer-badge"]} ${aboveThreshold ? styles["visualizer-badge-success"] : styles["visualizer-badge-alert"]}`}>
            {aboveThreshold ? "Output above threshold" : "Output below threshold"}
          </span>
        </div>
        <div class={styles["noisegate-focus-shell"]}>
          <div class={styles["noisegate-traffic"]}>
            <span class={`${styles["noisegate-light"]} ${aboveThreshold ? styles["noisegate-light-open"] : styles["noisegate-light-closed"]}`} />
            <strong>{aboveThreshold ? "Above" : "Below"}</strong>
          </div>
          <div class={styles["noisegate-meter-large"]}>
            <span class={styles["noisegate-meter-fill"]} style={{ height: renderMeterFill(signalDb, -80, 6) }} />
            <span class={styles["noisegate-threshold"]} style={{ bottom: renderMeterFill(thresholdDb, -80, 6) }} />
          </div>
          <div class={styles["visualizer-scalars"]}>
            <div class={styles["visualizer-row"]}>
              <span>Signal</span>
              <strong>{signalDb.toFixed(1)} dB</strong>
            </div>
            <div class={styles["visualizer-row"]}>
              <span>Threshold</span>
              <strong>{thresholdDb.toFixed(1)} dB</strong>
            </div>
          </div>
        </div>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Rack controls</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Threshold and range stay mirrored into the compact card.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Timing</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Attack, hold, and release define the open/close contour.</small>
        </div>
        {renderControlGrid(timingControls, config, updateControl)}
      </div>
    </div>
  );
}
