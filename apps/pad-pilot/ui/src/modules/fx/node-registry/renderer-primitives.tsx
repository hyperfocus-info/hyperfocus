import { For, Show } from "solid-js";
import { type AnyNodeConfig, type FxNodeControlDefinition, type FxNodeControlValue } from "./types";
import { type FxNodeFocusRenderProps } from "./renderer-types";
import { FX_VISUALIZER_DISPLAY_BIN_COUNT, resampleVisualizerSeries } from "../fx-visualizer-smoothing";
import { renderFxControlField } from "../components/fx-control-field";
import { clamp01Or } from "../../../utils/math";
import styles from "../fx-node-registry.module.css";

export function clampSeriesValue(value: number) {
  return clamp01Or(value, 0);
}

export function normalizeSeries(values: number[]) {
  const sampled = resampleVisualizerSeries(values, FX_VISUALIZER_DISPLAY_BIN_COUNT);
  if (sampled.length === 0) {
    return [];
  }

  const absMax = sampled.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (absMax <= 0.0001) {
    return sampled.map(() => 0.04);
  }

  return sampled.map((value) => clampSeriesValue(Math.abs(value) / absMax));
}

export function normalizeSignedSeries(values: number[]) {
  const sampled = resampleVisualizerSeries(values, FX_VISUALIZER_DISPLAY_BIN_COUNT);
  if (sampled.length === 0) {
    return [];
  }

  const absMax = sampled.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (absMax <= 0.0001) {
    return sampled.map(() => 0);
  }

  return sampled.map((value) => Math.max(-1, Math.min(1, value / absMax)));
}

export function renderSeries(label: string, values: number[]) {
  const normalized = normalizeSeries(values);
  return (
    <div class={styles["visualizer-series"]}>
      <div class={styles["visualizer-series-label"]}>
        <span>{label}</span>
        <strong>{values.length}</strong>
      </div>
      <div class={styles["visualizer-bars"]}>
        <For each={normalized}>
          {(value) => <span class={styles["visualizer-bar"]} style={{ height: `${Math.max(8, value * 100)}%` }} />}
        </For>
      </div>
    </div>
  );
}

export function renderSignedSeries(label: string, values: number[]) {
  const normalized = normalizeSignedSeries(values);
  return (
    <div class={styles["visualizer-series"]}>
      <div class={styles["visualizer-series-label"]}>
        <span>{label}</span>
        <strong>{values.length}</strong>
      </div>
      <div class={`${styles["visualizer-bars"]} ${styles["visualizer-bars-signed"]}`}>
        <For each={normalized}>
          {(value) => (
            <span
              class={styles["visualizer-bar-signed-shell"]}
              data-polarity={value >= 0 ? "positive" : "negative"}
            >
              <span
                class={styles["visualizer-bar-signed"]}
                data-polarity={value >= 0 ? "positive" : "negative"}
                style={{
                  height: `${Math.max(2, Math.abs(value) * 48)}%`,
                }}
              />
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

export function renderScalarRows(entries: Array<[string, unknown]>) {
  return (
    <div class={styles["visualizer-scalars"]}>
      <For each={entries.slice(0, 6)}>
        {([key, value]) => (
          <div class={styles["visualizer-row"]}>
            <span>{key}</span>
            <strong>{typeof value === "number" ? value.toFixed(Math.abs(value) >= 10 ? 0 : 2) : String(value)}</strong>
          </div>
        )}
      </For>
    </div>
  );
}

export function renderControlGrid<TConfig>(
  controls: FxNodeControlDefinition<TConfig>[],
  config: TConfig,
  updateControl: (key: string, value: FxNodeControlValue, commit: boolean) => void,
  size = 50,
) {
  return (
    <div class={styles["focus-control-grid"]}>
      <For each={controls}>{(control) => renderFxControlField(control, config, updateControl, { size })}</For>
    </div>
  );
}

export function renderMeterFill(value: number, min: number, max: number) {
  const ratio = clampSeriesValue((value - min) / Math.max(0.0001, max - min));
  return `${ratio * 100}%`;
}

export function renderVisualizerSummary(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return <div class={styles["visualizer-placeholder"]}>Visualizer idle</div>;
  }

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined && value !== null);
  const arrays = entries.flatMap(([key, value]) =>
    Array.isArray(value) && value.every((entry) => typeof entry === "number")
      ? [[key, value] satisfies [string, number[]]]
      : []
  );
  const scalars = entries.filter(([, value]) => !Array.isArray(value));
  return (
    <div class={styles["visualizer-placeholder"]}>
      <Show when={arrays.length > 0} fallback={renderScalarRows(scalars)}>
        <div class={styles["visualizer-grid"]}>
          <For each={arrays.slice(0, 2)}>{([key, value]) => renderSeries(key, value)}</For>
        </div>
        <Show when={scalars.length > 0}>{renderScalarRows(scalars)}</Show>
      </Show>
    </div>
  );
}

/**
 * Renders a generic focus editor from control metadata and the latest visualizer payload.
 */
export function renderStandardNodeEditor<TConfig extends AnyNodeConfig, TVisualizer>({
  controls,
  config,
  name,
  updateControl,
  visualizer,
}: FxNodeFocusRenderProps<TConfig, TVisualizer>) {
  return (
    <div class={styles["focus-editor"]}>
      <div class={styles["focus-visualizer"]}>
        <div class={styles["focus-visualizer-header"]}>
          <strong>{name}</strong>
          <small>Latest visualizer frame</small>
        </div>
        {renderVisualizerSummary(visualizer)}
      </div>
      {renderControlGrid(controls, config, updateControl)}
      <Show when={controls.length === 0}>
        <div class={styles["focus-empty"]}>No expanded controls are available for this node yet.</div>
      </Show>
    </div>
  );
}

/**
 * Renders a compact rack-side visualizer summary.
 */
export function renderStandardRackVisualizer<TVisualizer>(visualizer: TVisualizer | null) {
  return <div class={styles["rack-visualizer"]}>{renderVisualizerSummary(visualizer)}</div>;
}

export function renderOrb(intensity: number, accentClass = "") {
  const shellScale = 0.94 + clampSeriesValue(intensity) * 0.18;
  const coreScale = 0.74 + clampSeriesValue(intensity) * 0.92;
  return (
    <div class={`${styles["visualizer-orb"]} ${accentClass}`}>
      <span class={styles["visualizer-orb-shell"]} style={{ transform: `translate(-50%, -50%) scale(${shellScale})` }} />
      <span class={styles["visualizer-orb-core"]} style={{ transform: `translate(-50%, -50%) scale(${coreScale})` }} />
    </div>
  );
}

export function renderMotionLane(position: number) {
  return (
    <div class={styles["motion-lane"]}>
      <span class={styles["motion-ball"]} style={{ left: `${clampSeriesValue((position + 1) / 2) * 100}%` }} />
    </div>
  );
}
