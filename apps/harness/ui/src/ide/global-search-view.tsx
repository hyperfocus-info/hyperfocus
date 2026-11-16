import { For, Show, createMemo } from 'solid-js';
import * as stylex from '@stylexjs/stylex';
import { tokens } from '@hyperfocus/ui/tokens.stylex';
import type { IdeSearchResult } from '@hyperfocus/ai-core/protocol';
import { Button } from '../components/primitives/button';
import { Input } from "@hyperfocus/ui";
import { ideStyles } from './ide-workbench.styles';

const styles = stylex.create({
  root: { padding: tokens.space3, gap: tokens.space3, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, },
  label: { gap: tokens.space2, display: 'grid', fontSize: tokens.fontControl, fontWeight: 600, },
  modes: { gap: tokens.space1, display: 'flex', flexWrap: 'wrap', },
  status: { color: 'var(--ide-muted)', fontSize: tokens.fontCaption, lineHeight: 1.5, overflowWrap: 'anywhere' },
  result: { gap: tokens.space1, paddingBlock: tokens.space2, display: 'grid', borderTopColor: 'var(--ide-border)', borderTopStyle: 'solid', borderTopWidth: '1px', minWidth: 0, },
  target: { justifyContent: 'flex-start', overflowWrap: 'anywhere', textAlign: 'start', height: 'auto', minHeight: '44px', width: '100%', },
  preview: { fontFamily: 'var(--font-mono)', fontSize: tokens.fontCaption, fontWeight: 400 },
});

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
  const resultCount = createMemo(() => props.searchResults.reduce((sum, result) => sum + result.matches.length, 0));
  return <div {...stylex.attrs(styles.root)}>
    <label {...stylex.attrs(styles.label)}>Find in files
      <Input ref={props.searchInputRef} aria-label="Find in files" placeholder="Search project contents" value={props.searchQuery}
        onInput={event => props.onSearchQuery(event.currentTarget.value)} class={stylex.attrs(ideStyles.input).class} />
    </label>
    <div role="group" aria-label="Search options" {...stylex.attrs(styles.modes)}>
      <Button tooltip="Use regular expression search" variant={props.regexSearch ? 'secondary' : 'ghost'} size="sm" aria-pressed={props.regexSearch} onClick={() => props.onRegexSearch(!props.regexSearch)}>Regex</Button>
      <Button tooltip="Match case" variant={props.caseSensitiveSearch ? 'secondary' : 'ghost'} size="sm" aria-pressed={props.caseSensitiveSearch} onClick={() => props.onCaseSensitiveSearch(!props.caseSensitiveSearch)}>Match case</Button>
      <Button tooltip="Match whole word" variant={props.wholeWordSearch ? 'secondary' : 'ghost'} size="sm" aria-pressed={props.wholeWordSearch} onClick={() => props.onWholeWordSearch(!props.wholeWordSearch)}>Whole word</Button>
    </div>
    <div role="status" {...stylex.attrs(styles.status)}>{props.searchLoading ? 'Searching…' : !props.searchQuery.trim() ? 'Enter text to search project files.' : resultCount() === 0 ? 'No matches. Try a different search.' : `${resultCount()} results${props.searchTruncated ? ' — refine your search to see omitted results' : ''}`}</div>
    <Show when={!props.searchLoading && props.searchQuery.trim()}>
      <For each={props.searchResults}>{result => <section aria-label={result.path} {...stylex.attrs(styles.result)}>
        <Button tooltip={`Open ${result.path}`} variant="ghost" class={stylex.attrs(styles.target).class} onClick={() => props.onOpenPath(result.path)}>{result.path}</Button>
        <For each={result.matches}>{match => <Button tooltip={`Open ${result.path} at ${match.line}:${match.column}`} variant="ghost" class={stylex.attrs(styles.target, styles.preview).class}
          onClick={() => props.onOpenPath(result.path, match.line, match.column)}>{match.line}:{match.column} {match.preview}</Button>}</For>
      </section>}</For>
    </Show>
  </div>;
}
