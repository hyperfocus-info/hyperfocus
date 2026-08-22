import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

export function Input(props: JSX.IntrinsicElements["input"]) {
  return (
    <input
      {...props}
      data-test-input=""
      class={cn(stylex.attrs(styles.root).class, props.class)}
    />
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: "rgb(255 255 255 / 0.7)",
    borderColor: "var(--border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: { default: "0 1px 2px rgb(0 0 0 / 0.05)", ":focus": "0 0 0 2px var(--ring)" },
    color: "var(--foreground)",
    display: "flex",
    fontSize: "0.75rem",
    height: "2.25rem",
    cursor: { default: "text", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.5 },
    outline: "none",
    padding: "0.5rem 0.75rem",
    transitionProperty: "color, background-color, border-color, box-shadow",
    transitionDuration: "150ms",
    width: "100%"
  }
});
