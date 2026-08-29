import { For, Show, createMemo } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Braces, CaseSensitive, Regex, Replace } from "lucide-solid";
import type { IdeSearchResult } from "@hyperfocus/ai-core/protocol";
import { ActionButton } from "../components/action-button";
import { Input } from "../components/primitives/input";
import { ideStyles, ideUtilityStyles } from "./ide-workbench.styles";

function SearchModeControls(props: {
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
}) {
  const buttonClass = stylex.attrs(ideUtilityStyles.h8, ideUtilityStyles.w8, ideUtilityStyles.roundedLg).class;
  const iconClass = stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class;
  return (
    <div class={stylex.attrs(ideUtilityStyles.flex, ideUtilityStyles.itemsCenter, ideUtilityStyles.gap1).class}>
      <ActionButton
        tooltip="Use regular expression search"
        ariaLabel="Use regular expression search"
        icon={<Regex class={iconClass} />}
        variant={props.regexSearch ? "secondary" : "ghost"}
        size="icon"
        class={buttonClass}
        onClick={() => props.onRegexSearch(!props.regexSearch)}
      />
      <ActionButton
        tooltip="Match case"
        ariaLabel="Match case"
        icon={<CaseSensitive class={iconClass} />}
        variant={props.caseSensitiveSearch ? "secondary" : "ghost"}
        size="icon"
        class={buttonClass}
        onClick={() => props.onCaseSensitiveSearch(!props.caseSensitiveSearch)}
      />
      <ActionButton
        tooltip="Match whole word"
        ariaLabel="Match whole word"
        icon={<Braces class={iconClass} />}
        variant={props.wholeWordSearch ? "secondary" : "ghost"}
        size="icon"
        class={buttonClass}
        onClick={() => props.onWholeWordSearch(!props.wholeWordSearch)}
      />
      <ActionButton
        tooltip="Replace is planned for the editing pass"
        icon={<Replace class={iconClass} />}
        variant="secondary"
        size="sm"
      >
        Replace
      </ActionButton>
    </div>
  );
}

function SearchResults(props: {
  results: IdeSearchResult[];
  count: number;
  onOpenPath: (path: string, line?: number, column?: number) => void;
}) {
  return (
    <Show
      when={props.count > 0}
      fallback={
        <div class={stylex.attrs(ideUtilityStyles.roundedLg, ideUtilityStyles.border,
          ideUtilityStyles.borderDashed, ideUtilityStyles.borderIde, ideUtilityStyles.p3,
          ideUtilityStyles.textXs, ideUtilityStyles.textIdeMuted).class}>
          Type to search files.
        </div>
      }
    >
      <For each={props.results}>
        {(result) => (
          <div class={stylex.attrs(ideUtilityStyles.roundedLg, ideUtilityStyles.border,
            ideUtilityStyles.borderIde, ideUtilityStyles.bgIdeRow, ideUtilityStyles.p2).class}>
            <button
              type="button"
              class={stylex.attrs(ideUtilityStyles.block, ideUtilityStyles.wFull,
                ideUtilityStyles.truncate, ideUtilityStyles.textLeft, ideUtilityStyles.textXs,
                ideUtilityStyles.fontSemibold, ideUtilityStyles.textIdeText).class}
              onClick={() => props.onOpenPath(result.path)}
            >
              {result.path}
            </button>
            <For each={result.matches}>
              {(match) => (
                <button
                  type="button"
                  class={stylex.attrs(ideUtilityStyles.mt1, ideUtilityStyles.block,
                    ideUtilityStyles.wFull, ideUtilityStyles.truncate, ideUtilityStyles.textLeft,
                    ideUtilityStyles.fontMono, ideUtilityStyles.text07, ideUtilityStyles.textIdeMuted).class}
                  onClick={() => props.onOpenPath(result.path, match.line, match.column)}
                >
                  {match.line}:{match.column} {match.preview}
                </button>
              )}
            </For>
          </div>
        )}
      </For>
    </Show>
  );
}

export function GlobalSearchView(props: {
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchResults: IdeSearchResult[];
  searchTruncated: boolean;
  searchInputRef: (element: HTMLInputElement | undefined) => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onSearchQuery: (value: string) => void;
  onReplaceQuery: (value: string) => void;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
}) {
  const resultCount = createMemo(() =>
    props.searchResults.reduce((sum, result) => sum + result.matches.length, 0));
  return (
    <div class={stylex.attrs(ideUtilityStyles.flex, ideUtilityStyles.minH0, ideUtilityStyles.flex1,
      ideUtilityStyles.flexCol, ideUtilityStyles.gap3, ideUtilityStyles.overflowAuto,
      ideUtilityStyles.p3).class}>
      <div class={stylex.attrs(ideUtilityStyles.flex, ideUtilityStyles.flexCol, ideUtilityStyles.gap2).class}>
        <Input
          ref={props.searchInputRef}
          aria-label="Find in files"
          placeholder="Find"
          value={props.searchQuery}
          onInput={(event) => props.onSearchQuery(event.currentTarget.value)}
          class={stylex.attrs(ideStyles.input).class}
        />
        <Input
          aria-label="Replace in files"
          placeholder="Replace"
          value={props.replaceQuery}
          onInput={(event) => props.onReplaceQuery(event.currentTarget.value)}
          class={stylex.attrs(ideStyles.input).class}
        />
        <SearchModeControls {...props} />
      </div>
      <div class={stylex.attrs(ideUtilityStyles.text065, ideUtilityStyles.fontSemibold,
        ideUtilityStyles.uppercase, ideUtilityStyles.textIdeMuted).class}>
        {props.searchLoading
          ? "Searching..."
          : `${resultCount()} results${props.searchTruncated ? " (truncated)" : ""}`}
      </div>
      <SearchResults results={props.searchResults} count={resultCount()} onOpenPath={props.onOpenPath} />
    </div>
  );
}
