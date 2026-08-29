import * as stylex from "@stylexjs/stylex";
import { Show, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { Tooltip } from "./tooltip";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const styles = stylex.create({
  root: {
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "0.35rem",
    paddingInline: "0.5rem",
    alignItems: "center",
    display: "inline-flex",
    fontFamily: tokens.fontMono,
    fontSize: "0.68rem",
    fontVariantNumeric: tokens.numericVariant,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    minHeight: "1.5rem",
  },
  dot: { borderRadius: "50%", backgroundColor: "currentColor", height: "0.4rem", width: "0.4rem", },
  neutral: { borderColor: tokens.border, backgroundColor: tokens.panelRaised, color: tokens.muted, },
  info: { borderColor: tokens.info, backgroundColor: tokens.selection, color: tokens.info, },
  success: { borderColor: tokens.success, backgroundColor: tokens.selection, color: tokens.success, },
  warning: { borderColor: tokens.warning, backgroundColor: tokens.selection, color: tokens.warning, },
  danger: { borderColor: tokens.danger, backgroundColor: tokens.selection, color: tokens.danger, },
});

export function StatusChip(props: { tone?: StatusTone; children: JSX.Element; dot?: boolean; tooltip?: string }) {
  const chip = (
    <span {...stylex.attrs(styles.root, styles[props.tone ?? "neutral"])} data-status-tone={props.tone ?? "neutral"}>
      <Show when={props.dot}><span {...stylex.attrs(styles.dot)} aria-hidden="true" /></Show>
      {props.children}
    </span>
  );
  return props.tooltip ? <Tooltip content={props.tooltip}>{chip}</Tooltip> : chip;
}
