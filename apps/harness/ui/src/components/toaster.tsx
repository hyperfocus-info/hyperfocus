import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { toastStore } from "../toast-store";
import { Button } from "./primitives/button";

const styles = stylex.create({
  toaster: {
    gap: "0.75rem",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "none",
    position: "fixed",
    zIndex: 140,
    maxHeight: "calc(100dvh - 7.5rem)",
    overflowY: "auto",
    right: "1rem",
    top: { default: "6.5rem", "@media (min-width: 768px)": "5.25rem" },
    width: "min(24rem, calc(100vw - 2rem))",
  },
  toast: {
    padding: "1rem",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    backdropFilter: "blur(24px)",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    pointerEvents: "auto",
  },
  clickable: { cursor: "pointer" },
  error: { borderColor: "rgb(254 202 202 / 0.8)", backgroundColor: "rgb(254 242 242 / 0.92)", },
  warning: { borderColor: "rgb(253 230 138 / 0.8)", backgroundColor: "rgb(255 251 235 / 0.92)", },
  info: { borderColor: "var(--border)", backgroundColor: "var(--panel)", },
  row: { gap: "0.75rem", alignItems: "flex-start", display: "flex", justifyContent: "space-between", },
  copy: { gap: "0.25rem", display: "flex", flexDirection: "column", },
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
