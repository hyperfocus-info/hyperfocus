import ts from 'typescript';

export function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (child: ts.Node) => { result.push(child); ts.forEachChild(child, visit); };
  ts.forEachChild(node, visit);
  return result;
}

export function unwrap(node: ts.Node): ts.Node {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node) ? unwrap(node.expression) : node;
}

export function bindingNames(node: ts.BindingName): string[] {
  return ts.isIdentifier(node) ? [node.text] : node.elements.flatMap(element => ts.isBindingElement(element) ? bindingNames(element.name) : []);
}

// Resolve local bindings without loading a project or following imports. This
// handles aliases/shadowing in functions and blocks, not arbitrary data flow.
export function binding(identifier: ts.Identifier): ts.Node | undefined {
  const name = identifier.text;
  for (let scope: ts.Node | undefined = identifier.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      const param = scope.parameters.find(parameter => bindingNames(parameter.name).includes(name));
      if (param) return param;
    }
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations.find(item => bindingNames(item.name).includes(name));
        if (declaration) return declaration;
      }
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const clause = statement.importClause;
        if (clause.name?.text === name) return clause;
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === name) return clause.namedBindings;
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const specifier = clause.namedBindings.elements.find(item => item.name.text === name);
          if (specifier) return specifier;
        }
      }
    }
  }
}

export function imported(node: ts.Node): { module: string; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const declaration = binding(node.expression);
    if (declaration && ts.isNamespaceImport(declaration)) {
      const owner = declaration.parent.parent;
      if (ts.isImportDeclaration(owner) && ts.isStringLiteral(owner.moduleSpecifier)) return { module: owner.moduleSpecifier.text, name: node.name.text };
    }
  }
  if (ts.isPropertyAccessExpression(node)) {
    const target = imported(node.expression);
    return target ? { module: target.module, name: `${target.name}.${node.name.text}` } : undefined;
  }
  if (!ts.isIdentifier(node)) return;
  const declaration = binding(node);
  if (declaration && ts.isImportSpecifier(declaration)) {
    const owner = declaration.parent.parent.parent;
    if (ts.isImportDeclaration(owner) && ts.isStringLiteral(owner.moduleSpecifier)) return { module: owner.moduleSpecifier.text, name: declaration.propertyName?.text ?? declaration.name.text };
  }
}

export function solidCall(node: ts.CallExpression, name: string) {
  const target = imported(node.expression);
  return target?.module === 'solid-js' && target.name === name;
}

export function functionValue(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.body) return { name: node.name?.text ?? '', node, body: node.body };
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const value = unwrap(node.initializer);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return { name: node.name.text, node: value, body: value.body };
  }
}

export function enclosingComponent(node: ts.Node): string | undefined {
  for (let owner: ts.Node | undefined = node.parent; owner; owner = owner.parent) {
    if (ts.isFunctionDeclaration(owner) && owner.name) return owner.name.text;
    if ((ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) && ts.isVariableDeclaration(owner.parent)
      && ts.isIdentifier(owner.parent.name)) return owner.parent.name.text;
  }
}

export function jsx(node: ts.Node) {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

export function finding(source: ts.SourceFile, node: ts.Node, rule: string, message: string) {
  const location = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { rule, line: location.line + 1, column: location.character + 1, message };
}
