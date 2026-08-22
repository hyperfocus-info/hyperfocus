import * as stylex from "@stylexjs/stylex";
import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { Tooltip } from "./tooltip";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "icon";
  tooltip?: string;
  as?: "button" | "span";
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "tooltip", "as", "children", "class"]);
  const button = (
    <Dynamic
      component={local.as ?? "button"}
      {...rest}
      {...stylex.attrs(
        styles.root,
        sharedStyles.focusRing,
        styles[local.variant ?? "primary"],
        styles[local.size ?? "medium"]
      )}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      type={local.as === "span" ? undefined : props.type ?? "button"}
      data-test-button=""
    >
      {local.children}
    </Dynamic>
  );
  return local.tooltip ? <Tooltip content={local.tooltip}>{button}</Tooltip> : button;
}

const styles = stylex.create({
  root: {
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "0.5rem",
    transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
    alignItems: "center",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    fontFamily: "inherit",
    fontWeight: 650,
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.48 },
  },
  primary: {
    borderColor: "transparent",
    backgroundColor: { default: tokens.accent, ":hover": tokens.accentStrong },
    color: "#03100f",
  },
  secondary: {
    borderColor: tokens.border,
    backgroundColor: { default: tokens.panelRaised, ":hover": "#18323a" },
    color: tokens.foreground,
  },
  ghost: {
    borderColor: "transparent",
    backgroundColor: { default: "transparent", ":hover": tokens.panelRaised },
    color: tokens.foreground,
  },
  danger: {
    borderColor: "transparent",
    backgroundColor: { default: tokens.danger, ":hover": "#da4559" },
    color: "#160408",
  },
  small: { borderRadius: "7px", paddingBlock: "0.35rem", paddingInline: "0.65rem", fontSize: "0.75rem", minHeight: "1.9rem", },
  medium: { borderRadius: tokens.radius, paddingBlock: "0.5rem", paddingInline: "0.85rem", fontSize: "0.8rem", minHeight: "2.35rem", },
  icon: { padding: 0, borderRadius: "8px", height: "2.25rem", width: "2.25rem", }
});

