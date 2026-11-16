/** @jsxImportSource solid-js */
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import * as stylex from '@stylexjs/stylex';
import { GlobalSearchView } from '../global-search-view';
import { ideStyles } from '../ide-workbench.styles';
import { TerminalTabs } from '../../terminal/terminal-tabs';
import { TerminalSearch } from '../../terminal/terminal-search';
import { ConnectionBanner } from '../../components/connection-banner';
import { createHarnessStore, setActiveHarnessStore, harnessStore } from '../../harness-store';
import '../../global-styles';

function Fixture() {
  const surface = new URLSearchParams(location.search).get('surface');
  if (surface === 'connection-recovery') {
    setActiveHarnessStore(createHarnessStore());
    harnessStore.setConnectionState('error', 'Customer workspace connection failed. The server is unavailable; retry when it is running.');
  }
  const [query, setQuery] = createSignal('customer');
  const [regex, setRegex] = createSignal(false);
  const [caseSensitive, setCase] = createSignal(false);
  const [word, setWord] = createSignal(false);
  const [selected, setSelected] = createSignal('terminal-0');
  const [result, setResult] = createSignal('');
  const [sessions, setSessions] = createSignal(Array.from({ length: 30 }, (_, i) => ({ id: `terminal-${i}`, name: `Customer localization verification ${i + 1} — extrêmement-long-workspace-name`, status: i % 3 ? 'running' : 'failed', category: i % 2 ? 'spawned' as const : 'terminal' as const })));
  return <main class={stylex.attrs(ideStyles.shell).class} style={{ padding: '16px', width: '100%', 'max-width': '720px', 'min-height': '100vh', display: 'block' }}>
    <h1 style={{ 'font-size': '1rem', 'margin-bottom': '16px' }}>{surface === 'global-search' ? 'Find in project' : surface === 'terminal-search' ? 'Search terminal output' : surface === 'connection-recovery' ? 'Connection recovery' : 'Terminal sessions'}</h1>
    <Show when={surface === 'global-search'}>
      <GlobalSearchView searchQuery={query()} replaceQuery="" regexSearch={regex()} caseSensitiveSearch={caseSensitive()} wholeWordSearch={word()} searchLoading={query() === 'loading'} searchTruncated={false}
        searchResults={query() && query() !== 'missing' && query() !== 'loading' ? [{ name: 'verification-report.ts', path: 'src/customer-localization/very-long-implementation-name/verification-report.ts', matches: [{ line: 127, column: 12, preview: 'const customer = verifyCustomerReleaseWithLocalizedDescriptionsAndRecoveryPaths();' }] }] : []}
        searchInputRef={() => {}} onOpenPath={(path, line) => setResult(`${path}:${line ?? 1}`)} onSearchQuery={setQuery} onReplaceQuery={() => {}} onRegexSearch={setRegex} onCaseSensitiveSearch={setCase} onWholeWordSearch={setWord} />
    </Show>
    <Show when={surface === 'terminal-sessions'}>
      <TerminalTabs sessions={sessions()} activeSessionId={selected()} onSelect={setSelected}
        onRename={(id, name) => { setSessions(items => items.map(item => item.id === id ? { ...item, name } : item)); setResult(name); }}
        onClose={id => setSessions(items => items.filter(item => item.id !== id))} />
    </Show>
    <Show when={surface === 'terminal-search'}><TerminalSearch onNext={() => setResult('next')} onPrevious={() => setResult('previous')} /></Show>
    <Show when={surface === 'connection-recovery'}><ConnectionBanner /></Show>
    <output data-test-result="">{result()}</output>
  </main>;
}
render(() => <Fixture />, document.getElementById('root')!);
