import { createMemo } from "solid-js";
import styles from "./envelope-visualizer.stylex";

/**
 * Props for EnvelopeVisualizer.
 */
export type EnvelopeVisualizerProps = {
  /** Attack stage amount */
  attack: number;
  /** Decay stage amount */
  decay: number;
  /** Sustain stage level */
  sustain: number;
  /** Release stage amount */
  release: number;
};

/**
 * EnvelopeVisualizer draws an ADSR-style envelope preview path.
 */
export function EnvelopeVisualizer(props: EnvelopeVisualizerProps) {
  const path = createMemo(() => {
    const attack = clamp(props.attack, 0.01, 1);
    const decay = clamp(props.decay, 0.01, 1);
    const sustain = clamp(props.sustain, 0, 1);
    const release = clamp(props.release, 0.01, 1);

    const total = attack + decay + release + 1;
    const ax = (attack / total) * 320;
    const dx = ax + (decay / total) * 320;
    const sx = 320 - (release / total) * 320;

    const sustainY = 100 - sustain * 70;
    return `M 0 100 L ${ax.toFixed(2)} 10 L ${dx.toFixed(2)} ${sustainY.toFixed(2)} L ${sx.toFixed(2)} ${sustainY.toFixed(2)} L 320 100`;
  });

  return (
    <div class={styles.root}>
      <svg class={styles.svg} viewBox="0 0 320 110" role="img" aria-label="Envelope visualizer">
        <path class={styles.path} d={path()} />
      </svg>
    </div>
  );
}

import { clamp } from "../../utils/math";
