import ts from 'typescript';
import { binding, descendants, enclosingComponent, finding, imported, unwrap } from './syntax';
import { controlAllowsSpread, controlAttributes } from './controls';

const shared = new Set(['workspace', 'selection', 'currentScope', 'reportScope', 'refresh', 'controller', 'session', 'store']);
const control = new Set(['children', 'value', 'defaultValue', 'checked', 'disabled', 'required', 'readOnly', 'name', 'id',
  'label', 'title', 'description', 'placeholder', 'type', 'class', 'classList', 'style', 'ref', 'onChange', 'onInput',
  'onClick', 'onBlur', 'onFocus', 'onKeyDown', 'onSubmit', 'size', 'variant', 'options', 'ariaLabel', 'describedBy']);

export function incoming(node: ts.Node, seen = new Set<ts.Node>()): boolean {
  node = unwrap(node);
  if (seen.has(node)) return false;
  const next = new Set(seen); next.add(node);
  if (ts.isIdentifier(node)) {
    const declaration = binding(node);
    if (declaration && ts.isParameter(declaration)) {
      const owner = declaration.parent;
      // Render callbacks' row parameters are not component props.
      const name = ts.isFunctionDeclaration(owner) ? owner.name?.text
        : (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) && ts.isVariableDeclaration(owner.parent)
          && ts.isIdentifier(owner.parent.name) ? owner.parent.name.text : undefined;
      return !!name && /^[A-Z]/.test(name);
    }
    return !!declaration && ts.isVariableDeclaration(declaration) && !!declaration.initializer && incoming(declaration.initializer, next);
  }
  if (ts.isObjectLiteralExpression(node)) return node.properties.some(property =>
    ts.isPropertyAssignment(property) ? incoming(property.initializer, next)
      : ts.isShorthandPropertyAssignment(property) ? incoming(property.name, next)
        : ts.isSpreadAssignment(property) && incoming(property.expression, next));
  if (ts.isArrayLiteralExpression(node)) return node.elements.some(element => incoming(element, next));
  if (ts.isSpreadElement(node)) return incoming(node.expression, next);
  return ts.isPropertyAccessExpression(node) ? incoming(node.expression, next)
    : ts.isElementAccessExpression(node) ? incoming(node.expression, next)
    : ts.isCallExpression(node) && !node.arguments.length ? incoming(node.expression, next) : false;
}

function spreadInput(node: ts.Expression) {
  const value = unwrap(node);
  const root = ts.isPropertyAccessExpression(value) ? value.expression : value;
  if (!ts.isIdentifier(root)) return;
  const declaration = binding(root);
  if (!declaration || !ts.isParameter(declaration) || !ts.isIdentifier(declaration.name)) return;
  return { parameter: declaration, property: ts.isPropertyAccessExpression(value) ? value.name.text : undefined };
}

function featureType(node: ts.Node | undefined, source: ts.SourceFile, seen = new Set<ts.Node>()): boolean {
  if (!node || seen.has(node)) return false;
  const next = new Set(seen); next.add(node);
  return [node, ...descendants(node)].some(part => {
    if ((ts.isPropertySignature(part) || ts.isMethodSignature(part))
      && (ts.isIdentifier(part.name) || ts.isStringLiteral(part.name)) && shared.has(part.name.text)) return true;
    if (ts.isTypeReferenceNode(part) && ts.isIdentifier(part.typeName)) {
      const name = part.typeName.text;
      const declaration = source.statements.find(statement => (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name.text === name);
      return featureType(declaration, source, next);
    }
    if (ts.isTypeQueryNode(part) && ts.isIdentifier(part.exprName)) {
      const declaration = binding(part.exprName);
      if (declaration && ts.isFunctionDeclaration(declaration)) return featureType(declaration.parameters[0]?.type, source, next);
    }
    return false;
  });
}

export function propFindings(source: ts.SourceFile) {
  return descendants(source).flatMap(node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return [];
    const tag = node.tagName.getText(source);
    if (ts.isIdentifier(node.tagName) && /^[a-z]/.test(tag)) return [];
    const target = imported(node.tagName);
    // Reusable controls own their value/event API; framework control-flow nodes
    // and provider values are not feature relay layers.
    const leaf = controlAttributes(source.fileName, target, tag);
    return node.attributes.properties.flatMap(attribute => {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const input = spreadInput(attribute.expression);
        if (input && (input.property !== undefined || !featureType(input.parameter.type, source))
          && controlAllowsSpread(source.fileName, target, tag, enclosingComponent(node), input.property)) return [];
        if (!incoming(attribute.expression)) return [];
        return [finding(source, attribute, 'no-prop-drilling', 'Do not relay incoming feature props with a spread. Consume scoped context/store state at the feature that needs it.')];
      }
      const name = attribute.name.getText(source);
      const nativeName = name.replace(/^attr:/, '');
      const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
      if (!expression || control.has(name) || leaf.includes(name) || nativeName.startsWith('aria-') || nativeName.startsWith('data-')) return [];
      if (!shared.has(name) && !incoming(expression)) return [];
      return [finding(source, attribute, 'no-prop-drilling', `Read feature state/action ${name} from scoped context or a store instead of forwarding it through JSX.`)];
    });
  });
}
