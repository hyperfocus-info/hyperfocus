import { JSX, Show, createMemo, createSignal, onCleanup, splitProps } from "solid-js";
import { Tooltip } from "./tooltip";
import { type ElementSkin, resolveElementSkin, type TooltipPlacement } from "./element-skin";
import { clamp } from "../../utils/math";
import styles from "./styles/knob.stylex";
import { labelTypographyClass } from "./styles/element-typography.stylex";

/**
 * Props for Knob.
 */
export type KnobProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
  /** Minimum knob value. */
  min: number;
  /** Maximum knob value. */
  max: number;
  /** Current knob value. */
  value: number;
  /** Fired on every live change during drag, wheel, or key interaction. */
  onChange: (next: number) => void;
  /** Fired once when an interaction is committed. */
  onCommit?: (next: number) => void;
  /** Optional label shown below the knob. */
  label?: string;
  /** Optional preformatted value label. */
  valueLabel?: string;
  /** Optional formatter for the value readout. */
  valueFormatter?: (value: number) => string;
  /** Optional knob diameter in pixels. */
  size?: number;
  /** Optional step size for keyboard and manual input. */
  step?: number;
  /** Optional base color override. */
  baseColor?: string;
  /** Optional accent color override. */
  highlightColor?: string;
  /** Shows a small horizontal value bar above the knob. */
  showValueBar?: boolean;
  /** Optional color override for the value bar. */
  valueBarColor?: string;
  /** Shows min and max labels below the control. */
  showRangeLabels?: boolean;
  /** Hides the numeric readout. */
  hideValue?: boolean;
  /** Default value restored by Alt+Click. */
  defaultValue?: number;
  /** Drag sensitivity multiplier used while Shift is held. */
  fineDragMultiplier?: number;
  /** Enables double-click manual number entry. */
  manualInput?: boolean;
  /** Optional wheel step override. */
  wheelStep?: number;
  /** Optional tooltip text shown on hover or focus. */
  tooltip?: string;
  /** Preferred tooltip placement relative to the knob. */
  tooltipPlacement?: TooltipPlacement;
  /** Optional state-based image skin for the knob. */
  skin?: ElementSkin;
};

const ARC_DEGREES = 270;
const START_DEGREES = -135;
const ArrowKeyMap: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
};

export function knobValueFromDrag(startValue: number, deltaY: number, min: number, max: number, scale = 1) {
  const range = max - min;
  if (range <= 0) return min;
  const deltaValue = (-deltaY / 140) * range * scale;
  return clamp(startValue + deltaValue, min, max);
}

export function knobAngleFromValue(value: number, min: number, max: number) {
  const range = max - min;
  if (range <= 0) return START_DEGREES;
  const normalized = clamp((value - min) / range, 0, 1);
  return START_DEGREES + normalized * ARC_DEGREES;
}

