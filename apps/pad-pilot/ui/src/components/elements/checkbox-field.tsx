import { Show, splitProps, type JSX } from "solid-js";
import styles from "./field.stylex";

export type CheckboxFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "children" | "type"> & {
  description?: string;
  label: string;
};

export function CheckboxField(props: CheckboxFieldProps) {
  const [local, others] = splitProps(props, ["class", "description", "label"]);

  return (
    <label class={`${styles["checkbox-row"]} ${local.class ?? ""}`.trim()}>
      <input {...others} class={styles["checkbox-row-input"]} type="checkbox" />
      <div class={styles["checkbox-copy"]}>
        <strong class={styles["checkbox-copy-strong"]}>{local.label}</strong>
        <Show when={local.description}>
          <small class={styles["checkbox-copy-small"]}>{local.description}</small>
        </Show>
      </div>
    </label>
  );
}
