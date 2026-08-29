/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
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
    backgroundColor: "rgb(255 255 255 / 0.7)",
    boxShadow: { default: "0 1px 2px rgb(0 0 0 / 0.05)", ":focus-visible": "0 0 0 2px var(--ring)" },
    color: "var(--foreground)",
    cursor: { default: "text", ":disabled": "not-allowed" },
    display: "flex",
    fontSize: "0.75rem",
    opacity: { default: 1, ":disabled": 0.5 },
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, box-shadow",
    minHeight: "4.2rem",
    width: "100%",
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
