import { For, Show, createMemo, splitProps, type JSX } from "solid-js";
import { Tooltip } from "./tooltip";
import { type ElementSkin, resolveElementSkin, type TooltipPlacement } from "./element-skin";
import { clamp } from "../../utils/math";
import styles from "./styles/meter.stylex";
import { labelTypographyClass } from "./styles/element-typography.stylex";

/**
 * Props for Meter.
 */
export type MeterProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Optional label shown below the meter. */
  label?: string;
  /** Optional left channel value shown when stereo metering is enabled. */
  leftValueDb?: number;
  /** Maximum displayed dB value. */
  maxDb?: number;
  /** Minimum displayed dB value. */
  minDb?: number;
  /** Meter orientation. */
  orientation?: "horizontal" | "vertical";
  /** Optional right channel value shown when stereo metering is enabled. */
  rightValueDb?: number;
  /** Enables dual-channel rendering when left and right values are available. */
  stereo?: boolean;
  /** Current displayed meter value in dB. */
  valueDb: number;
  /** Optional tooltip text shown on hover or focus. */
  tooltip?: string;
  /** Preferred tooltip placement relative to the meter. */
  tooltipPlacement?: TooltipPlacement;
  /** Optional state-based image skin for the meter. */
  skin?: ElementSkin;
  /** Optional position of the label. default is bottom */
  labelPosition?: "top" | "bottom";
};

export type MeterChannel = {
  id: "left" | "mono" | "right";
  label: string;
  valueDb: number;
};

export function resolveMeterPresentation(props: Pick<MeterProps, "label" | "leftValueDb" | "rightValueDb" | "stereo" | "valueDb">) {
  const stereoEnabled = props.stereo === true && typeof props.leftValueDb === "number" && typeof props.rightValueDb === "number";
  return {
    stereoEnabled,
    channels: stereoEnabled
      ? [
        { id: "left", label: "L", valueDb: props.leftValueDb as number },
        { id: "right", label: "R", valueDb: props.rightValueDb as number },
      ]
      : [{ id: "mono", label: props.label ?? "", valueDb: props.valueDb }],
    readout: stereoEnabled
      ? `L ${props.leftValueDb!.toFixed(1)} / R ${props.rightValueDb!.toFixed(1)} dB`
      : `${props.valueDb.toFixed(1)} dB`,
  };
}

/** Meter renders a segmented level meter with forwarded host props. */
export function Meter(props: MeterProps) {
  const [local, others] = splitProps(props, [
    "class",
    "label",
    "leftValueDb",
    "maxDb",
    "minDb",
    "orientation",
    "rightValueDb",
    "skin",
    "stereo",
    "tooltip",
    "tooltipPlacement",
    "valueDb",
    "labelPosition",
  ]);
  const minDb = () => local.minDb ?? -60;
  const maxDb = () => local.maxDb ?? 6;
  const fillPercent = (valueDb: number) => {
    const bounded = clamp(valueDb, minDb(), maxDb());
    return ((bounded - minDb()) / Math.max(1, maxDb() - minDb())) * 100;
  };
  const presentation = createMemo(() =>
    resolveMeterPresentation({
      label: local.label,
      leftValueDb: local.leftValueDb,
      rightValueDb: local.rightValueDb,
      stereo: local.stereo,
      valueDb: local.valueDb,
    }),
  );
  const skinState = createMemo(() => resolveElementSkin(local.skin, { active: false, disabled: false, hovered: false }));
  return (
    <Tooltip content={local.tooltip} placement={local.tooltipPlacement}>
      <div
        {...others}
        class={`${styles.root} ${local.class ?? ""}`.trim()}
        data-orientation={local.orientation ?? "vertical"}
        data-stereo={presentation().stereoEnabled ? "true" : "false"}
      >
        <Show when={local.labelPosition === "top"}>
          <div class={styles.meta}>
            <span class={styles.label}>{local.label ?? ""}</span>
          </div>
        </Show>
        <div class={styles.track}>
          <Show when={skinState()}>
            {(skinItem) => <img class={styles["skin-image"]} src={skinItem().src} alt={skinItem().alt ?? ""} />}
          </Show>
          <div class={styles.channels}>
            <For each={presentation().channels}>
              {(channel) => (
                <div class={styles.channel} data-channel={channel.id}>
                  <div
                    class={styles.fill}
                    style={local.orientation === "horizontal" ? { width: `${fillPercent(channel.valueDb)}%` } : { height: `${fillPercent(channel.valueDb)}%` }}
                  />
                  <div class={styles.segments}>
                    <For each={Array.from({ length: 24 })}>{() => <span class={styles.segment} />}</For>
                  </div>
                  <Show when={presentation().stereoEnabled}>
                    <span class={`${styles["channel-label"]} ${labelTypographyClass}`.trim()}>{channel.label}</span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class={styles.meta}>
          <Show when={!local.labelPosition || local.labelPosition === "bottom"}>
            <span class={styles.label}>{local.label ?? ""}</span>
          </Show>
          <span class={`${styles.readout} ${labelTypographyClass}`.trim()}>{presentation().readout}</span>
        </div>
      </div>
    </Tooltip>
  );
}
