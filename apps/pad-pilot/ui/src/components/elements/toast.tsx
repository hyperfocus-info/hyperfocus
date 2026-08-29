import { Show, splitProps, type JSX } from "solid-js";
import { XIcon } from "lucide-solid";
import { Button } from "./button";
import styles from "./toast.module.css";

/**
 * Props for Toast.
 */
export type ToastProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Visible message body. */
  message: string;
  /** Visual treatment variant. */
  tone?: "error";
  /** Optional dismiss handler. */
  onDismiss?: () => void;
  /** Accessible label for the dismiss button. */
  dismissLabel?: string;
};

/** Toast renders a compact status notification with forwarded host props. */
export function Toast(props: ToastProps) {
  const [local, others] = splitProps(props, ["class", "dismissLabel", "message", "onDismiss", "tone"]);

  return (
    <div
      {...others}
      class={`${styles.toast} ${styles[`tone-${local.tone ?? "error"}`]} ${local.class ?? ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div class={styles.copy}>
        <strong class="pad-pilot-label">{local.message}</strong>
      </div>
      <Show when={local.onDismiss}>
        <Button class={styles.dismiss} icon={XIcon} onClick={() => local.onDismiss?.()} tooltip={local.dismissLabel ?? "Dismiss notification"} variant="ghost" />
      </Show>
    </div>
  );
}
