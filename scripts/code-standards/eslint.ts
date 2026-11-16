import type { Rule, SourceCode } from 'eslint';
import { collectStandards, standardsRules } from './policy';

const findings = new WeakMap<SourceCode, ReturnType<typeof collectStandards>>();

export function createStandardsRule(rule: typeof standardsRules[number]): Rule.RuleModule {
  return {
    meta: { type: 'problem', schema: [], ...(rule === 'canonical-utilities' ? { fixable: 'code' as const } : {}), docs: { description: `Enforce repository ${rule} standards` }, messages: { violation: '{{message}}' } },
    create(context) {
      return {
        Program() {
          if (/\.d\.[cm]?ts$|(?:^|[/\\])generated[/\\]|\.generated\.[^/\\]+$/.test(context.filename)) return;
          let current = findings.get(context.sourceCode);
          if (!current) {
            current = collectStandards(context.filename, context.sourceCode.text);
            findings.set(context.sourceCode, current);
          }
          for (const item of current) {
            const fix = item.fix;
            if (item.rule === rule) context.report({ loc: { line: item.line, column: item.column - 1 }, messageId: 'violation', data: { message: item.message },
              ...(fix ? { fix: (fixer: Rule.RuleFixer) => fix.insertion
                ? [fixer.replaceTextRange([fix.start, fix.end], fix.text), fixer.insertTextAfterRange([fix.insertion.offset, fix.insertion.offset], fix.insertion.text)]
                : fixer.replaceTextRange([fix.start, fix.end], fix.text) } : {}),
            });
          }
        }
      };
    }
  };
}
