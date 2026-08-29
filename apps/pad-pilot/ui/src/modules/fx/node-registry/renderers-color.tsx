import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import { resolveFxControls } from "../components/fx-control-field";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import type { AnyNodeConfig } from "./types";
import styles from "../fx-node-registry.module.css";
import { clampSeriesValue, renderControlGrid, renderOrb, renderScalarRows, renderSeries } from "./renderer-primitives";

type TapeSaturationConfigShape = {
  drive: number;
  warmth: number;
  tapeSpeedIps: number;
  wowFlutter: number;
  hysteresis: number;
  bias: number;
};

type TapeSaturationVisualizerShape = {
  reelRotation: number;
  flux: number;
};

export function renderTapeSaturationRackVisualizer(_visualizer: TapeSaturationVisualizerShape | null, nodeFrame: NodeVisualizerFrame | null) {
  const outputPeakDb = nodeFrame?.outputPeakDb ?? -120;
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Tape output</strong>
        <span class={styles["visualizer-badge"]}>{outputPeakDb.toFixed(1)} dB</span>
      </div>
      {renderOrb(clampSeriesValue((outputPeakDb + 60) / 60))}
    </div>
  );
}

export function renderTapeSaturationNodeEditor({
  controls,
  config,
  nodeFrame,
  updateControl,
}: FxNodeFocusRenderProps<TapeSaturationConfigShape, TapeSaturationVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["drive", "warmth"]);
  const focusControls = resolveFxControls(controls, ["tapeSpeedIps", "wowFlutter", "hysteresis", "bias"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Tape saturation</strong>
          <span class={styles["visualizer-badge"]}>{config.tapeSpeedIps} ips</span>
        </div>
        {renderOrb(clampSeriesValue(((nodeFrame?.outputPeakDb ?? -120) + 60) / 60))}
        {renderScalarRows([
          ["Output peak dB", nodeFrame?.outputPeakDb ?? -120],
          ["Input/output delta dB", nodeFrame ? Math.abs(nodeFrame.outputPeakDb - nodeFrame.inputPeakDb) : 0],
        ])}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Drive stage</strong>
          <small>Compact drive and warmth controls.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Tape character</strong>
          <small>Speed, wow/flutter, hysteresis, and bias.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type BitcrusherVisualizerShape = {
  aliasedWaveform: number[];
  stairStepAmount: number;
};

export function renderBitcrusherRackVisualizer(visualizer: BitcrusherVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Aliasing grid</strong>
        <span class={styles["visualizer-badge"]}>Output waveform</span>
      </div>
      {renderSeries("Output", visualizer?.aliasedWaveform ?? [])}
    </div>
  );
}

export function renderBitcrusherNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<AnyNodeConfig, BitcrusherVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["bits", "downsample"]);
  const focusControls = resolveFxControls(controls, ["jitter", "postFilter", "wetDry"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Crushed output</strong>
          <span class={styles["visualizer-badge"]}>Waveform</span>
        </div>
        {renderSeries("Output", visualizer?.aliasedWaveform ?? [])}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Bit depth</strong>
          <small>Bits and downsample set the rack macro.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Texture cleanup</strong>
          <small>Jitter, post-filter, and wet/dry blend.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type ExciterConfigShape = {
  harmonicDrive: number;
  mix: number;
  frequencyBandSolo: string;
  oddEvenBalance: number;
};

type ExciterVisualizerShape = {
  generatedHarmonics: number[];
};

export function renderExciterRackVisualizer(visualizer: ExciterVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Exciter output</strong>
        <span class={`${styles["visualizer-badge"]} ${styles["visualizer-badge-info"]}`}>Waveform</span>
      </div>
      {renderSeries("Output", visualizer?.generatedHarmonics ?? [])}
    </div>
  );
}

export function renderExciterNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<ExciterConfigShape, ExciterVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["harmonicDrive", "mix"]);
  const focusControls = resolveFxControls(controls, ["frequencyBandSolo", "oddEvenBalance"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Exciter output</strong>
          <span class={styles["visualizer-badge"]}>{config.frequencyBandSolo} band</span>
        </div>
        {renderSeries("Output", visualizer?.generatedHarmonics ?? [])}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Drive</strong>
          <small>Harmonic drive and mix define the rack behavior.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Harmonic balance</strong>
          <small>Target band and odd/even weighting.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type ChorusVisualizerShape = {
  phaseOffsets: number[];
};

export function renderChorusRackVisualizer(_visualizer: ChorusVisualizerShape | null, nodeFrame: NodeVisualizerFrame | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Modulated delay</strong>
        <span class={styles["visualizer-badge"]}>Chorus</span>
      </div>
      {renderScalarRows([["Output peak dB", nodeFrame?.outputPeakDb ?? -120]])}
    </div>
  );
}

export function renderChorusNodeEditor({
  controls,
  config,
  nodeFrame,
  updateControl,
}: FxNodeFocusRenderProps<AnyNodeConfig, ChorusVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["rateHz", "depth"]);
  const focusControls = resolveFxControls(controls, ["width", "voiceDelayMs", "feedback"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Chorus output</strong>
          <span class={styles["visualizer-badge"]}>Modulated delay</span>
        </div>
        {renderScalarRows([["Output peak dB", nodeFrame?.outputPeakDb ?? -120]])}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Motion</strong>
          <small>Rate and depth control the chorus sweep.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Delay field</strong>
          <small>Width, delay, and feedback shape the chorus.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}
