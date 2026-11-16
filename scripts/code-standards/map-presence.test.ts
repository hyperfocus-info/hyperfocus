import { expect, test } from 'bun:test';
import { Linter } from 'eslint';
import parser from '@typescript-eslint/parser';
import { explicitMapPresence } from './map-presence';

function lint(source: string) {
  return new Linter().verify(source, [{ files: ['**/*.ts'], languageOptions: { parser },
    plugins: { local: { rules: { presence: explicitMapPresence } } }, rules: { 'local/presence': 'error' } }], { filename: 'fixture.ts' });
}

test.each([
  'const states = new Map<number, unknown>(); if (states.get(0)) run();',
  'function rollback<T>() { const states = new Map<number, T>(); const state = states.get(0); if (!state) return; }',
  'const states = new Map(); const first = states.get(0); const alias = first; if (alias) run();',
  'const states = new Map(); const state = states.get(0); const result = state || fallback;',
  'const states = new Map(); const result = ready && states.get(0) ? yes : no;',
  'const states = new Map(); while (states.get(0)) run();'
])('rejects implicit Map presence: %s', source => {
  expect(lint(source).map(message => message.messageId)).toEqual(['presence']);
});

test.each([
  'const states = new Map(); if (states.has(0)) run(states.get(0));',
  'const states = new Map(); const state = states.get(0); if (state !== undefined) run(state);',
  'const flags = new Map(); if (flags.get(0) === false) run();',
  'const states = new Map(); const value = states.get(0) ?? fallback;',
  'const other = { get() { return true; } }; if (other.get()) run();',
  'const states = new Map(); const state = states.get(0); function nested(state: boolean) { if (state) run(); }',
  'function f(Map: any) { const states = new Map(); if (states.get(0)) run(); }',
  'const states = new Map(); let state = states.get(0); state = true; if (state) run();'
])('preserves explicit values and unrelated/shadowed bindings: %s', source => {
  expect(lint(source)).toEqual([]);
});
