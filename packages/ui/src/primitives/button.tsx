import * as stylex from "@stylexjs/stylex";
import { createContext, splitProps, useContext, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { typography } from "../theme/typography";
import { Tooltip, type TooltipPlacement } from "./tooltip";

type ButtonTooltipProps =
  | { tooltip: string; justificationForNoTooltip?: never }
  | { tooltip?: never; justificationForNoTooltip: string };

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & ButtonTooltipProps & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "icon";
  shape?: "circle";
  tooltip?: string;
  tooltipPlacement?: TooltipPlacement;
  tooltipDisabled?: boolean;
  as?: "button" | "span";
};

let tooltipSequence = 0;
const actionPriority = createContext<() => boolean>(() => true);

const styles = stylex.create({
  root: {
    borderStyle: "solid",
    borderWidth: tokens.borderWidth,
    gap: tokens.space2,
    transition: {
      default: `background-color ${tokens.motionFast} ease, border-color ${tokens.motionFast} ease, color ${tokens.motionFast} ease`,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    alignItems: "center",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    opacity: { default: "var(--hf-contextual-opacity, 1)", ":is(:disabled, [aria-disabled='true'])": "calc(var(--hf-contextual-opacity, 1) * 0.48)" },
    overflowWrap: "anywhere",
    textAlign: "center",
    maxWidth: "100%",
    minWidth: 0,
  },
  primary: {
    borderColor: "transparent",
    backgroundColor: { default: tokens.accent, ":hover:not(:disabled):not([aria-disabled='true'])": tokens.accentStrong },
    color: tokens.accentForeground,
  },
  secondary: {
    borderColor: tokens.border,
    backgroundColor: { default: tokens.panelRaised, ":hover:not(:disabled):not([aria-disabled='true'])": tokens.selection },
    color: tokens.foreground,
  },
  ghost: {
    borderColor: "transparent",
    backgroundColor: { default: "transparent", ":hover:not(:disabled):not([aria-disabled='true'])": tokens.selection },
    color: tokens.foreground,
  },
  danger: {
    borderColor: "transparent",
    backgroundColor: {
      default: tokens.danger,
      ":hover:not(:disabled):not([aria-disabled='true'])": `color-mix(in srgb, ${tokens.danger} 88%, ${tokens.foreground})`,
    },
    color: tokens.dangerForeground,
  },
  small: {
    borderRadius: tokens.radiusSmall,
    paddingBlock: tokens.space1,
    paddingInline: tokens.space2,
    minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
  },
  medium: {
    borderRadius: tokens.radiusSmall,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space3,
    minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch },
  },
  circle: { borderRadius: "50%" },
  icon: {
    padding: 0,
    borderRadius: tokens.radiusSmall,
    flexShrink: 0,
    height: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch },
    width: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch },
  }
});

/** A supporting pane keeps its commands available without competing with the active task. */
export function PrimaryActionScope(props: { active: boolean; children: JSX.Element }) {
  return <actionPriority.Provider value={() => props.active}>{props.children}</actionPriority.Provider>;
}

export function Button(props: ButtonProps) {
  const primaryActive = useContext(actionPriority);
  const tooltipId = `hf-tooltip-${++tooltipSequence}`;
  const [local, rest] = splitProps(props, ["variant", "size", "shape", "tooltip", "tooltipPlacement", "tooltipDisabled", "justificationForNoTooltip", "as", "children", "class"]);
  const button = (
    <Dynamic
      component={local.as ?? "button"}
      {...rest}
      {...stylex.attrs(
        styles.root,
        typography.control,
        sharedStyles.focusRing,
        styles[local.variant === "primary" && !primaryActive() ? "secondary" : local.variant ?? "secondary"],
        styles[local.size ?? "medium"],
        local.shape === "circle" && styles.circle
      )}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      type={local.as === "span" ? undefined : props.type ?? "button"}
      data-test-button=""
      data-ui-primary={local.variant === "primary" && primaryActive() ? "" : undefined}
    >
      {local.children}
    </Dynamic>
  );
  return local.tooltip ? <Tooltip class={local.size === "icon" ? stylex.attrs(styles.icon).class : undefined} id={tooltipId} content={local.tooltip} placement={local.tooltipPlacement} disabled={local.tooltipDisabled}>{button}</Tooltip> : button;
}

/** Hosts supply home navigation so drafts and unsaved-change guards stay local. */
export function HomeButton(props: { name: string; onClick: () => void; children: JSX.Element; class?: string }) {
  return <Button variant="ghost" aria-label={`${props.name} home`} data-ui-home="" class={props.class}
    justificationForNoTooltip="The visible brand identifies the home control." onClick={props.onClick}>
    {props.children}
  </Button>;
}
