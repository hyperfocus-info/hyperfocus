import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { collectStandards } from './policy';
import { auditStandards } from './audit';

const findings = (source: string) => collectStandards('apps/example/src/view.tsx', source);
const rules = (source: string) => findings(source).map(item => item.rule);

describe('utility ownership', () => {
  test('reports primitive helpers mixed with feature implementations, including arrows and nested helpers', () => {
    expect(rules(`const decimal = (value: number) => String(value / 100);
      export function Editor(props: Props) { function text(value: unknown) { return typeof value === 'string' ? value : ''; } return <div>{text(props.value)}{decimal(1)}</div>; }`))
      .toEqual(['utility-modules', 'utility-modules', 'canonical-utilities']);
  });
  test('allows focused utility modules without requiring a utils filename', () => {
    expect(rules(`export function decimal(cents: number) { const digits = BigInt(Math.abs(cents)).toString().padStart(3, '0'); return digits; }
      export const text = (value: unknown) => typeof value === 'string' ? value : '';`)).toEqual(['canonical-utilities']);
  });
  test('does not classify domain functions or closures as portable utilities', () => {
    expect(rules(`function text(node: HTMLElement, value: string) { node.textContent = value; }
      const config = load(); function scoped(value: number) { return config.scale * value; }
      export function save(book: Book) { return post(book); }`)).toEqual([]);
  });
  test('allows composed utility modules with imported types and runtime constants', () => {
    expect(rules(`import { MIN } from './constants'; export function clamp(n: number) { return Math.max(0, n); }
      export function scaled(input: Input) { return clamp(input.value) * MIN; }`)).toEqual([]);
  });
  test('reports portable helpers beside executable entry code', () => {
    expect(rules(`function text(value: unknown) { return typeof value === 'string' ? value : ''; } startServer();`)).toEqual(['utility-modules', 'canonical-utilities']);
  });
  test('does not mistake a shadowed builtin for a portable dependency', () => {
    expect(rules(`const Math = service(); function value(n: number) { return Math.read(n); } startServer();`)).toEqual([]);
  });
  test('preserves the approved Books credits utility module', () => {
    const file = 'apps/engine-editor/website/examples/books/src/documents/credits.ts';
    expect(collectStandards(file, readFileSync('scripts/code-standards/fixtures/books-credits.txt', 'utf8'))).toEqual([]);
  });
  test('domain-shaped fixture factories are not inferred portable; generic test helpers still are', () => {
    const fixture = `function scopedTask(id: string) { return { id, state: 'queued', kind: 'assistantTask' }; }
      function normalize(value: string) { return value.trim(); } test('case', () => {});`;
    const result = collectStandards('apps/example/src/task.test.ts', fixture).filter(item => item.rule === 'utility-modules');
    expect(result).toHaveLength(1); expect(result[0]?.message).toContain('normalize');
  });
  test('any-typed domain fields do not establish primitive inputs', () => {
    expect(rules('function outcomes(artifact: any) { return artifact.trial.outcome; } launch();')).toEqual([]);
  });
  test('an empty promise-resolver initializer is not a utility, while real primitive callbacks still are', () => {
    const source = `let resolveExit = (_code: number) => {}; const exited = new Promise<number>(resolve => { resolveExit = resolve; });
      const normalize = (value: string) => value.trim(); test('exit', () => resolveExit(0));`;
    const result = findings(source).filter(item => item.rule === 'utility-modules');
    expect(result).toHaveLength(1); expect(result[0]?.message).toContain('normalize');
  });
  test('domain record factories remain domain-shaped through arrays and local bindings', () => {
    const source = `function tiles(count: number) { return Array.from({length: count}, (_, id) => ({id, x: id * 16, y: 0})); }
      const frames = (frame: number) => [0, 1].map(seat => ({matchId: 'fight', frame, seat, actions: ['guard']}));
      function points(count: number) { const out: Point[] = []; for (let id = 0; id < count; id++) out.push({id, x: id}); return out; }
      function color(value: string) { const result = {r: 1, g: 1, b: 1}; result.r = Number(value); return result; }
      const trim = (values: string[]) => values.map(value => value.trim());
      const encode = (value: string) => JSON.stringify({value}); test('domain fixture', () => {});`;
    const result = findings(source).filter(item => item.rule === 'utility-modules');
    expect(result.map(item => item.message)).toEqual(['trim', 'encode'].map(name =>
      `Move the primitive helper ${name} into a focused utility module; reuse its canonical low-level owner when portable.`));
  });
  test('serialized closures and independent oracles still require focused helper ownership', () => {
    const source = `const cents = (amount: number) => Math.round(amount * 100);
      evaluate(() => { const percentile = (values: number[]) => values.slice().sort()[0]; return percentile([1]); });
      test('independent cents', () => expect(cents(1.25)).toBe(125));`;
    expect(findings(source).filter(item => item.rule === 'utility-modules')).toHaveLength(2);
  });
});

