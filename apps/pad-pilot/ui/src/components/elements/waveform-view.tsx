import { Show, createMemo } from "solid-js";
import styles from "./waveform-view.module.css";

/**
 * Props for WaveformView.
 */
type WaveformViewProps = {
  /** Peak amplitude points normalized to 0..1 */
  peaks: number[];
  /** Optional class for container */
  class?: string;
  /** Optional text displayed when no peaks are present */
  emptyText?: string;
  /** Optional waveform line thickness */
  lineThickness?: number;
};

/**
 * WaveformView renders a lightweight waveform preview from peak data.
 */
export function WaveformView(props: WaveformViewProps) {
  const path = createMemo(() => {
    if (props.peaks.length === 0) return "";
    const width = 100;
    const middle = 50;
    const step = width / Math.max(1, props.peaks.length - 1);
    return props.peaks
      .map((peak, index) => {
        const x = index * step;
        const y = middle - clamp(peak, 0, 1) * 42;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
      })
      .join(" ");
  });

  return (
    <div
      class={`${styles.root} ${props.class ?? ""}`.trim()}
      style={{ "--waveform-line-thickness": String(props.lineThickness ?? 0.75) }}
    >
      <svg class={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Impulse waveform">
        <line class={styles["center-line"]} x1="0" y1="50" x2="100" y2="50" />
        <path class={styles.line} d={path()} />
      </svg>
      <Show when={props.peaks.length === 0}>
        <div class={styles.empty}>{props.emptyText ?? "Drop impulse file"}</div>
      </Show>
    </div>
  );
}

import { clamp } from "../../utils/math";
