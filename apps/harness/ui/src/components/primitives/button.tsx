import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

type ButtonVariant = "default" | "secondary" | "ghost" | "danger" | "warning";
type ButtonSize = "default" | "sm" | "icon";

/** Returns compiled StyleX classes for the shared button variants. */
export function buttonVariants(options?: { variant?: ButtonVariant; size?: ButtonSize }) {
  const variant = options?.variant ?? "secondary";
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
    cursor: "pointer",
    display: "inline-flex",
    fontSize: tokens.fontControl,
    fontWeight: 500,
    justifyContent: "center",
    lineHeight: 1.4,
    opacity: { default: 1, ":disabled": 0.45 },
    overflowWrap: "anywhere",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, box-shadow",
    whiteSpace: "normal",
    maxWidth: "100%",
    minWidth: 0,
  },
  default: {
    backgroundColor: {
      default: "var(--accent)",
      ":hover:not(:disabled):not([aria-disabled='true'])": "var(--accent-strong)"
    },
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "var(--accent-foreground)"
  },
  secondary: {
    borderColor: "var(--border)",
    borderWidth: "1px",
    backgroundColor: {
      default: "var(--panel-strong)",
      ":hover:not(:disabled):not([aria-disabled='true'])": "var(--panel)"
    },
    color: "var(--foreground)",
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover:not(:disabled):not([aria-disabled='true'])": "var(--panel-strong)"
    },
    color: "var(--foreground)"
  },
  danger: {
    backgroundColor: {
      default: "var(--danger)",
      ":hover:not(:disabled):not([aria-disabled='true'])": "var(--danger-strong)"
    },
    color: "var(--danger-foreground)"
  },
  warning: {
    backgroundColor: {
      default: "var(--warning)",
      ":hover:not(:disabled):not([aria-disabled='true'])": "var(--warning-strong)"
    },
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "var(--warning-foreground)"
  },
  defaultSize: {
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
    minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch },
  },
  small: {
    borderRadius: "0.5rem",
    paddingInline: "0.75rem",
    minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
  },
  icon: {
    minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch },
    minWidth: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch }
  },
  iconTrigger: { flexShrink: 0 },
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
    <Tooltip content={local.tooltip} disabled={local.tooltipDisabled} triggerClass={cn(local.tooltipTriggerClass, local.size === "icon" && stylex.attrs(styles.iconTrigger).class)}>
      <Dynamic
        component={component()}
        {...rest}
        data-test-button=""
        data-ui-primary={local.variant === "default" ? "" : undefined}
        class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
        type={local.as === "span" ? undefined : props.type ?? "button"}
      >
        {local.children}
      </Dynamic>
    </Tooltip>
  );
}
