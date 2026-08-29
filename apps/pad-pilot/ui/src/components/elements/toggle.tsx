import * as stylex from "@stylexjs/stylex";
import { JSX, Show, createMemo, createSignal, splitProps } from "solid-js";
import { Tooltip } from "./tooltip";
import { type ElementSkin, resolveElementSkin, type TooltipPlacement } from "./element-skin";
import { controlStyles as styles } from "./controls.stylex";

/**
 * Props for Toggle.
 */
export type ToggleProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
  /** Current pressed state. */
  value: boolean;
  /** Optional label shown above the toggle button. */
  label?: string;
  /** Optional icon rendered inside the toggle. */
  icon?: JSX.Element;
  /** Callback fired when the pressed state changes. */
  onChange: (next: boolean) => void;
  /** Optional tooltip text shown on hover or focus. */
  tooltip?: string;
  /** Preferred tooltip placement relative to the toggle. */
  tooltipPlacement?: TooltipPlacement;
  /** Optional state-based image skin for the toggle. */
  skin?: ElementSkin;
};

/** Toggle renders a button-based boolean control with forwarded host props. */
export function Toggle(props: ToggleProps) {
  const callHandler = (handler: unknown, event: Event) => {
    if (typeof handler === "function") {
      (handler as (value: Event) => void)(event);
    }
  };
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "disabled",
    "icon",
    "label",
    "onChange",
    "skin",
    "tooltip",
    "tooltipPlacement",
    "value",
  ]);
  const [hovered, setHovered] = createSignal(false);
  const [active, setActive] = createSignal(false);
  const skinState = createMemo(() =>
    resolveElementSkin(local.skin, {
      active: active() || local.value,
      disabled: local.disabled ?? false,
      hovered: hovered(),
    }),
  );

  return (
    <label {...stylex.attrs(styles.label)}>
      <span>{local.label ?? ""}</span>
      <Tooltip content={local.tooltip} placement={local.tooltipPlacement}>
        <button
          {...others}
          type={others.type ?? "button"}
          disabled={local.disabled}
          {...stylex.attrs(
            styles.button,
            styles.buttonInline,
            styles.toggle,
            !local.disabled && styles.buttonInteractive,
            local.value && styles.toggleOn,
            local.disabled && styles.buttonDisabled,
          )}
          classList={{ [local.class ?? ""]: Boolean(local.class) }}
          aria-label={(others["aria-label"] as string | undefined) ?? local.label ?? local.tooltip}
          aria-pressed={local.value}
          onClick={(event) => {
            local.onChange(!local.value);
            callHandler(others.onClick, event);
          }}
          onPointerEnter={(event) => {
            setHovered(true);
            callHandler(others.onPointerEnter, event);
          }}
          onPointerLeave={(event) => {
            setHovered(false);
            setActive(false);
            callHandler(others.onPointerLeave, event);
          }}
          onPointerDown={(event) => {
            setActive(true);
            callHandler(others.onPointerDown, event);
          }}
          onPointerUp={(event) => {
            setActive(false);
            callHandler(others.onPointerUp, event);
          }}
          onPointerCancel={(event) => {
            setActive(false);
            callHandler(others.onPointerCancel, event);
          }}
          onBlur={(event) => {
            setHovered(false);
            setActive(false);
            callHandler(others.onBlur, event);
          }}
        >
          <Show when={skinState()}>
            {(skinItem) => <img {...stylex.attrs(styles.skinImage)} src={skinItem().src} alt={skinItem().alt ?? ""} />}
          </Show>
          <Show when={local.icon}>
            <span {...stylex.attrs(styles.buttonIcon, local.disabled && styles.disabledContent)}>{local.icon}</span>
          </Show>
          <span {...stylex.attrs(styles.buttonLabel, local.disabled && styles.disabledContent)}>{local.children ?? (local.value ? "On" : "Off")}</span>
        </button>
      </Tooltip>
    </label>
  );
}
