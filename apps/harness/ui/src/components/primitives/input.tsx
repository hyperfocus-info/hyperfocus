import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

const styles = stylex.create({
  root: {
    borderColor: { default: "var(--border)", ":hover": "var(--ring)", ":focus": "var(--accent)" },
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: "1px",
    outline: "none",
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
    backgroundColor: "var(--panel-strong)",
    boxShadow: { default: "inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent)", ":focus": "0 0 0 2px var(--bg), 0 0 0 4px var(--ring)" },
    color: "var(--foreground)",
    cursor: { default: "text", ":disabled": "not-allowed" },
    display: "flex",
    fontSize: "0.75rem",
    opacity: { default: 1, ":disabled": 0.5 },
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, box-shadow",
    height: "2.5rem",
    width: "100%",
  }
});

export function Input(props: JSX.IntrinsicElements["input"]) {
  return (
    <input
      {...props}
      data-test-input=""
      class={cn(stylex.attrs(styles.root).class, props.class)}
    />
  );
}
