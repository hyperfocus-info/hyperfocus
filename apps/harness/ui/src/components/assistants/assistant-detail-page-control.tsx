import { Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import type { AssistantDetailCollectionState } from "../../store/assistant-detail-state";
import { ASSISTANT_DETAIL_CACHE_LIMIT } from "../../store/assistant-detail-state";
import { Button } from "../primitives/button";
import { assistantUtilityStyles } from "../assistants-panel.styles";

export function AssistantDetailPageControl(props: {
  page: AssistantDetailCollectionState;
  label: string;
  messages: boolean;
  searching: boolean;
  onLoadMore: () => void;
}) {
  return <div class={stylex.attrs(assistantUtilityStyles.mt3, assistantUtilityStyles.flex,
    assistantUtilityStyles.flexWrap, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.gap2).class}>
    <Show when={props.searching && (props.page.hasMore || props.page.cacheLimitReached)}>
      <span role="status" class={stylex.attrs(assistantUtilityStyles.text0675,
        assistantUtilityStyles.textMuted).class}>Search covers loaded {props.label} only.</span>
    </Show>
    <Show when={props.page.cacheLimitReached}>
      <span role="status" class={stylex.attrs(assistantUtilityStyles.text0675,
        assistantUtilityStyles.textMuted).class}>Showing the latest {ASSISTANT_DETAIL_CACHE_LIMIT} {props.label}; narrow the search to inspect this bounded cache.</span>
    </Show>
    <Show when={props.page.hasMore || props.page.hasRequestedMore || props.page.status !== "loaded"}>
      <Button variant="secondary" size="sm" justificationForNoTooltip="Visible pagination label is self explanatory."
        aria-busy={props.page.status === "loading" || undefined}
        aria-disabled={props.page.status === "loading" || !props.page.hasMore && props.page.status !== "error"}
        onClick={props.onLoadMore}>
        {props.page.status === "loading" ? `Loading more ${props.label}...` : props.page.status === "error"
          ? `Retry loading ${props.label}` : props.page.hasMore ? props.messages ? "Load earlier messages"
            : `Load more ${props.label}` : `All loaded ${props.label} shown`}
      </Button>
    </Show>
    <Show when={props.page.status === "error"}>
      <span role="alert" class={stylex.attrs(assistantUtilityStyles.text0675,
        assistantUtilityStyles.textDanger).class}>{props.page.error}</span>
    </Show>
  </div>;
}
