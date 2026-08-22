import type { JSX } from "solid-js";
import { Check } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

export function Checkbox(props: {
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  class?: string;
}) {
  const inputId = `checkbox-${props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const handleChange: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    props.onChange(event.currentTarget.checked);
  };

  return (
    <label
      class={cn(
        stylex.attrs(styles.root, props.disabled && styles.disabled).class,
        props.class
      )}
      for={inputId}
    >
      <span {...stylex.attrs(styles.control)}>
        <input
          id={inputId}
          type="checkbox"
          {...stylex.attrs(styles.input)}
          checked={props.checked}
          disabled={props.disabled}
          onChange={handleChange}
        />
        {props.checked && <Check {...stylex.attrs(styles.check)} aria-hidden="true" />}
      </span>
      <span {...stylex.attrs(styles.copy)}>
        <span {...stylex.attrs(styles.label)}>{props.label}</span>
        {props.description && <span {...stylex.attrs(styles.description)}>{props.description}</span>}
      </span>
    </label>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    color: "var(--muted)",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: "0.68rem",
    gap: "0.5rem"
  },
  disabled: { cursor: "not-allowed", opacity: 0.6 },
  control: {
    alignItems: "center",
    backgroundColor: "var(--panel-strong)",
    borderColor: "var(--border)",
    borderRadius: "0.25rem",
    borderStyle: "solid",
    borderWidth: "1px",
    display: "inline-flex",
    flexShrink: 0,
    height: "1rem",
    justifyContent: "center",
    position: "relative",
    width: "1rem"
  },
  input: { cursor: "inherit", height: "100%", inset: 0, opacity: 0, position: "absolute", width: "100%" },
  check: { color: "var(--accent-strong)", height: "0.75rem", width: "0.75rem" },
  copy: { minWidth: 0 },
  label: { color: "var(--foreground)", display: "block" },
  description: { display: "block", fontSize: "0.62rem", lineHeight: "1rem" }
});
