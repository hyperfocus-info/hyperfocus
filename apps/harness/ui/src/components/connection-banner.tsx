import { Dot } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { harnessStore } from "../harness-store";

export function ConnectionBanner() {
  const state = harnessStore.state;

  return (
    <div
      data-test-connection-banner=""
      data-connection-state={state.connectionState}
      role="status"
      aria-live="polite"
      {...stylex.attrs(styles.root)}
    >
      <div
        {...stylex.attrs(
          styles.status,
          state.connectionState === "connected" && styles.connected,
          state.connectionState === "connecting" && styles.connecting,
          state.connectionState === "error" && styles.error,
          state.connectionState !== "connected" && state.connectionState !== "connecting" && state.connectionState !== "error" && styles.inactive
        )}
      >
        <Dot {...stylex.attrs(styles.icon)} />
        <span {...stylex.attrs(styles.label)}>{state.connectionState}</span>
      </div>
      {state.connectionError ? (
        <div data-test-connection-error="" {...stylex.attrs(styles.errorMessage)}>{state.connectionError}</div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: "var(--row)",
    borderColor: "var(--border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    padding: "0.375rem 0.75rem"
  },
  status: { alignItems: "center", display: "flex", fontSize: "0.675rem", fontWeight: 500, gap: "0.5rem" },
  connected: { color: "rgb(4 120 87)" },
  connecting: { color: "rgb(180 83 9)" },
  error: { color: "rgb(185 28 28)" },
  inactive: { color: "var(--muted)" },
  icon: { height: "1rem", width: "1rem" },
  label: { textTransform: "capitalize" },
  errorMessage: { color: "var(--danger)", fontSize: "0.585rem", marginTop: "0.25rem" }
});
