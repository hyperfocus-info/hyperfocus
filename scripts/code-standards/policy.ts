import ts from 'typescript';
import { propFindings } from './props';
import { reactivityFindings } from './reactivity';
import { utilityFindings } from './utilities';
import { canonicalFindings } from './canonical';

export const standardsRules = ['utility-modules', 'canonical-utilities', 'no-prop-drilling', 'solid-list-rendering', 'no-derived-signal-effect'] as const;

export function collectStandards(file: string, source: string) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [...utilityFindings(tree), ...propFindings(tree), ...reactivityFindings(tree)].map(item => ({ ...item, fix: undefined }));
  return [...findings, ...canonicalFindings(tree)]
    .sort((left, right) => left.line - right.line || left.column - right.column);
}
