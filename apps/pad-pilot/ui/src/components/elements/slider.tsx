import { Show, createMemo, createSignal, onCleanup, splitProps, type JSX } from "solid-js";
import { Tooltip } from "./tooltip";
import { type ElementSkin, resolveElementSkin, type TooltipPlacement } from "./element-skin";
import { clamp } from "../../utils/math";
import styles from "./styles/slider.stylex";

/**
 * Props for Slider.
 */
export type SliderProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  classNames?: {
    fill?: string;
    label?: string;
    root?: string;
    thumb?: string;
    tooltip?: string;
  };
  /** Minimum slider value. */
  min: number;
  /** Maximum slider value. */
  max: number;
  /** Current slider value. */
  value: number;
  /** Callback fired when slider value changes. */
  onChange: (next: number) => void;
  /** Callback fired once pointer interaction is committed. */
  onCommit?: (next: number) => void;
  /** Optional label shown below the slider. */
  label?: string;
  /** Orientation of the slider track. */
  orientation?: "vertical" | "horizontal";
  /** Optional slider track height in pixels. */
  height?: number;
  /** Optional slider track width in pixels. */
  width?: number;
  /** Optional step size for keyboard and wheel interaction. */
  step?: number;
  /** Optional wheel step override. */
  wheelStep?: number;
  /** Drag, keyboard, and wheel sensitivity multiplier while Shift is held. */
  fineDragMultiplier?: number;
  /** Optional discrete values that pointer, keyboard, and wheel edits snap to. */
  snapValues?: readonly number[];
  /** Optional tooltip text shown on hover or focus. */
  tooltip?: string;
  /** Preferred tooltip placement relative to the slider. */
  tooltipPlacement?: TooltipPlacement;
  /** Optional state-based image skin for the slider. */
  skin?: ElementSkin;
  /** Disables pointer/keyboard edits. */
  disabled?: boolean;
};

