import * as stylex from "@stylexjs/stylex";
import { JSX, Show, children, createMemo, createSignal, splitProps } from "solid-js";
import { Tooltip, type TooltipTriggerBindings } from "./tooltip";
import {
  type ElementSkin,
  resolveElementSkin,
  type TooltipPlacement,
} from "./element-skin";
import { controlStyles as styles } from "./controls.stylex";
import { LucideIcon } from "lucide-solid";
import { Dynamic } from "solid-js/web";

/**
 * Props for Button.
 */
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Optional icon rendered before the button label. */
  icon?: JSX.Element | LucideIcon;
  /** Shared visual style for the button. */
  variant?: "primary" | "secondary" | "ghost" | "toolbar" | "danger" | "tab";
  /** Shared sizing token for the button. */
  size?: "sm" | "md" | "lg";
  /** Optional tooltip text shown on hover or focus. */
  tooltip?: string;
  /** Preferred tooltip placement relative to the button. */
  tooltipPlacement?: TooltipPlacement;
  /** Optional state-based image skin for the button. */
  skin?: ElementSkin;
  /** Optional extra class names to add to tooltip anchor wrapper. */
  anchorClass?: string;
  /** Skip shared control chrome and tooltip wrapper for spatial/overlay controls. */
  appearance?: "control" | "unstyled";
};

/** Button renders a reusable PadPilot button with forwarded host props. */
export function Button(props: ButtonProps) {
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
    "size",
    "skin",
    "tooltip",
    "tooltipPlacement",
    "anchorClass",
    "appearance",
    "ref",
    "variant",
  ]);
  const [hovered, setHovered] = createSignal(false);
  const [active, setActive] = createSignal(false);
  const resolvedChildren = children(() => local.children);
  const skinState = createMemo(() =>
    resolveElementSkin(local.skin, {
      active: active(),
      disabled: local.disabled ?? false,
      hovered: hovered(),
    })
  );

  const iconComponent = () =>
    typeof local.icon === "function" ? local.icon : null;
  const iconElement = () =>
    typeof local.icon === "function" ? null : local.icon;
  const iconContent = () => {
    const IconComponent = iconComponent();
    return IconComponent ? <Dynamic component={IconComponent} /> : iconElement();
  };
  const isIconOnly = createMemo(() => {
    const content = resolvedChildren.toArray().filter((value) => value !== null && value !== undefined && value !== "");
    return Boolean(local.icon) && content.length === 0;
  });
  const hasVisibleLabel = createMemo(() => resolvedChildren.toArray().some((value) => value !== null && value !== undefined && value !== ""));
  const hiddenLabel = createMemo(() => {
    if ((hasVisibleLabel() && local.appearance !== "unstyled") || typeof local.tooltip !== "string" || local.tooltip.length === 0) {
      return null;
    }

    return local.tooltip;
  });

  const renderButton = (tooltipTrigger?: TooltipTriggerBindings) => (
    <button
      {...others}
      ref={(element) => {
        tooltipTrigger?.ref(element);
        if (typeof local.ref === "function") {
          local.ref(element);
        }
      }}
      type={others.type ?? "button"}
      disabled={local.disabled}
      class={`${local.appearance === "unstyled" ? "" : stylex.attrs(
        styles.button,
        styles.buttonInline,
        styles[local.variant ?? "secondary"],
        styles[local.size === "sm" ? "sizeSm" : local.size === "lg" ? "sizeLg" : "sizeMd"],
        isIconOnly() && styles.iconOnly,
        !local.disabled && others["aria-disabled"] !== "true" && styles.buttonInteractive,
        (others["aria-pressed"] === true || others["aria-pressed"] === "true" || others["aria-selected"] === true || others["aria-selected"] === "true") && styles.buttonActive,
        (local.disabled || others["aria-disabled"] === "true") && styles.buttonDisabled,
      ).class} ${local.class ?? ""}`.trim()}
      data-appearance={local.appearance ?? "control"}
      data-icon-only={isIconOnly() ? "true" : "false"}
      data-size={local.size ?? "md"}
      data-variant={local.variant ?? "secondary"}
      onMouseEnter={(event) => {
        tooltipTrigger?.onMouseEnter();
        callHandler(others.onMouseEnter, event);
      }}
      onMouseLeave={(event) => {
        tooltipTrigger?.onMouseLeave();
        callHandler(others.onMouseLeave, event);
      }}
      onFocusIn={(event) => {
        tooltipTrigger?.onFocusIn();
        callHandler(others.onFocusIn, event);
      }}
      onFocusOut={(event) => {
        tooltipTrigger?.onFocusOut();
        callHandler(others.onFocusOut, event);
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
        {(skinItem) => (
          <img
            {...stylex.attrs(styles.skinImage)}
            src={skinItem().src}
            alt={skinItem().alt ?? ""}
          />
        )}
      </Show>
      <Show when={local.icon}>
        <span {...stylex.attrs(styles.buttonIcon, (local.disabled || others["aria-disabled"] === "true") && styles.disabledContent)}>
          {iconContent()}
        </span>
      </Show>
      <Show when={hiddenLabel()}>
        {(label) => <span {...stylex.attrs(styles.screenReaderOnly)}>{label()}</span>}
      </Show>
      <Show when={hasVisibleLabel()}>
        <span
          {...stylex.attrs(styles.buttonLabel, (local.disabled || others["aria-disabled"] === "true") && styles.disabledContent)}
          aria-hidden={local.appearance === "unstyled" && hiddenLabel() ? "true" : undefined}
        >
          {resolvedChildren()}
        </span>
      </Show>
    </button>
  );

  if (local.appearance === "unstyled") {
    return <Tooltip content={local.tooltip} placement={local.tooltipPlacement} renderTrigger={renderButton} />;
  }

  return <Tooltip content={local.tooltip} placement={local.tooltipPlacement} class={local.anchorClass}>{renderButton()}</Tooltip>;
}
