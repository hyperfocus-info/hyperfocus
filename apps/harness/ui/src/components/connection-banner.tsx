import { Dot } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { harnessStore } from "../harness-store";
import { ActionButton } from "./action-button";
import { retryHarnessConnection } from "../harness-websocket";

const styles = stylex.create({
  root: {
    borderColor: "var(--border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: '0.375rem',
    paddingInline: '0.75rem',
    backgroundColor: "var(--row)",
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
  },
  status: { gap: "0.5rem", alignItems: "center", display: "flex", fontSize: "0.675rem", fontWeight: 500, },
  connected: { color: "rgb(4 120 87)" },
  connecting: { color: "rgb(180 83 9)" },
  error: { color: "rgb(185 28 28)" },
  inactive: { color: "var(--muted)" },
  icon: { height: "1rem", width: "1rem" },
  label: { textTransform: "capitalize" },
  errorMessage: { color: "var(--danger)", fontSize: "0.585rem", marginTop: "0.25rem" }
});

export function ConnectionBanner() {
  const state = harnessStore.state;
  const retryUnavailable = () => harnessStore.actions.retryUnavailablePaging(state.pagingUnavailableItems);

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
        <div data-test-connection-error="" {...stylex.attrs(styles.errorMessage)}>{state.connectionError}
          {state.connectionState === "error" ? (
            <ActionButton tooltip="Retry connection" size="sm" variant="ghost" onClick={retryHarnessConnection}>Retry</ActionButton>
          ) : null}
        </div>
      ) : null}
      {state.pagingUnavailableItems.length ? (
        <div data-test-paging-unavailable="" {...stylex.attrs(styles.errorMessage)}>
          {state.pagingUnavailableItems.length} oversized item{state.pagingUnavailableItems.length === 1 ? "" : "s"} unavailable
          ({state.pagingUnavailableItems.slice(0, 3).map(({ id }) => id).join(", ")})
          <ActionButton tooltip="Retry unavailable items" size="sm" variant="ghost" onClick={retryUnavailable}>Retry</ActionButton>
        </div>
      ) : null}
    </div>
  );
}