/** Slider renders a pointer-draggable linear control. */
export function Slider(props: SliderProps) {
  const callHandler = (handler: unknown, event: Event) => {
    if (typeof handler === "function") {
      (handler as (value: Event) => void)(event);
    }
  };
  const [local, others] = splitProps(props, [
    "classNames",
    "class",
    "disabled",
    "height",
    "label",
    "max",
    "min",
    "onChange",
    "onCommit",
    "orientation",
    "skin",
    "fineDragMultiplier",
    "tooltip",
    "tooltipPlacement",
    "snapValues",
    "step",
    "value",
    "wheelStep",
    "width",
  ]);
  let trackRef: HTMLDivElement | undefined;
  let endPointerInteraction: (() => void) | undefined;
  const [hovered, setHovered] = createSignal(false);
  const [active, setActive] = createSignal(false);
  const orientation = () => local.orientation ?? "vertical";

  const normalized = createMemo(() => {
    const range = local.max - local.min;
    if (range <= 0) return 0;
    return clamp((local.value - local.min) / range, 0, 1);
  });
  const skinState = createMemo(() =>
    resolveElementSkin(local.skin, { active: active(), disabled: local.disabled ?? false, hovered: hovered() }),
  );
  const snapValues = createMemo(() =>
    [...(local.snapValues ?? [])]
      .filter((value) => Number.isFinite(value) && value >= local.min && value <= local.max)
      .sort((left, right) => left - right),
  );
  const fineMultiplier = () => local.fineDragMultiplier ?? 0.2;
  const baseStep = () => local.step ?? Math.max((local.max - local.min) / 100, 0.01);
  const wheelStep = () => local.wheelStep ?? baseStep();

  const nearestSnapIndex = (value: number) => {
    const values = snapValues();
    if (values.length === 0) return -1;
    let nearestIndex = 0;
    let nearestDistance = Math.abs(values[0]! - value);
    for (let index = 1; index < values.length; index += 1) {
      const distance = Math.abs(values[index]! - value);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    return nearestIndex;
  };

  const normalizeValue = (value: number) => {
    const clamped = clamp(value, local.min, local.max);
    const values = snapValues();
    if (values.length === 0) {
      return clamped;
    }
    return values[nearestSnapIndex(clamped)] ?? clamped;
  };

  const stepSnappedValue = (direction: number) => {
    const values = snapValues();
    if (values.length === 0 || direction === 0) {
      return normalizeValue(local.value);
    }
    const currentIndex = nearestSnapIndex(local.value);
    return values[clamp(currentIndex + direction, 0, values.length - 1)] ?? normalizeValue(local.value);
  };

  const changeValue = (value: number) => {
    const next = normalizeValue(value);
    local.onChange(next);
    return next;
  };

  const commitValue = (value: number) => {
    const next = normalizeValue(value);
    local.onChange(next);
    local.onCommit?.(next);
  };

  const sliderValueFromClient = (clientX: number, clientY: number) => {
    if (!trackRef) return local.value;
    const rect = trackRef.getBoundingClientRect();
    const isVertical = orientation() === "vertical";
    const axisSize = isVertical ? rect.height : rect.width;
    if (axisSize <= 0) return local.value;

    const fromStart = isVertical ? rect.bottom - clientY : clientX - rect.left;
    const ratio = clamp(fromStart / axisSize, 0, 1);
    return local.min + ratio * (local.max - local.min);
  };

  const sliderValueFromDelta = (startValue: number, startX: number, startY: number, clientX: number, clientY: number, scale: number) => {
    if (!trackRef) return startValue;
    const rect = trackRef.getBoundingClientRect();
    const isVertical = orientation() === "vertical";
    const axisSize = isVertical ? rect.height : rect.width;
    if (axisSize <= 0) return startValue;

    const pixelDelta = isVertical ? startY - clientY : clientX - startX;
    const ratioDelta = pixelDelta / axisSize;
    return startValue + ratioDelta * (local.max - local.min) * scale;
  };

  const stepValue = (step: number) => {
    const values = snapValues();
    if (values.length > 0) {
      commitValue(stepSnappedValue(step > 0 ? 1 : -1));
      return;
    }
    commitValue(local.value + step);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    callHandler(others.onKeyDown, event);
    if (local.disabled || event.defaultPrevented) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      stepValue(baseStep() * (event.shiftKey ? fineMultiplier() : 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      stepValue(-baseStep() * (event.shiftKey ? fineMultiplier() : 1));
    } else if (event.key === "PageUp") {
      event.preventDefault();
      stepValue((local.max - local.min) * 0.1 * (event.shiftKey ? fineMultiplier() : 1));
    } else if (event.key === "PageDown") {
      event.preventDefault();
      stepValue(-(local.max - local.min) * 0.1 * (event.shiftKey ? fineMultiplier() : 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      commitValue(local.min);
    } else if (event.key === "End") {
      event.preventDefault();
      commitValue(local.max);
    }
  };

  const onWheel = (event: WheelEvent) => {
    callHandler(others.onWheel, event);
    if (local.disabled || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const values = snapValues();
    if (values.length > 0) {
      commitValue(stepSnappedValue(direction));
      return;
    }
    commitValue(local.value + direction * wheelStep() * (event.shiftKey ? fineMultiplier() : 1));
  };

  const onPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    callHandler(others.onPointerDown, event);
    endPointerInteraction?.();
    if (local.disabled) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActive(true);
    const startValue = local.value;
    const startX = event.clientX;
    const startY = event.clientY;
    let lastPointerValue = startValue;
    if (event.shiftKey) {
      lastPointerValue = changeValue(
        sliderValueFromDelta(startValue, startX, startY, event.clientX, event.clientY, fineMultiplier()),
      );
    } else {
      lastPointerValue = changeValue(sliderValueFromClient(event.clientX, event.clientY));
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.shiftKey) {
        lastPointerValue = changeValue(
          sliderValueFromDelta(startValue, startX, startY, moveEvent.clientX, moveEvent.clientY, fineMultiplier()),
        );
        return;
      }
      lastPointerValue = changeValue(sliderValueFromClient(moveEvent.clientX, moveEvent.clientY));
    };
    let ended = false;
    const onEnd = () => {
      if (ended) {
        return;
      }
      ended = true;
      setActive(false);
      local.onCommit?.(lastPointerValue);
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

  onCleanup(() => {
    endPointerInteraction?.();
  });

  return (
    <div class={`${styles.root} ${local.classNames?.root ?? ""}`.trim()}>
      <Tooltip class={local.classNames?.tooltip} content={local.tooltip} placement={local.tooltipPlacement}>
        <div
          {...others}
          ref={trackRef}
          class={`${styles.track} ${orientation() === "vertical" ? styles.vertical : styles.horizontal} ${local.class ?? ""}`.trim()}
          role="slider"
          tabindex={local.disabled ? -1 : 0}
          aria-disabled={local.disabled ? "true" : undefined}
          aria-label={(others["aria-label"] as string | undefined) ?? local.label ?? local.tooltip}
          aria-orientation={orientation()}
          aria-valuemin={local.min}
          aria-valuemax={local.max}
          aria-valuenow={local.value}
          style={{
            "--pp-slider-fill": `${normalized() * 100}%`,
            "--pp-slider-height": `${local.height ?? 168}px`,
            "--pp-slider-width": `${local.width ?? 220}px`,
          }}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          onPointerEnter={(event) => {
            setHovered(true);
            callHandler(others.onPointerEnter, event);
          }}
          onPointerLeave={(event) => {
            setHovered(false);
            setActive(false);
            callHandler(others.onPointerLeave, event);
          }}
        >
          <Show when={skinState()}>
            {(skinItem) => <img class={styles["skin-image"]} src={skinItem().src} alt={skinItem().alt ?? ""} />}
          </Show>
          <span class={`${styles.fill} ${local.classNames?.fill ?? ""}`.trim()} />
          <span class={`${styles.thumb} ${local.classNames?.thumb ?? ""}`.trim()} />
        </div>
      </Tooltip>
      <span class={`${styles.label} ${local.classNames?.label ?? ""}`.trim()}>{local.label ?? ""}</span>
    </div>
  );
}
