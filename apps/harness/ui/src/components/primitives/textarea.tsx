/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { cn } from "../../lib/utils";

const styles = stylex.create({
  root: {
    borderColor: "var(--border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: "1px",
    outline: "none",
    paddingBlock: '0.625rem',
    paddingInline: '0.75rem',
    backgroundColor: "var(--panel)",
    boxShadow: { default: "0 1px 2px rgb(0 0 0 / 0.05)", ":focus-visible": "0 0 0 2px var(--ring)" },
    boxSizing: "border-box",
    color: "var(--foreground)",
    cursor: { default: "text", ":disabled": "not-allowed" },
    display: "flex",
    fontSize: tokens.fontControl,
    opacity: { default: 1, ":disabled": 0.5 },
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, box-shadow",
    maxWidth: "100%",
    minHeight: "4.2rem",
    minWidth: 0,
    width: "100%",
    "::placeholder": { color: "var(--muted)", opacity: 1 },
  }
});

export function Textarea(props: JSX.IntrinsicElements["textarea"]) {
  return (
    <textarea
      {...props}
      data-test-textarea=""
      class={cn(stylex.attrs(styles.root).class, props.class)}
    />
  );
}
