import { Show, createSignal } from "solid-js";
import { FileUploadDropzone, type FileUploadSelection } from "../../../components/elements/file-upload-dropzone";
import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import { IO } from "../../../padpilot/provider";
import { renderFxControlField, resolveFxControls } from "../components/fx-control-field";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import styles from "../fx-node-registry.module.css";
import { clampSeriesValue, renderControlGrid, renderOrb, renderScalarRows, renderSeries } from "./renderer-primitives";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";

type EqConfigShape = {
  lowShelfGainDb: number;
  highShelfGainDb: number;
  masterGainDb: number;
  bands: Array<{ frequencyHz: number; q: number; gainDb: number; type: string; enabled?: boolean }>;
};

type EqVisualizerShape = {
  spectrumBins: number[];
  responseCurve: number[];
};

export function renderEqRackVisualizer(visualizer: EqVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Analyzer</strong>
        <span class={styles["visualizer-badge"]}>Output spectrum</span>
      </div>
      <div class={styles["visualizer-grid"]}>
        {renderSeries("Spectrum", visualizer?.spectrumBins ?? [])}
      </div>
    </div>
  );
}

export function renderEqNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<EqConfigShape, EqVisualizerShape>) {
  const bandControls = resolveFxControls(controls, ["band0FrequencyHz", "band0GainDb", "band0Q", "band0Type"]);
  const shelfControls = resolveFxControls(controls, ["lowShelfGainDb", "highShelfGainDb", "masterGainDb"]);
  const bandCount = Math.max(1, config.bands.length);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Output spectrum</strong>
          <span class={styles["visualizer-badge"]}>{bandCount}/24 bands</span>
        </div>
        <div class={styles["visualizer-grid"]}>
          {renderSeries("Spectrum", visualizer?.spectrumBins ?? [])}
        </div>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Band editor</strong>
          <small>Primary interactive band controls while the multi-band surface is staged.</small>
        </div>
        {renderControlGrid(bandControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Shelves and output</strong>
          <small>Low shelf, high shelf, and master gain.</small>
        </div>
        {renderControlGrid(shelfControls, config, updateControl)}
      </div>
    </div>
  );
}

type TransientShaperConfigShape = {
  attack: number;
  sustain: number;
  softClip: boolean;
  gainDb: number;
  sensitivity: number;
};

type TransientShaperVisualizerShape = {
  originalEnvelope: number[];
  shapedEnvelope: number[];
};

export function renderTransientShaperRackVisualizer(visualizer: TransientShaperVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Input/output waveform</strong>
        <span class={styles["visualizer-badge"]}>Input vs output</span>
      </div>
      <div class={styles["visualizer-grid"]}>
        {renderSeries("Input", visualizer?.originalEnvelope ?? [])}
        {renderSeries("Output", visualizer?.shapedEnvelope ?? [])}
      </div>
    </div>
  );
}

