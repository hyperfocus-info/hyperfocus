import * as stylex from "@stylexjs/stylex";
import { For, createSignal } from "solid-js";
import { tokens } from "../theme/tokens.stylex";

export type ToastMessage = { id: string; title: string; description?: string; tone?: "info" | "warning" | "danger" };

export function createToastStore() {
  const [messages, setMessages] = createSignal<readonly ToastMessage[]>([]);
  return {
    messages,
    push(message: Omit<ToastMessage, "id">, durationMs = 5000) {
      const id = crypto.randomUUID();
      setMessages((current) => [...current, { ...message, id }]);
      setTimeout(() => setMessages((current) => current.filter((entry) => entry.id !== id)), durationMs);
      return id;
    },
    dismiss(id: string) { setMessages((current) => current.filter((entry) => entry.id !== id)); }
  };
}

export function Toaster(props: { store: ReturnType<typeof createToastStore> }) {
  return <div {...stylex.attrs(styles.stack)} aria-live="polite" data-test-toaster=""><For each={props.store.messages()}>{(message) => <button {...stylex.attrs(styles.toast, message.tone === "danger" && styles.danger, message.tone === "warning" && styles.warning)} onClick={() => props.store.dismiss(message.id)}><strong>{message.title}</strong>{message.description && <span>{message.description}</span>}</button>}</For></div>;
}

const styles = stylex.create({
  stack: { gap: "0.5rem", display: "flex", flexDirection: "column", position: "fixed", zIndex: 1100, bottom: "1rem", maxWidth: "24rem", right: "1rem", },
  toast: { padding: "0.75rem", borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", gap: "0.2rem", backgroundColor: tokens.panelRaised, boxShadow: tokens.shadow, color: tokens.foreground, cursor: "pointer", display: "flex", flexDirection: "column", textAlign: "start", },
  danger: { borderColor: tokens.danger },
  warning: { borderColor: tokens.warning }
});