describe('feature props', () => {
  test('catches every named example even at the state owner', () => {
    expect(findings('<ReportDetail workspace={workspace} selection={selection()} currentScope={reportScope()} refresh={openReport}/>').map(item => item.message))
      .toEqual(['workspace', 'selection', 'currentScope', 'refresh'].map(name => `Read feature state/action ${name} from scoped context or a store instead of forwarding it through JSX.`));
  });
  test.each([
    'function Parent(props: Props) { return <Child model={props.model}/>; }',
    'const Parent = (input: Props) => <Child source={input.source()}/>;',
    'function Parent({ model }: Props) { return <Child data={model}/>; }',
    'function Parent(props: Props) { const local = props.model; return <Child data={local}/>; }',
    'function Parent(props: Props) { return <Child {...props}/>; }',
    'function Parent(props: Props) { return <Child model={{ dependency: props.controller }}/>; }',
    'function Parent({ workspace }: Props) { const model = { workspace }; return <Child model={model}/>; }',
    'function Parent(props: Props) { return <Child model={{ ...props }}/>; }',
    'function Parent(props: Props) { return <Child model={[props.workspace]}/>; }',
  ])('reports relay bindings and spreads: %s', source => expect(rules(source)).toContain('no-prop-drilling'));
  test('allows context providers, leaf control APIs, framework flow and row values', () => {
    expect(rules(`import { For } from 'solid-js'; import { SelectControl } from '@hyperfocus/ui';
      function Parent(props: Props) { return <Scope.Provider value={props.model}><SelectControl value={props.value}/><Input value={props.value} onInput={props.onInput}/><For each={props.rows}>{row => <Row item={row}/>}</For></Scope.Provider>; }`)).toEqual([]);
  });
  test('a shadowed local is not treated as an upstream prop', () => {
    expect(rules(`function Parent(props: Props) { const model = props.model; return <>{rows.map(model => <Row item={model}/>)}</>; }`)).toEqual([]);
  });
  test('a transformation with arguments is not a direct accessor relay', () => {
    expect(rules('function Header(props: Props) { return <Badge tone={props.toneFor(props.row)}/>; }')).toEqual([]);
  });
  test('named row render helpers are not mistaken for component prop sources', () => {
    expect(rules('const renderRow = (row: Row) => <RowView item={row}/>; function renderOther(row: Row) { return <RowView item={row}/>; }')).toEqual([]);
  });
  test('an owning store provider is an injection boundary, while feature stores remain prohibited', () => {
    const source = "import { HarnessStoreProvider } from './store-providers'; const View = (props: Props) => <HarnessStoreProvider store={props.store}><Feature store={props.store}/></HarnessStoreProvider>;";
    const result = collectStandards('apps/harness/ui/src/app.tsx', source).filter(item => item.rule === 'no-prop-drilling');
    expect(result).toHaveLength(1); expect(result[0]?.message).toContain('store');
  });
  test('the controlled Select implementation can cross its visibility mount boundary', () => {
    const result = collectStandards('packages/ui/src/primitives/selection/select-control.tsx', 'function SelectControl(props: Props) { return <SelectControlContent {...props}/>; }');
    expect(result).toEqual([]);
    expect(rules('function Feature(props: Props) { return <Child {...props}/>; }')).toContain('no-prop-drilling');
  });
  test('reviewed local controls retain precise leaf contracts without allowing feature state', () => {
    const source = `import { Button } from './primitives/button'; import { VirtualList } from './primitives/virtual-list';
      export function Parent(props: Props) { return <><Button tooltipDisabled={props.tooltipDisabled}/><VirtualList items={props.rows} onScroll={props.onScroll} workspace={props.workspace}/></>; }`;
    const result = collectStandards('apps/harness/ui/src/components/fixture.tsx', source).filter(item => item.rule === 'no-prop-drilling');
    expect(result).toHaveLength(1); expect(result[0]?.message).toContain('workspace');
  });
});

