/** @jsxImportSource solid-js */
import { Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-solid";
import { formatShortTimestamp } from "../../lib/time-format";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";
import type { PreferencesPanelModel } from "../preferences-modal";
import { Dialog } from "../primitives/dialog";
import { PreferenceRow, PreferenceSection } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

function formatTokenCount(value: number) {
  const normalized = Math.max(0, Math.round(value));
  return normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function TokenUsageTotal(props: { label: string; value: number; description: string }) {
  return (
    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2).class}>
      <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{props.label}</div>
      <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.textBase, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{formatTokenCount(props.value)}</div>
      <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text065, preferenceStyles.colorMuted).class}>{props.description}</div>
    </div>
  );
}

function TokenUsageScope(props: { label: string; description: string; totals: PreferencesPanelModel["state"]["tokenUsage"]["session"] }) {
  return (
    <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3).class}>
        <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
          <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.textXs, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>{props.label}</div>
          <div class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{props.description}</div>
        </div>
        <div class={stylex.attrs(preferenceStyles.shrink0, preferenceStyles.roundedLg, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text065, preferenceStyles.fontMedium, preferenceStyles.colorMuted).class}>{formatTokenCount(props.totals.events)} updates</div>
      </div>
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns2, preferenceStyles.xlGridColumns4).class}>
        <TokenUsageTotal label="Total" value={props.totals.totalTokensIncludingCached} description="processed + cached" />
        <TokenUsageTotal label="Input" value={props.totals.inputTokens} description="prompt context" />
        <TokenUsageTotal label="Output" value={props.totals.outputTokens} description="model response" />
        <TokenUsageTotal label="Cached" value={props.totals.cachedInputTokens} description="cache read" />
      </div>
    </section>
  );
}

export function PreferencesUsage(props: { model: PreferencesPanelModel; rerender: () => void }) {
  const { state, store } = props.model;
  const closeDialog = () => {
    store.closeTokenUsageResetDialog();
    props.rerender();
  };
  return (
    <>
      <PreferenceSection title="Usage" description="App session and lifetime token totals, including cached input.">
        <PreferenceRow id="token-usage" title="Token usage" description="Counters update from observed model context events.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <TokenUsageScope label="Current session" description="Since the app server started or usage was reset." totals={state.tokenUsage.session} />
            <TokenUsageScope label="Lifetime" description="Persisted on the app server until reset." totals={state.tokenUsage.lifetime} />
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <ActionButton tooltip="Reset current session and lifetime token usage" variant="secondary" icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} ariaLabel="Reset token usage" onClick={() => { store.openTokenUsageResetDialog(); props.rerender(); }}>
                Reset usage
              </ActionButton>
              <Show when={state.tokenUsage.resetAt}>{(resetAt) => <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>Last reset: {formatShortTimestamp(resetAt())}</div>}</Show>
            </div>
          </div>
        </PreferenceRow>
      </PreferenceSection>
      <Dialog
        open={state.tokenUsageResetDialogOpen}
        title="Reset token usage"
        description="This clears current session and lifetime token counters stored by the app server."
        onClose={closeDialog}
        footer={<><ActionButton tooltip="Cancel token usage reset" variant="ghost" onClick={closeDialog}>Cancel</ActionButton><ActionButton tooltip="Confirm token usage reset" icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />} onClick={() => { store.resetTokenUsage(); pushToast("Token usage reset", "Session and lifetime counters cleared."); props.rerender(); }}>Reset usage</ActionButton></>}
      >
        <p class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.leading6, preferenceStyles.colorMuted).class}>Token counters will start again from the next observed model usage event.</p>
      </Dialog>
    </>
  );
}
