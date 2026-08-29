import { For } from "solid-js";
import { resolveFxControls } from "../components/fx-control-field";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import type { AnyNodeConfig } from "./types";
import styles from "../fx-node-registry.stylex";
import { clampSeriesValue, renderControlGrid } from "./renderer-primitives";

type DelayVisualizerShape = {
  tapPositions: number[];
  tapLevels: number[];
};

function renderDelayActivityField(visualizer: DelayVisualizerShape | null) {
  const positions = visualizer?.tapPositions ?? [];
  const levels = visualizer?.tapLevels ?? [];
  return (
    <div class={styles["delay-tap-field"]}>
      <For each={positions.slice(0, 12)}>
        {(position, index) => {
          const level = levels[index()] ?? 0.2;
          return (
            <span
              class={styles["delay-tap"]}
              style={{
                left: `${clampSeriesValue(position) * 100}%`,
                height: `${Math.max(18, clampSeriesValue(level) * 100)}%`,
              }}
            />
          );
        }}
      </For>
    </div>
  );
}

/**
 * Renders a live delay-output activity visualizer.
 */
export function renderDelayRackVisualizer(visualizer: DelayVisualizerShape | null) {
  return (
    <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>
      <div class={styles["visualizer-header"]}>
        <strong>Delay output</strong>
        <span class={styles["visualizer-badge"]}>Live</span>
      </div>
      {renderDelayActivityField(visualizer)}
    </div>
  );
}

/**
 * Renders a delay focus editor with controls backed by the native delay line.
 */
export function renderDelayNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<AnyNodeConfig, DelayVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["time", "feedback", "focusMix"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Delay output activity</strong>
          <span class={styles["visualizer-badge"]}>Standard delay</span>
        </div>
        {renderDelayActivityField(visualizer)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Rack controls</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Time, feedback, and mix stay available while focused.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
    </div>
  );
}

type StereoImagerConfigShape = {
  widthPercent: number;
  bassMonoCrossoverHz: number;
  stereoBalance: number;
  pan: number;
};

type StereoImagerVisualizerShape = {
  vectorscopePoints: number[];
};

function renderVectorscope(points: number[]) {
  const pairs = [];
  for (let index = 0; index < points.length - 1; index += 2) {
    pairs.push([points[index] ?? 0, points[index + 1] ?? 0] as const);
  }

  return (
    <div class={styles.vectorscope}>
      <span class={styles["vectorscope-axis-horizontal"]} />
      <span class={styles["vectorscope-axis-vertical"]} />
      <For each={pairs}>
        {([x, y]) => (
          <span
            class={styles["vectorscope-dot"]}
            style={{
              left: `${clampSeriesValue((x + 1) / 2) * 100}%`,
              top: `${100 - clampSeriesValue((y + 1) / 2) * 100}%`,
            }}
          />
        )}
      </For>
    </div>
  );
}

/**
 * Renders the stereo imager rack vectorscope preview.
 */
export function renderStereoImagerRackVisualizer(visualizer: StereoImagerVisualizerShape | null) {
  return <div class={`${styles["rack-visualizer"]} ${styles["visualizer-shell"]}`}>{renderVectorscope(visualizer?.vectorscopePoints ?? [])}</div>;
}

/**
 * Renders a stereo imager focus editor with vectorscope-first presentation.
 */
export function renderStereoImagerNodeEditor({
  controls,
  config,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<StereoImagerConfigShape, StereoImagerVisualizerShape>) {
  const rackControls = resolveFxControls(controls, ["widthPercent"]);
  const focusControls = resolveFxControls(controls, ["bassMonoCrossoverHz", "stereoBalance", "pan"]);

  return (
    <div class={styles["focus-editor"]}>
      <div class={`${styles["focus-visualizer"]} ${styles["visualizer-shell"]}`}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>Vectorscope</strong>
          <span class={`${styles["visualizer-badge"]} ${config.widthPercent > 100 ? styles["visualizer-badge-info"] : ""}`}>
            {Math.round(config.widthPercent)}% width
          </span>
        </div>
        {renderVectorscope(visualizer?.vectorscopePoints ?? [])}
        <div class={styles["visualizer-scalars"]}>
          <div class={styles["visualizer-row"]}>
            <span>Bass mono crossover</span>
            <strong>{Math.round(config.bassMonoCrossoverHz)} Hz</strong>
          </div>
          <div class={styles["visualizer-row"]}>
            <span>Balance / Pan</span>
            <strong>
              {config.stereoBalance.toFixed(2)} / {config.pan.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Width</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Compact rack control with vectorscope feedback.</small>
        </div>
        {renderControlGrid(rackControls, config, updateControl)}
      </div>
      <div class={styles["focus-section"]}>
        <div class={styles["focus-section-header"]}>
          <strong>Image shaping</strong>
          <small class={`${styles["focus-visualizer-header-small"]} ${styles["focus-section-header-small"]}`.trim()}>Bass mono crossover, stereo balance, and pan.</small>
        </div>
        {renderControlGrid(focusControls, config, updateControl)}
      </div>
    </div>
  );
}
