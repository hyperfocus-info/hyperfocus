import { Tooltip as SharedTooltip } from "@hyperfocus/ui/primitives";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import type { JSX } from "solid-js";
import { getPrimitivePortalRoot } from "./primitive-portal";

type TooltipProps = {
  content?: string;
  triggerClass?: string;
  children: JSX.Element;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
};
const styles = stylex.create({
  content: {
    borderColor: "var(--border)", borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: tokens.borderWidth,
    paddingBlock: tokens.space1, paddingInline: tokens.space3, backgroundColor: "var(--foreground)",
    boxShadow: tokens.shadow, color: "var(--surface-foreground)", textAlign: "center", whiteSpace: "pre-line",
  },
});

/** Harness keeps its inverse skin and outlet; generic interaction belongs to shared UI. */
export function Tooltip(props: TooltipProps) {
  return <SharedTooltip content={props.content} disabled={props.disabled} placement={props.side ?? "top"} delay={0}
    class={props.triggerClass} contentClass={stylex.attrs(styles.content).class} mount={() => getPrimitivePortalRoot("tooltip")}>
    {props.children}
  </SharedTooltip>;
}
