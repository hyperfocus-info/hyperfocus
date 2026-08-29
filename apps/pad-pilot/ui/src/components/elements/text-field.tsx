import { Show, splitProps, type JSX } from "solid-js";
import styles from "./field.module.css";

export type TextFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "children"> & {
  description?: string;
  label?: string;
};

export function TextField(props: TextFieldProps) {
  const [local, others] = splitProps(props, ["class", "description", "label"]);

  return (
    <label class={`${styles.field} ${local.class ?? ""}`.trim()}>
      <Show when={local.label}>
        <span class={styles["field-label"]}>{local.label}</span>
      </Show>
      <input {...others} class={styles.input} />
      <Show when={local.description}>
        <small class={styles["field-description"]}>{local.description}</small>
      </Show>
    </label>
  );
}