/** Knob renders a pointer-driven rotary control with commit-aware interactions. */
export function Knob(props: KnobProps) {
  const callHandler = (handler: unknown, event: Event) => {
    if (typeof handler === "function") {
      handler(event);
    }
  };
  const [local, others] = splitProps(props, [
    "baseColor",
    "class",
    "defaultValue",
    "disabled",
    "fineDragMultiplier",
    "hideValue",
    "highlightColor",
    "label",
    "manualInput",
    "max",
    "min",
    "onChange",
    "onCommit",
    "showRangeLabels",
    "showValueBar",
    "size",
    "skin",
    "step",
    "tooltip",
    "tooltipPlacement",
    "value",
    "valueBarColor",
    "valueFormatter",
    "valueLabel",
    "wheelStep",
  ]);
  const [dragging, setDragging] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [liveValue, setLiveValue] = createSignal<number | null>(null);
  const [inputValue, setInputValue] = createSignal("");
  const [hovered, setHovered] = createSignal(false);
  let endPointerInteraction: (() => void) | undefined;

  const effectiveValue = createMemo(() => liveValue() ?? local.value);
  const normalized = createMemo(() => {
    const range = local.max - local.min;
    if (range <= 0) return 0;
    return clamp((effectiveValue() - local.min) / range, 0, 1);
  });
  const angle = createMemo(() => knobAngleFromValue(effectiveValue(), local.min, local.max));
  const fill = createMemo(() => normalized() * ARC_DEGREES);
  const currentValueText = createMemo(() => {
    if (local.valueLabel) return local.valueLabel;
    if (local.valueFormatter) return local.valueFormatter(effectiveValue());
    const value = effectiveValue();
    if (Math.abs(value) >= 100 || Number.isInteger(value)) return `${Math.round(value)}`;
    return value.toFixed(2);
  });
  const skinState = createMemo(() =>
    resolveElementSkin(local.skin, {
      active: dragging(),
      disabled: local.disabled ?? false,
      hovered: hovered(),
    }),
  );

  const commitValue = (next: number) => {
    const clamped = clamp(next, local.min, local.max);
    setLiveValue(clamped);
    local.onChange(clamped);
    local.onCommit?.(clamped);
  };

  const updateLiveValue = (next: number) => {
    const clamped = clamp(next, local.min, local.max);
    setLiveValue(clamped);
    local.onChange(clamped);
  };

  const endDrag = () => {
    const current = liveValue();
    if (current !== null) {
      local.onCommit?.(current);
    }
    setDragging(false);
    setLiveValue(null);
  };

  const startManualInput = () => {
    if (local.manualInput === false || local.disabled) {
      return;
    }
    setInputValue(String(local.value));
    setEditing(true);
  };

  const resetToDefault = () => {
    if (typeof local.defaultValue !== "number" || local.disabled) {
      return;
    }
    commitValue(local.defaultValue);
  };

  onCleanup(() => {
    endPointerInteraction?.();
  });

  const onPointerDown = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    callHandler(others.onPointerDown, event);
    endPointerInteraction?.();
    if (local.disabled) {
      return;
    }

    if (event.altKey) {
      event.preventDefault();
      resetToDefault();
      return;
    }

    if (editing()) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setLiveValue(local.value);

    const startY = event.clientY;
    const startValue = local.value;

    const onMove = (moveEvent: PointerEvent) => {
      const scale = moveEvent.shiftKey ? local.fineDragMultiplier ?? 0.2 : 1;
      const next = knobValueFromDrag(startValue, moveEvent.clientY - startY, local.min, local.max, scale);
      updateLiveValue(next);
    };

    let ended = false;
    const onEnd = () => {
      if (ended) {
        return;
      }
      ended = true;
      endDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      if (endPointerInteraction === onEnd) {
        endPointerInteraction = undefined;
      }
    };

    endPointerInteraction = onEnd;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const step = () => local.step ?? Math.max((local.max - local.min) / 100, 0.01);
  const wheelStep = () => local.wheelStep ?? step();

  const onKeyDown: JSX.EventHandlerUnion<HTMLButtonElement, KeyboardEvent> = (event) => {
    callHandler(others.onKeyDown, event);
    const direction = ArrowKeyMap[event.key];
    if (!direction || local.disabled) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? local.fineDragMultiplier ?? 0.2 : 1;
    const current = effectiveValue();
    const next = clamp(current + direction * step() * multiplier, local.min, local.max);
    if (next !== current) {
      commitValue(next);
    }
  };

  const onWheel: JSX.EventHandlerUnion<HTMLButtonElement, WheelEvent> = (event) => {
    callHandler(others.onWheel, event);
    if (local.disabled) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const multiplier = event.shiftKey ? local.fineDragMultiplier ?? 0.2 : 1;
    const next = effectiveValue() + direction * wheelStep() * multiplier;
    commitValue(next);
  };

  const style = () => {
    const val: Record<string, string> = {
      "--pp-knob-size": `${local.size ?? 48}px`,
      "--pp-base-ui": local.baseColor ?? "var(--pp-base-bg)",
      "--pp-knob-fill": `${fill()}deg`,
      "--pp-knob-angle": `${angle()}deg`,
      "--pp-knob-value-bar": local.valueBarColor ?? local.highlightColor ?? "var(--pp-accent-color)",
    };
    if (local.highlightColor) {
      val["--pp-accent-color"] = local.highlightColor;
    }
    return val;
  };

  const commitInput = () => {
    const parsed = Number.parseFloat(inputValue());
    if (Number.isNaN(parsed)) {
      setEditing(false);
      setLiveValue(null);
      return;
    }
    commitValue(parsed);
    setEditing(false);
    setLiveValue(null);
  };

  return (
    <div class={styles.root}>
      <Show
        when={!editing()}
        fallback={
          <input
            class={styles["value-input"]}
            type="number"
            min={local.min}
            max={local.max}
            step={local.step ?? 0.01}
            value={inputValue()}
            onInput={(event) => setInputValue(event.currentTarget.value)}
            onBlur={commitInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitInput();
              }
              if (event.key === "Escape") {
                setEditing(false);
                setLiveValue(null);
              }
            }}
            autofocus
          />
        }
      >
        <Tooltip content={local.tooltip} placement={local.tooltipPlacement}>
          <button
            {...others}
            type={others.type ?? "button"}
            disabled={local.disabled}
            class={`${styles.shell} ${dragging() ? styles["shell-dragging"] : ""} ${local.showValueBar ? styles["shell-with-track"] : ""} ${local.class ?? ""}`.trim()}
            role="slider"
            aria-label={(others["aria-label"]) ?? local.label ?? local.tooltip}
            aria-valuemin={local.min}
            aria-valuemax={local.max}
            aria-valuenow={effectiveValue()}
            data-angle={angle().toFixed(2)}
            style={{ ...style(), ...(typeof others.style === "object" ? others.style : undefined) }}
            onBlur={(event) => {
              setHovered(false);
              setDragging(false);
              callHandler(others.onBlur, event);
            }}
            onDblClick={(event) => {
              startManualInput();
              callHandler(others.onDblClick, event);
            }}
            onFocus={(event) => {
              setHovered(true);
              callHandler(others.onFocus, event);
            }}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerEnter={(event) => {
              setHovered(true);
              callHandler(others.onPointerEnter, event);
            }}
            onPointerLeave={(event) => {
              setHovered(false);
              callHandler(others.onPointerLeave, event);
            }}
            onWheel={onWheel}
          >
            <Show when={skinState()}>
              {(skinItem) => <img class={styles["skin-image"]} src={skinItem().src} alt={skinItem().alt ?? ""} />}
            </Show>
            <Show when={local.showValueBar}>
              <span class={styles["value-bar-track"]}>
                <span class={styles["value-bar-fill"]} style={{ width: `${normalized() * 100}%` }} />
              </span>
            </Show>
            <span class={styles.face}>
              <span class={styles.indicator} />
            </span>
          </button>
        </Tooltip>
      </Show>
      <span class={styles.label}>{local.label ?? ""}</span>
      <Show when={!local.hideValue}>
        <span class={`${styles["value-readout"]} ${labelTypographyClass}`.trim()}>{currentValueText()}</span>
      </Show>
      <Show when={local.showRangeLabels}>
        <div class={styles["range-labels"]}>
          <span class={`${styles["value-label"]} ${labelTypographyClass}`.trim()}>{local.min}</span>
          <span class={`${styles["value-label"]} ${labelTypographyClass}`.trim()}>{local.max}</span>
        </div>
      </Show>
    </div>
  );
}
