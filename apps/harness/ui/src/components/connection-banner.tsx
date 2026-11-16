import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { Dot } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { harnessStore } from "../harness-store";
import { ActionButton } from "./action-button";
import { retryHarnessConnection } from "../harness-websocket";
import { Tooltip } from "./primitives/tooltip";

const styles = stylex.create({
  root: {
    overflowWrap: 'anywhere',
    maxWidth: '100%',
    minWidth: 0,
  },
  status: { gap: "0.5rem", alignItems: "center", display: "flex", fontSize: tokens.fontCaption, fontWeight: 500, },
  connected: { color: "var(--success-strong)" },
  connecting: { color: "var(--warning-strong)" },
  error: { color: "var(--danger-strong)" },
  inactive: { color: "var(--muted)" },
  icon: { height: "1rem", width: "1rem" },
  errorMessage: { color: "var(--danger)", fontSize: tokens.fontCaption, marginTop: "0.25rem" }
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
        <Tooltip content={`Connection: ${state.connectionState}`}><span role="img" tabIndex={0} aria-label={`Connection: ${state.connectionState}`}><Dot {...stylex.attrs(styles.icon)} /></span></Tooltip>
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
