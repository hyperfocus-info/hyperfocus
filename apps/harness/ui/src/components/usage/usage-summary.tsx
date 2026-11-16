/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { For, Show, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import type { TokenUsageState } from "@hyperfocus/ai-core/protocol";
import { harnessStore } from "../../harness-store";
import { formatResetCountdown, formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import { Dialog } from "../primitives/dialog";
import { Tooltip } from "../primitives/tooltip";
import { LocalUsage } from "../preferences/preferences-usage";
import { formatTokenCount } from "../preferences/preference-display-values";

const styles = stylex.create({
  dialog: { maxWidth: "56rem" },
  stack: { gap: tokens.space3, display: "grid", fontSize: tokens.fontCaption, overflowWrap: "anywhere", minWidth: 0, },
  row: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", justifyContent: "space-between", },
  muted: { color: tokens.muted, fontSize: tokens.fontCaption },
  meter: { accentColor: tokens.accent, height: tokens.space2, width: "100%", },
  window: { gap: tokens.space2, paddingBlock: tokens.space2, display: "grid", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: 1, },
  source: { gap: tokens.space1, paddingBlock: tokens.space2, display: "grid", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: 1, },
  summary: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  heading: { margin: 0, fontSize: tokens.fontBody, fontWeight: 600 },
});

type AccountWindow = NonNullable<TokenUsageState["codexLimits"]>["windows"][number];
export function usageWindowLabel(window: AccountWindow) {
  if (window.windowDurationMins === 10080) return "Weekly";
  if (window.windowDurationMins === 300) return "5-hour";
  if (window.windowDurationMins) return `${window.windowDurationMins} minute window`;
  return window.id === "primary" ? "Primary window" : "Secondary window";
}

export function UsageSummary() {
  const state = harnessStore.state;
  const [now, setNow] = createSignal(Date.now());
  onMount(() => { const timer = setInterval(() => setNow(Date.now()), 30000); onCleanup(() => clearInterval(timer)); });
  // Refresh on connection and periodically while visible so the header is useful before opening it.
  createEffect(() => {
    if (state.connectionState !== "connected") return;
    const refresh = () => { if (document.visibilityState !== "hidden") harnessStore.refreshTokenUsage(); };
    queueMicrotask(refresh);
    const timer = setInterval(refresh, 300000);
    onCleanup(() => clearInterval(timer));
  });
  const limits = () => state.tokenUsage.codexLimits;
  const summaryWindow = () => limits()?.windows.find(window => window.windowDurationMins === 10080) ?? limits()?.windows[0];
  const unattributed = () => Math.max(0, state.tokenUsage.lifetime.totalProcessedTokens - (state.tokenUsage.sourceOverflow?.totals.totalProcessedTokens ?? 0) - (state.tokenUsage.sources ?? []).reduce((sum, source) => sum + source.totals.totalProcessedTokens, 0));
  const summary = () => {
    if (state.usageRefreshRequestId) return "Codex · Updating...";
    const window = summaryWindow();
    if (limits()?.status === "available" && window) return `Codex ${usageWindowLabel(window)} · ${Math.round(window.remainingPercent)}% left`;
    return limits()?.status === "error" || state.usageRefreshError ? "Codex · Usage error" : "Codex · Usage";
  };
  return <>
    <span data-test-usage-summary="">
      <ActionButton variant="ghost" size="sm" class={stylex.attrs(styles.summary).class} ariaLabel="Open Codex usage"
        tooltip="Codex account quota remaining across all apps. Click for limits and local Harness session/lifetime usage. Total tokens = input + output; cached input is counted once."
        onClick={() => { harnessStore.openUsageDialog(); harnessStore.refreshTokenUsage(); }}>{summary()}</ActionButton>
    </span>
    <Dialog open={Boolean(state.usageDialogOpen)} title="Codex usage" class={stylex.attrs(styles.dialog).class} onClose={() => harnessStore.closeUsageDialog()}>
      <div data-test-usage-modal="" {...stylex.attrs(styles.stack)}>
        <div {...stylex.attrs(styles.row)}><h3 {...stylex.attrs(styles.heading)}>Account limits</h3>
          <ActionButton variant="secondary" size="sm" tooltip="Refresh account limits from Codex" disabled={Boolean(state.usageRefreshRequestId)} ariaBusy={Boolean(state.usageRefreshRequestId)} onClick={() => harnessStore.refreshTokenUsage()}>{state.usageRefreshRequestId ? "Refreshing..." : "Refresh"}</ActionButton>
        </div>
        <Show when={state.usageRefreshRequestId}><p role="status">Loading Codex account limits...</p></Show>
        <Show when={state.usageRefreshError}><p role="alert">{state.usageRefreshError}</p></Show>
        <Show when={limits()} fallback={<p {...stylex.attrs(styles.muted)}>Account limits have not been checked.</p>}>{account => <>
          <Show when={account().plan}><span {...stylex.attrs(styles.muted)}>Plan: {account().plan}</span></Show>
          <Show when={account().status !== "available"}><p role={account().status === "error" ? "alert" : "status"}>{account().status === "error" ? "Account limits could not be loaded." : "Account limits unavailable."} {account().reason}</p></Show>
          <Show when={account().status === "available" && !account().windows.length}><p>No account windows reported by Codex.</p></Show>
          <Show when={account().status === "available"}><For each={account().windows}>{window => <section data-test-usage-window={window.id} {...stylex.attrs(styles.window)}>
            <div {...stylex.attrs(styles.row)}><strong>{usageWindowLabel(window)}</strong><span>{Math.round(window.remainingPercent)}% left</span></div>
            <Tooltip content={`${window.remainingPercent}% remaining; ${window.usedPercent}% used. Account-wide Codex quota, separate from local token totals.`}>
              <progress tabindex="0" {...stylex.attrs(styles.meter)} max={100} value={window.remainingPercent} aria-label={`${usageWindowLabel(window)} quota remaining`} />
            </Tooltip>
            <span>{formatResetCountdown(window.resetsAt, now())}</span>
            <Show when={window.resetsAt}><span {...stylex.attrs(styles.muted)}>Resets at {formatShortTimestamp(window.resetsAt)}</span></Show>
          </section>}</For></Show>
          <span {...stylex.attrs(styles.muted)}>Checked: {formatShortTimestamp(account().checkedAt)}</span>
        </>}</Show>
        <p {...stylex.attrs(styles.muted)}>Account-wide limits come from Codex. Local counters below cover only usage observed by this Harness server.</p>
        <details data-test-usage-sources=""><summary>Local usage sources ({(state.tokenUsage.sources?.length ?? 0) + (state.tokenUsage.sourceOverflow?.count ?? 0)})</summary>
          <p {...stylex.attrs(styles.muted)}>Observed lifetime usage since local reset. Historical totals may have unknown attribution. Cached input is part of input, counted once.</p>
          <Show when={state.tokenUsage.sourceOverflow?.count}>{count => <p data-test-usage-overflow="">Showing up to 100 sources in first-observed order. {count()} additional sources are aggregated: {formatTokenCount(state.tokenUsage.sourceOverflow!.totals.totalProcessedTokens)} tokens; Input {formatTokenCount(state.tokenUsage.sourceOverflow!.totals.inputTokens)}; Output {formatTokenCount(state.tokenUsage.sourceOverflow!.totals.outputTokens)}; Cached {formatTokenCount(state.tokenUsage.sourceOverflow!.totals.cachedInputTokens)}. Full identities remain in the local database; unusually large identities are included in this aggregate.</p>}</Show>
          <Show when={unattributed() > 0}><p>Unknown attribution: {formatTokenCount(unattributed())} lifetime tokens.</p></Show>
          <Show when={state.tokenUsage.sources?.length} fallback={<p>{state.tokenUsage.sourceOverflow?.count ? "All attributed sources are included in the aggregate above." : "No attributed sources available. Local totals may include unknown sources."}</p>}>
            <For each={state.tokenUsage.sources}>{source => <div data-test-usage-source="" {...stylex.attrs(styles.source)}>
              <strong>{source.sourceLabel || "Unknown role"}</strong>
              <span>Project: {state.workspace.projects.find(project => project.id === source.projectId)?.name ?? source.projectId ?? "Unknown project"}</span>
              <span>Thread: {state.workspace.projects.find(project => project.id === source.projectId)?.threads.find(thread => thread.id === source.threadId)?.title ?? source.threadId ?? "Unknown thread"}</span>
              <span>Role: {source.sourceKind} · Model: {source.modelId || "Unknown model"} · Runtime: {source.runtime ?? "Unknown runtime"}</span>
              <span>{formatTokenCount(source.totals.totalProcessedTokens)} tokens · Input {formatTokenCount(source.totals.inputTokens)} · Output {formatTokenCount(source.totals.outputTokens)} · Cached {formatTokenCount(source.totals.cachedInputTokens)}</span>
              <span {...stylex.attrs(styles.muted)}>Updated: {formatShortTimestamp(source.totals.updatedAt)}</span>
            </div>}</For>
          </Show>
        </details>
        <LocalUsage compact model={{ state, store: harnessStore }} rerender={() => undefined} />
      </div>
    </Dialog>
  </>;
}