describe('Solid derivation and list ownership', () => {
  test('dynamic JSX maps are findings; static lists and non-JSX maps are allowed', () => {
    expect(rules(`import { For } from 'solid-js'; export const View = () => <>{rows().map(row => <Row item={row}/>)}</>;`)).toEqual(['solid-list-rendering']);
    expect(rules(`import { For } from 'solid-js'; export const View = () => <>{['a', 'b'].map(row => <span>{row}</span>)}<For each={rows().map(row => row.name)}>{name => <span>{name}</span>}</>;`)).toEqual([]);
  });
  test('does not apply Solid list rules to other frameworks', () => {
    expect(rules('export const View = () => <>{rows.map(row => <div>{row}</div>)}</>;')).toEqual([]);
  });
  test('allows static catalogs and data maps carrying an icon or a render callback', () => {
    expect(rules(`import { For } from 'solid-js'; const tabs = [{id: 'a'}, {id: 'b'}] as const;
      const options = rows().map(row => ({ label: row.name, icon: <Icon/>, render: () => <Row/> }));
      export const View = () => <>{tabs.map(tab => <Tab value={tab.id}/>)}</>;`)).toEqual([]);
  });
  test('a spread of reactive rows is not a static catalog', () => {
    expect(rules(`import { For } from 'solid-js'; const View = () => <>{[...rows()].map(row => <Row item={row}/>)}</>;`)).toEqual(['solid-list-rendering']);
  });
  test.each([
    `import { createSignal as signal, createEffect as effect } from 'solid-js'; const [value, setValue] = signal(''); effect(() => setValue(source()));`,
    `import * as Solid from 'solid-js'; const [value, setValue] = Solid.createSignal(''); Solid.createRenderEffect(() => { setValue(source()); });`,
  ])('detects direct derived signal effects, including import aliases', source => expect(rules(source)).toEqual(['no-derived-signal-effect']));
  test('allows external effects, conditional draft resets, and shadowed setters', () => {
    expect(rules(`import { createSignal, createEffect } from 'solid-js';
      const [value, setValue] = createSignal('');
      createEffect(() => { if (identityChanged()) setValue(initial()); });
      createEffect(() => external.set(value()));
      function scope(setValue: (v: string) => void) { createEffect(() => setValue(source())); }`)).toEqual([]);
  });
});

test('root ESLint enables each rule as an error without speculative fixes', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.config.mjs', fix: true });
  const [result] = await lint.lintText(`import { createSignal, createEffect } from 'solid-js';
    function decimal(value: number) { return String(value / 100); }
    export function Panel(props: Props) { const [value, setValue] = createSignal(''); createEffect(() => setValue(props.value)); return <Child workspace={props.workspace}>{props.rows.map(row => <span>{row}{value()}{decimal(1)}</span>)}</Child>; }`,
  { filePath: 'apps/example/src/lint-fixture.tsx' });
  for (const rule of ['utility-modules', 'no-prop-drilling', 'solid-list-rendering', 'no-derived-signal-effect']) {
    expect(result?.messages.find(message => message.ruleId === `hyperfocus/${rule}`)?.severity).toBe(2);
  }
  expect(result?.output).toBeUndefined();
});

test('audit includes authored tests, deduplicates paths and excludes output without loading it', async () => {
  const paths = ['apps/example/src/view.tsx', 'apps/example/src/view.tsx', 'apps/example/src/view.test.tsx',
    'apps/example/.local/capture.tsx', 'packages/serialization/src/generated/message.ts', 'apps/example/dist/view.js'];
  const loaded: string[] = [];
  const audit = await auditStandards(paths, async file => { loaded.push(file); return '<Feature workspace={state}/>'; });
  expect(loaded).toEqual(['apps/example/src/view.test.tsx', 'apps/example/src/view.tsx']);
  expect(audit.files).toBe(2);
  expect(audit.counts['no-prop-drilling']).toBe(2);
  expect(audit.findings.every(item => item.line === 1 && item.column === 10)).toBe(true);
});
