import { formatTokenCount } from "./preference-display-values";
import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-solid";
import { Show, createContext, useContext } from "solid-js";
import { formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import type { PreferencesPanelModel } from "../preferences-modal";
import { Dialog } from "../primitives/dialog";
import { PreferenceRow,PreferenceSection } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

const usageStyles = stylex.create({
  reading: { overflowWrap: "anywhere", minWidth: 0 },
  totals: { gap: tokens.space2, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))", },
  number: { fontSize: tokens.fontBody, fontVariantNumeric: "tabular-nums", fontWeight: 600, overflowWrap: "anywhere" },
});


const UsageContext = createContext<() => PreferencesPanelModel["state"]["tokenUsage"]>();

function TokenUsageTotal(props: { label: string; value: number; description: string }) {
  return (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2).class}>
      <div class={stylex.attrs(usageStyles.reading, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.colorMuted).class}>{props.label}</div>
      <div class={stylex.attrs(usageStyles.number).class}>{formatTokenCount(props.value)}</div>
      <div class={stylex.attrs(usageStyles.reading, preferenceStyles.text065, preferenceStyles.colorMuted).class}>{props.description}</div>
    </div>
  );
}

function TokenUsageScope(props: { label: string; description: string; scope: "session" | "lifetime" }) {
  const usage = useContext(UsageContext)!;
  const totals = () => usage()[props.scope];
  return (
    <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3).class}>
        <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
          <div class={stylex.attrs(usageStyles.reading, preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{props.label}</div>
          <div class={stylex.attrs(usageStyles.reading, preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{props.description}</div>
        </div>
        <div class={stylex.attrs(preferenceStyles.shrink0, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text065, preferenceStyles.fontMedium, preferenceStyles.colorMuted).class}>{formatTokenCount(totals().events)} updates</div>
      </div>
      <Show when={totals().updatedAt}><span class={stylex.attrs(preferenceStyles.colorMuted).class}>Updated: {formatShortTimestamp(totals().updatedAt)}</span></Show>
      <div class={stylex.attrs(usageStyles.totals).class}>
        <TokenUsageTotal label="Total" value={totals().totalProcessedTokens} description="input + output; cache already included" />
        <TokenUsageTotal label="Input" value={totals().inputTokens} description="prompt context" />
        <TokenUsageTotal label="Output" value={totals().outputTokens} description="model response" />
        <TokenUsageTotal label="Cached" value={totals().cachedInputTokens} description="cache read" />
      </div>
    </section>
  );
}

export function PreferencesUsage() {
  const panel = usePreferencesPanel();
  return <LocalUsage model={panel.model} rerender={panel.rerender} renderConfirmation={!panel.model.state.usageDialogOpen} />;
}

export function LocalUsage(panel: { model: Pick<PreferencesPanelModel, "state" | "store">; rerender: () => void; renderConfirmation?: boolean; compact?: boolean }) {
  const { state, store } = panel.model;
  const closeDialog = () => {
    store.closeTokenUsageResetDialog();
    panel.rerender();
  };
  const content = () => (
    <UsageContext.Provider value={() => state.tokenUsage}><div data-test-usage-local="" class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <TokenUsageScope label="Current session" description="Since the app server started or usage was reset." scope="session" />
            <TokenUsageScope label="Lifetime" description="Persisted on the app server until reset." scope="lifetime" />
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <ActionButton tooltip="Reset current session and lifetime token usage" variant="secondary" icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} ariaLabel="Reset token usage" onClick={() => { store.openTokenUsageResetDialog(); panel.rerender(); }}>
                Reset usage
              </ActionButton>
              <Show when={state.tokenUsage.resetAt}>{(resetAt) => <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Last reset: {formatShortTimestamp(resetAt())}</div>}</Show>
            </div>
          </div></UsageContext.Provider>);
  return (
    <>
      <Show when={!panel.compact} fallback={<section><h3>Local token usage</h3>{content()}</section>}>
      <PreferenceSection title="Usage" description="App session and lifetime token totals, including cached input.">
        <PreferenceRow id="token-usage" title="Token usage" description="Counters update from observed model context events.">
          {content()}
        </PreferenceRow>
      </PreferenceSection>
      </Show>
      <Dialog
        open={state.tokenUsageResetDialogOpen && panel.renderConfirmation !== false}
        title="Reset token usage"
        description="This clears current session and lifetime token counters stored by the app server."
        onClose={closeDialog}
        footer={<><ActionButton tooltip="Cancel token usage reset" variant="ghost" onClick={closeDialog}>Cancel</ActionButton><ActionButton tooltip="Confirm local counter reset; account quota is unchanged" disabled={Boolean(state.usageResetRequestId)} ariaBusy={Boolean(state.usageResetRequestId)} icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => { store.resetTokenUsage(); panel.rerender(); }}>{state.usageResetRequestId ? "Resetting..." : "Reset usage"}</ActionButton></>}
      >
        <p class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.leading6, preferenceStyles.colorMuted).class}>This does not restore Codex account quota. Local counters start again from the next observed usage event.</p>
        <Show when={state.usageResetError}><p role="alert">{state.usageResetError}</p></Show>
        <p class={stylex.attrs(usageStyles.reading).class}>Current session: {formatTokenCount(state.tokenUsage.session.totalProcessedTokens)} tokens. Lifetime: {formatTokenCount(state.tokenUsage.lifetime.totalProcessedTokens)} tokens.</p>
      </Dialog>
    </>
  );
}
