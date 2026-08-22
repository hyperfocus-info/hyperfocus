import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { toastStore } from "../toast-store";
import { Button } from "./primitives/button";

export function Toaster() {
  return (
    <div data-test-toaster="" aria-live="polite" {...stylex.attrs(styles.toaster)}>
      <For each={toastStore.toasts}>
        {(toast) => (
          <div
            data-test-toast=""
            data-toast-tone={toast.tone ?? "info"}
            role={toast.tone === "error" ? "alert" : "status"}
            {...stylex.attrs(
              styles.toast,
              Boolean(toast.onClick) && styles.clickable,
              toast.tone === "error" && styles.error,
              toast.tone === "warning" && styles.warning,
              toast.tone !== "error" && toast.tone !== "warning" && styles.info
            )}
            onClick={() => toast.onClick?.()}
          >
            <div {...stylex.attrs(styles.row)}>
              <div {...stylex.attrs(styles.copy)}>
                <div {...stylex.attrs(styles.title)}>{toast.title}</div>
                <Show when={toast.description}>
                  <div {...stylex.attrs(styles.description)}>{toast.description}</div>
                </Show>
              </div>
              <Button
                tooltip="Dismiss toast"
                variant="ghost"
                size="icon"
                class={stylex.attrs(styles.dismiss).class}
                aria-label="Dismiss toast"
                onClick={(event) => {
                  event.stopPropagation();
                  toastStore.dismiss(toast.id);
                }}
              >
                <X {...stylex.attrs(styles.icon)} />
              </Button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

const styles = stylex.create({
  toaster: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    pointerEvents: "none",
    position: "fixed",
    right: "1rem",
    top: "1rem",
    width: "min(24rem, calc(100vw - 2rem))",
    zIndex: 140
  },
  toast: {
    backdropFilter: "blur(24px)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    padding: "1rem",
    pointerEvents: "auto"
  },
  clickable: { cursor: "pointer" },
  error: { backgroundColor: "rgb(254 242 242 / 0.92)", borderColor: "rgb(254 202 202 / 0.8)" },
  warning: { backgroundColor: "rgb(255 251 235 / 0.92)", borderColor: "rgb(253 230 138 / 0.8)" },
  info: { backgroundColor: "var(--panel)", borderColor: "var(--border)" },
  row: { alignItems: "flex-start", display: "flex", gap: "0.75rem", justifyContent: "space-between" },
  copy: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  title: { color: "var(--foreground)", fontSize: "0.75rem", fontWeight: 600 },
  description: { color: "var(--muted)", fontSize: "0.75rem" },
  dismiss: {
    borderRadius: "0.5rem",
    color: { default: "var(--muted)", ":hover": "var(--foreground)" },
    height: "2rem !important",
    width: "2rem !important"
  },
  icon: { height: "1rem", width: "1rem" }
});
