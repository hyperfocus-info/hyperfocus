import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { isNumericLiteralSourcePath } from '../numeric-literals/policy';
import { collectStandards, standardsRules } from './policy';
import { descendants, functionValue, solidCall } from './syntax';
import { primitiveUtility } from './utilities';

const family = /^(?:text|decimal|debounce|createDebouncedCallback|throttle|clamp(?:01)?|isRecord|asRecord|escapeHtml|csvCell|formatBytes|formatCurrency|sleep|delay|unique|round|formatDate|message)$/;

export async function auditStandards(paths: readonly string[], readSource: (file: string) => Promise<string> = file => readFile(file, 'utf8')) {
  const findings: Array<ReturnType<typeof collectStandards>[number] & { file: string }> = [];
  const review: Array<{ file: string; line: number; kind: string; name: string }> = [];
  let files = 0;
  for (const file of [...new Set(paths)].sort()) {
    if (!isNumericLiteralSourcePath(file) || /(?:^|\/)generated\//.test(file)) continue;
    let source: string;
    try { source = await readSource(file); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error; }
    files++;
    findings.push(...collectStandards(file, source).map(item => ({ file, ...item })));
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const solid = tree.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'solid-js');
    for (const node of descendants(tree)) {
      const fn = functionValue(node);
      const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (fn && family.test(fn.name)) review.push({ file, line, kind: 'utility-family', name: fn.name });
      if (fn && primitiveUtility(fn)) review.push({ file, line, kind: 'primitive-helper', name: fn.name });
      if (fn && /(?:Editor|Form)$/.test(fn.name)) review.push({ file, line, kind: 'editor-lifetime', name: fn.name });
      if (solid && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['find', 'includes'].includes(node.expression.name.text)) {
        review.push({ file, line, kind: 'collection-search', name: node.getText(tree).slice(0, 160) });
      }
      if (fn) {
        const names = new Set(descendants(fn.body).filter(ts.isCallExpression).map(call => call.expression.getText(tree).replace(/^(?:window|globalThis)\./, '')));
        if (names.has('setTimeout') && names.has('clearTimeout')) review.push({ file, line, kind: 'timer-owner', name: fn.name });
      }
      if (ts.isCallExpression(node) && solidCall(node, 'createSignal') && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        review.push({ file, line, kind: 'object-signal', name: `${node.arguments[0].properties.length} fields` });
      }
    }
  }
  return { files, counts: Object.fromEntries(standardsRules.map(rule => [rule, findings.filter(item => item.rule === rule).length])), findings, review };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--json', '--findings', '--check'].includes(arg))) throw new Error('Usage: bun scripts/code-standards/audit.ts [--json|--findings] [--check]');
  const result = spawnBackgroundProcessSync({ cmd: ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  const audit = await auditStandards(new TextDecoder().decode(result.stdout).split('\0'));
  const output = args.includes('--json') ? audit : args.includes('--findings')
    ? { files: audit.files, counts: audit.counts, findings: audit.findings }
    : { files: audit.files, counts: audit.counts, reviewCandidates: audit.review.length };
  console.log(JSON.stringify(output, null, 2));
  if (args.includes('--check') && audit.findings.length) process.exitCode = 1;
}