export function renderTransientShaperNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<TransientShaperConfigShape, TransientShaperVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["attack", "sustain"]);
  const focusControls = resolveFxControls(controls, ["softClip", "gainDb", "sensitivity"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Input/output waveform</strong>
          <span class={`${styles["visualizer-badge"]} ${config.softClip ? styles["visualizer-badge-alert"] : ""}`}>
            {config.softClip ? "Soft clip" : "Clean"}
          </span>
        </div>
        <div class={styles["visualizer-grid"]}>
          {renderSeries("Input", visualizer?.originalEnvelope ?? [])}
          {renderSeries("Output", visualizer?.shapedEnvelope ?? [])}
        </div>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Transient shape</strong>
          <small>Attack and sustain define the rack macro response.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Output contour</strong>
          <small>Soft clip, gain staging, and detector sensitivity.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type ReverbConfigShape = {
  mode: string;
  decay: number;
  size: number;
  focusMix: number;
  damping: number;
  preDelayMs: number;
  modulationSpeedHz: number;
  modulationDepth: number;
};

type ReverbVisualizerShape = {
  diffusion: number;
  texture: number;
  shimmer: number;
};

function getReverbWidthLabel(mode: string) {
  switch (mode) {
    case "Room":
      return "Narrow";
    case "Plate":
      return "Wide";
    case "Shimmer":
      return "Extra wide";
    default:
      return "Balanced";
  }
}

function getReverbActivity(visualizer: ReverbVisualizerShape | null, nodeFrame: NodeVisualizerFrame | null) {
  const scalarIntensity = ((visualizer?.diffusion ?? 0) + (visualizer?.texture ?? 0)) / 2;
  const deltaDb = nodeFrame ? Math.abs(nodeFrame.outputPeakDb - nodeFrame.inputPeakDb) : 0;
  return scalarIntensity * 0.35 + clampSeriesValue(deltaDb / 18) * 0.65;
}

export function renderReverbRackVisualizer(visualizer: ReverbVisualizerShape | null, nodeFrame: NodeVisualizerFrame | null) {
  const intensity = getReverbActivity(visualizer, nodeFrame);
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]} ${styles["visualizer-shell-reverb"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Reverb output</strong>
        <span class={styles["visualizer-badge"]}>Activity</span>
      </div>
      {renderOrb(intensity, styles["visualizer-orb-reverb"])}
      {renderScalarRows([
        ["Output activity", visualizer?.diffusion ?? 0],
        ["Damping", visualizer?.texture ?? 0],
      ])}
    </div>
  );
}

export function renderReverbNodeEditor({
  controls,
  config,
  nodeFrame,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<ReverbConfigShape, ReverbVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["decay", "size", "focusMix"]);
  const modeControl = controls.find((control) => control.key === "mode");
  const focusControls = resolveFxControls(controls, ["damping", "preDelayMs", "modulationSpeedHz", "modulationDepth"]);
  const activity = getReverbActivity(visualizer, nodeFrame);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]} ${styles["visualizer-shell-reverb"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Ambience hub</strong>
          <span class={styles["visualizer-badge"]}>{getReverbWidthLabel(config.mode)}</span>
        </div>
        {renderOrb(activity, styles["visualizer-orb-reverb"])}
        {renderScalarRows([
          ["Output activity", visualizer?.diffusion ?? 0],
          ["Damping", visualizer?.texture ?? 0],
          ["Delta dB", nodeFrame ? Math.abs(nodeFrame.outputPeakDb - nodeFrame.inputPeakDb) : 0],
        ])}
      </div>
      <Show when={modeControl}>{renderFxControlField(modeControl!, config, updateControl)}</Show>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Reverb shape</strong>
          <small>Decay, size, and mix define the compact behavior.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Ambience details</strong>
          <small>Damping, pre-delay, and modulation shape the ambience.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}

type ConvolverConfigShape = {
  irSourceName: string;
};

type ConvolverVisualizerShape = {
  irWaveform: number[];
};

export function renderConvolverRackVisualizer(visualizer: ConvolverVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Convolver</strong>
        <span class={styles["visualizer-badge"]}>IR</span>
      </div>
      {renderSeries("Impulse", visualizer?.irWaveform ?? [])}
    </div>
  );
}

export function renderConvolverNodeEditor({
  controls,
  config,
  name,
  updateControl,
}: FxNodeFocusRenderProps<ConvolverConfigShape, ConvolverVisualizerShape>) {
  const [importError, setImportError] = createSignal("");
  const blendControl = resolveFxControls(controls, ["blend"]);
  const importSelection = async (selection: FileUploadSelection) => {
    const input = selection.files[0] ?? selection.paths[0];
    if (!input) return;
    try {
      setImportError("");
      const imported = await IO.importFile(input, {
        category: "impulse-response",
        maxBytes: PADPILOT_FILE_IMPORT_MAX_BYTES,
      });
      // Publish identity last so native accepts only the complete managed reference.
      updateControl("irSourcePath", imported.path, true);
      updateControl("irSourceName", imported.name, true);
      updateControl("irId", imported.contentId, true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "PadPilot could not import this impulse response.");
    }
  };

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>{name}</strong>
          <span class={styles["visualizer-badge"]}>{config.irSourceName || "No IR"}</span>
        </div>
        <FileUploadDropzone
          accept=".wav,.aif,.aiff,.flac,.mp3,.ogg,audio/*"
          hint="Drop impulse response or click to browse"
          onSelection={(selection) => { importSelection(selection); }}
        >
          <div class={styles["focus-empty"]}>{config.irSourceName || "Choose a managed impulse response"}</div>
        </FileUploadDropzone>
        <Show when={importError()}><div class={styles["focus-empty"]}>{importError()}</div></Show>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Convolution mix</strong>
          <small>Blend the loaded impulse response with the dry signal.</small>
        </div>
        {renderControlGrid(blendControl, config, updateControl)}
      </div>
    </div>
  );
}
