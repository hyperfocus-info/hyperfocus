import type { Rule, SourceCode } from 'eslint';

type Node = Parameters<SourceCode['getScope']>[0];

/** Deliberately local provenance: only unmodified aliases of a locally constructed Map. */
export const explicitMapPresence: Rule.RuleModule = {
  meta: {
    type: 'problem', schema: [],
    docs: { description: 'Distinguish Map entry presence from the truthiness of its value' },
    messages: { presence: 'Do not infer Map entry presence from truthiness. Use Map.has(key) for presence (including undefined values), or compare the intended value explicitly.' }
  },
  create(context) {
    const reported = new Set<Node>();
    function binding(node: Node) {
      if (node.type !== 'Identifier') return undefined;
      let scope: ReturnType<SourceCode['getScope']> | null = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(node.name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return undefined;
    }
    function initializer(node: Node) {
      const variable = binding(node);
      if (!variable || variable.references.some(reference => reference.isWrite() && !reference.init)) return undefined;
      const definition = variable.defs.find(item => item.type === 'Variable');
      return definition?.type === 'Variable' ? definition.node.init : undefined;
    }
    function localMap(node: Node) {
      const value = initializer(node);
      return value?.type === 'NewExpression' && value.callee.type === 'Identifier'
        && value.callee.name === 'Map' && !binding(value.callee)?.defs.length;
    }
    function lookup(node: Node, seen = new Set<Node>()): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node.type === 'ChainExpression') return lookup(node.expression, seen);
      if (node.type === 'Identifier') {
        const value = initializer(node);
        return !!value && lookup(value, seen);
      }
      return node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && !node.callee.computed && node.callee.property.type === 'Identifier'
        && node.callee.property.name === 'get' && localMap(node.callee.object);
    }
    function check(node: Node) {
      if (lookup(node) && !reported.has(node)) {
        reported.add(node);
        context.report({ node, messageId: 'presence' });
      }
      if (node.type === 'LogicalExpression' && node.operator !== '??') { check(node.left); check(node.right); }
    }
    return {
      IfStatement: node => check(node.test),
      WhileStatement: node => check(node.test),
      DoWhileStatement: node => check(node.test),
      ForStatement: node => { if (node.test) check(node.test); },
      ConditionalExpression: node => check(node.test),
      UnaryExpression: node => { if (node.operator === '!') check(node.argument); },
      LogicalExpression: node => { if (node.operator !== '??') check(node.left); }
    };
  }
};
