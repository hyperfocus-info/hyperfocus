/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

export function Textarea(props: JSX.IntrinsicElements["textarea"]) {
  return (
    <textarea
      {...props}
      data-test-textarea=""
      class={cn(stylex.attrs(styles.root).class, props.class)}
    />
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: "rgb(255 255 255 / 0.7)",
    borderColor: "var(--border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: { default: "0 1px 2px rgb(0 0 0 / 0.05)", ":focus-visible": "0 0 0 2px var(--ring)" },
    color: "var(--foreground)",
    display: "flex",
    fontSize: "0.75rem",
    minHeight: "4.2rem",
    cursor: { default: "text", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.5 },
    outline: "none",
    padding: "0.625rem 0.75rem",
    transitionProperty: "color, background-color, border-color, box-shadow",
    transitionDuration: "150ms",
    width: "100%"
  }
});
