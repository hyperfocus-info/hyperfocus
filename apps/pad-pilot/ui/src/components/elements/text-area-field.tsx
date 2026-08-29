import { Show, splitProps, type Component, type JSX } from "solid-js";
import styles from "./field.module.css";

export type TextAreaFieldProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & {
  description?: string;
  label?: string;
  labelIcon?: Component<{ "aria-hidden"?: boolean; size?: number }>;
};

export function TextAreaField(props: TextAreaFieldProps) {
  const [local, others] = splitProps(props, ["class", "description", "label", "labelIcon"]);

  return (
    <label class={`${styles.field} ${local.class ?? ""}`.trim()}>
      <Show when={local.label}>
        <span class={styles["field-label"]}>
          <Show when={local.labelIcon} keyed>
            {(LabelIcon) => <LabelIcon size={15} aria-hidden />}
          </Show>
          {local.label}
        </span>
      </Show>
      <textarea {...others} class={styles.textarea} />
      <Show when={local.description}>
        <small class={styles["field-description"]}>{local.description}</small>
      </Show>
    </label>
  );
}
