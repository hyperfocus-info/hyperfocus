import type { Rule } from 'eslint';

// JSX nodes are supplied by the configured TypeScript parser. Keep this boundary
// structural so the rule also works with the ordinary ESLint JSX parser.
type Node = { type: string; [key: string]: unknown };
const isNode = (value: unknown): value is Node => !!value && typeof value === 'object' && 'type' in value && typeof value.type === 'string';
const nodeOf = (value: unknown) => isNode(value) ? value : undefined;
const nodes = (value: unknown): Node[] => Array.isArray(value) ? value.filter(isNode) : [];
const name = (value: unknown): string => {const node=nodeOf(value);return typeof node?.name === 'string' ? node.name : '';};
const attributes = (node: Node) => nodes(nodeOf(node.openingElement)?.attributes);
const attribute = (node: Node, key: string) => attributes(node).find(item => name(item.name) === key);
const literal = (value: unknown): unknown => isNode(value)
  ? value.type === 'JSXExpressionContainer' ? literal(value.expression) : value.value : value;
const tag = (node: Node) => name(nodeOf(node.openingElement)?.name);
const native = (node: Node) => /^[a-z]/.test(tag(node));

function interactiveAncestor(node?: Node): boolean {
  for (let parent = nodeOf(node?.parent); parent; parent = nodeOf(parent.parent)) {
    if (['a', 'button', 'HomeButton'].includes(tag(parent))) return true;
    if (['header', 'nav'].includes(tag(parent))) return false;
  }
  return false;
}

function primaries(node: Node): Node[] {
  if (literal(attribute(node, 'variant')?.value) === 'primary') return [node];
  if (!native(node) && node.type !== 'JSXFragment') return [];
  // Conditional branches, loops and component internals require rendered review.
  return nodes(node.children).flatMap(child => child.type === 'JSXElement' || child.type === 'JSXFragment' ? primaries(child) : []);
}

function descendants(node: Node): Node[] {
  return nodes(node.children).flatMap(child => child.type === 'JSXElement' || child.type === 'JSXFragment' ? [child, ...descendants(child)] : []);
}

function navbarAncestor(node: Node) {
  for(let parent=nodeOf(node.parent);parent;parent=nodeOf(parent.parent)) if(attribute(parent,'data-ui-navbar'))return parent;
}

export const attentionRule: Rule.RuleModule = {
  meta: { type: 'problem', schema: [], docs: { description: 'Bound explicit action emphasis and keep navbar brands operable' }, messages: {
    primary: 'This unconditional group has multiple primary actions. Choose one; verify conditional views in the browser.',
    home: 'A navbar brand must be a home link/button, preserving drafts and focus.',
    subtitle: 'Omit routine subtitles or disclose useful detail. Mark essential hero/empty/error copy with data-ui-copy="essential".',
    navCopy: 'Navbar contains secondary copy. Move status and explanations beside the relevant task.',
    duplicate: 'Navbar repeats action "{{action}}". Keep one route and group related commands in a menu.',
    settings: 'App settings need SettingsWorkspace or a dedicated view, not a modal.',
    inputWeight: 'Input values use normal font weight; emphasis belongs to their labels.',
  } },
  create(context) {
    const inspect = (raw: Rule.Node) => {
      const node = nodeOf(raw);
      if (!node) return;
      const parent = nodeOf(node.parent);
      if (!parent || !['JSXElement', 'JSXFragment'].includes(parent.type) || !native(parent)) {
        const actions = primaries(node);
        for (const action of actions.slice(1)) {
          const start=Array.isArray(action.range)?action.range[0]:undefined;
          if(typeof start==='number') context.report({ loc: context.sourceCode.getLocFromIndex(start), messageId: 'primary' });
        }
      }
      const source = context.sourceCode.getText(raw);
      const range = nodeOf(node.openingElement)?.range;
      const opening = Array.isArray(range) && typeof range[0]==='number' && typeof range[1]==='number' ? context.sourceCode.text.slice(range[0],range[1]) : '';
      if(navbarAncestor(node) && (['p','small'].includes(tag(node)) || literal(attribute(node,'role')?.value)==='status' || attribute(node,'data-ui-nav-subtext'))) context.report({node:raw,messageId:'navCopy'});
      if(attribute(node,'data-ui-navbar')) {
        const seen=new Set<string>();
        for(const child of descendants(node)) {
          const action=literal(attribute(child,'data-ui-action')?.value);
          if(typeof action!=='string'||!action)continue;
          if(seen.has(action))context.report({node:raw,messageId:'duplicate',data:{action}});
          seen.add(action);
        }
      }
      if(tag(node)==='Dialog' && (/^(?:(?:app|application|user) )?(settings|preferences)$/i.test(String(literal(attribute(node,'title')?.value)??'')) || descendants(node).some(child=>['SettingsWorkspace','PreferencesSurface'].includes(tag(child))))) context.report({node:raw,messageId:'settings'});
      if(['Input','FileInput','input','textarea','SelectControl','select'].includes(tag(node))) {
        const properties=nodes(nodeOf(nodeOf(attribute(node,'style')?.value)?.expression)?.properties);
        if(properties.some(property=>name(property.key)==='fontWeight' && (literal(property.value)==='bold'||Number(literal(property.value))>500))) context.report({node:raw,messageId:'inputWeight'});
      }
      const brand = /\bclass(?:Name)?=["'](?:brand|app-brand|site-brand)["']|\b(?:styles|s)\.brand\b/.test(opening);
      if (brand && ['div', 'span'].includes(tag(node)) && !interactiveAncestor(node)) {
        let parent = nodeOf(node.parent);
        while (parent && !['header', 'nav'].includes(tag(parent))) parent = nodeOf(parent.parent);
        if (parent) context.report({ node: raw, messageId: 'home' });
      }
      if (tag(node) === 'p' && /\bclass(?:Name)?=["']subtitle["']|\b(?:styles|s)\.subtitle\b/.test(opening)
        && literal(attribute(node, 'data-ui-copy')?.value) !== 'essential' && !source.includes('role="alert"')) {
        let parent = nodeOf(node.parent);
        while (parent && tag(parent) !== 'details') parent = nodeOf(parent.parent);
        if (!parent) context.report({ node: raw, messageId: 'subtitle' });
      }
    };
    return { JSXElement: inspect, JSXFragment: inspect };
  },
};
