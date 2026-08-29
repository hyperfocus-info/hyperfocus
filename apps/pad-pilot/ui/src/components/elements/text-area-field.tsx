import { Show, splitProps, type Component, type JSX } from "solid-js";
import styles from "./field.stylex";

export type TextAreaFieldProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & {
  controlClass?: string;
  labelClass?: string;
  description?: string;
  label?: string;
  labelIcon?: Component<{ "aria-hidden"?: boolean; size?: number }>;
};

export function TextAreaField(props: TextAreaFieldProps) {
  const [local, others] = splitProps(props, ["class", "controlClass", "description", "label", "labelClass", "labelIcon"]);

  return (
    <label class={`${styles.field} ${local.class ?? ""}`.trim()}>
      <Show when={local.label}>
        <span class={`${styles["field-label"]} ${local.labelClass ?? ""}`.trim()}>
          <Show when={local.labelIcon} keyed>
            {(LabelIcon) => <LabelIcon size={15} aria-hidden />}
          </Show>
          {local.label}
        </span>
      </Show>
      <textarea {...others} class={`${styles.textarea} ${local.controlClass ?? ""}`.trim()} />
      <Show when={local.description}>
        <small class={styles["field-description"]}>{local.description}</small>
      </Show>
    </label>
  );
}
