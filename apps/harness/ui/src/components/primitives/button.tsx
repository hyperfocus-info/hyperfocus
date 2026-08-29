import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

type ButtonVariant = "default" | "secondary" | "ghost" | "danger" | "warning";
type ButtonSize = "default" | "sm" | "icon";

/** Returns compiled StyleX classes for the shared button variants. */
export function buttonVariants(options?: { variant?: ButtonVariant; size?: ButtonSize }) {
  const variant = options?.variant ?? "default";
  const size = options?.size ?? "default";
  return stylex.attrs(
    styles.base,
    styles[variant],
    size === "default" && styles.defaultSize,
    size === "sm" && styles.small,
    size === "icon" && styles.icon
  ).class;
}

type ButtonTooltipProps =
  | {
      tooltip: string;
      justificationForNoTooltip?: never;
    }
  | {
      tooltip?: never;
      justificationForNoTooltip: string;
};

type ButtonProps = {
  class?: string;
  as?: "button" | "span";
  tooltipDisabled?: boolean;
  tooltipTriggerClass?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} &
  JSX.IntrinsicElements["button"] &
  ButtonTooltipProps;

const styles = stylex.create({
  base: {
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 0,
    gap: "0.5rem",
    outline: { default: null, ":focus-visible": "none" },
    alignItems: "center",
    boxShadow: { default: null, ":focus-visible": "0 0 0 2px var(--bg), 0 0 0 4px var(--ring)" },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 500,
    justifyContent: "center",
    lineHeight: "1rem",
    opacity: { default: 1, ":disabled": 0.45 },
    pointerEvents: { default: "auto", ":disabled": "none" },
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, box-shadow",
    whiteSpace: "nowrap",
  },
  default: {
    backgroundColor: {
      default: "var(--accent)",
      ":hover": "var(--accent-strong)"
    },
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "white"
  },
  secondary: {
    borderColor: "var(--border)",
    borderWidth: "1px",
    backgroundColor: {
      default: "var(--panel-strong)",
      ":hover": "var(--panel)"
    },
    color: "var(--foreground)",
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--panel-strong)"
    },
    color: "var(--foreground)"
  },
  danger: {
    backgroundColor: {
      default: "var(--danger)",
      ":hover": "var(--danger-strong)"
    },
    color: "white"
  },
  warning: {
    backgroundColor: {
      default: "var(--warning)",
      ":hover": "var(--warning-strong)"
    },
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "white"
  },
  defaultSize: {
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
    height: "2.25rem",
  },
  small: {
    borderRadius: "0.5rem",
    paddingInline: "0.75rem",
    height: "2rem",
  },
  icon: {
    height: "2.25rem",
    width: "2.25rem"
  }
});

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "as",
    "variant",
    "size",
    "children",
    "tooltip",
    "tooltipDisabled",
    "tooltipTriggerClass",
    "justificationForNoTooltip"
  ]);
  const component = () => local.as ?? "button";

  return (
    <Tooltip content={local.tooltip} disabled={local.tooltipDisabled} triggerClass={local.tooltipTriggerClass}>
      <Dynamic
        component={component()}
        {...rest}
        data-test-button=""
        class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
        type={local.as === "span" ? undefined : props.type ?? "button"}
      >
        {local.children}
      </Dynamic>
    </Tooltip>
  );
}
