import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNumericLiteralRule } from "./numeric-literals/eslint";
import { attentionRule } from "./ui-attention/eslint";
import { foundationRule } from "./ui-attention/foundation";
import { createStandardsRule } from "./code-standards/eslint";
import { explicitMapPresence } from './code-standards/map-presence';
import ts from 'typescript';
import { padPilotModuleRule } from "@hyperfocus/pad-pilot-app/module-ui-rule";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = collectManifestPaths();
const packageRoots = manifests
  .map((manifestPath) => path.dirname(manifestPath))
  .sort((left, right) => right.length - left.length);
const publicAliases = collectPublicAliases();

const canonicalImports = {
  meta: {
    type: "problem",
    docs: { description: "Use public @hyperfocus aliases across ownership boundaries" },
    fixable: "code",
    schema: [],
    messages: {
      canonical: "Replace this cross-owner relative import with {{alias}}.",
      ambiguous: "Choose the owning public export explicitly; this module is exported by {{aliases}}.",
      private: "This relative import crosses an ownership boundary, but {{target}} has no public @hyperfocus export."
    }
  },
  create(context) {
    function inspect(node) {
      const source = node.source;
      if (!source || typeof source.value !== "string" || !source.value.startsWith(".")) return;
      const filePath = context.filename;
      if (!path.isAbsolute(filePath)) return;
      const resolved = resolveModule(filePath, source.value);
      if (!resolved || findOwner(filePath) === findOwner(resolved)) return;
      const aliases = publicAliases.get(resolved);
      if (aliases?.size > 1) {
        context.report({ node: source, messageId: "ambiguous", data: { aliases: [...aliases].sort().join(", ") } });
        return;
      }
      const alias = aliases?.values().next().value;
      if (alias) {
        context.report({
          node: source,
          messageId: "canonical",
          data: { alias },
          fix: (fixer) => fixer.replaceText(source, JSON.stringify(alias))
        });
        return;
      }
      context.report({
        node: source,
        messageId: "private",
        data: { target: path.relative(repoRoot, resolved).replaceAll("\\", "/") }
      });
    }

    return {
      ImportDeclaration: inspect,
      ImportExpression: inspect,
      ExportNamedDeclaration: inspect,
      ExportAllDeclaration: inspect
    };
  }
};

export default {
  rules: {
    "padpilot-module": padPilotModuleRule,
    "explicit-map-presence": explicitMapPresence,
    "utility-modules": createStandardsRule('utility-modules'),
    "canonical-utilities": createStandardsRule('canonical-utilities'),
    "no-prop-drilling": createStandardsRule('no-prop-drilling'),
    "solid-list-rendering": createStandardsRule('solid-list-rendering'),
    "no-derived-signal-effect": createStandardsRule('no-derived-signal-effect'),
    "attention": attentionRule,
    "ui-foundation": foundationRule,
    "canonical-imports": canonicalImports,
    "direct-implementation-imports": {
      meta: {
        type: 'problem', fixable: 'code', schema: [],
        docs: { description: 'Import internal implementation owners directly, without convenience barrels' },
        messages: { barrel: 'Import the implementation owner directly instead of this internal barrel.' }
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            if (!node.source.value.startsWith('.') || !path.isAbsolute(context.filename)) return;
            const target = resolveModule(context.filename, node.source.value);
            if (!target || findOwner(target) !== findOwner(context.filename) || !barrelStatements(target)) return;
            const imports = new Map();
            let fixable = node.specifiers.length > 0;
            for (const specifier of node.specifiers) {
              if (specifier.type !== 'ImportSpecifier') { fixable = false;break; }
              const name = specifier.imported.name ?? specifier.imported.value;
              const owner = exportedOwner(target, name);
              if (!owner) { fixable = false;break; }
              const source = owner.module ?? relativeSpecifier(context.filename, owner.file);
              const entries = imports.get(source) ?? [];
              const type = node.importKind === 'type' || specifier.importKind === 'type' ? 'type ' : '';
              entries.push(`${type}${owner.name}${owner.name === specifier.local.name ? '' : ` as ${specifier.local.name}`}`);
              imports.set(source, entries);
            }
            context.report({ node: node.source, messageId: 'barrel', ...(fixable ? {
              fix: fixer => fixer.replaceText(node, [...imports].map(([source, entries]) => `import { ${entries.join(', ')} } from ${JSON.stringify(source)};`).join('\n'))
            } : {}) });
          }
        };
      }
    },
    "computed-numeric-literals": createNumericLiteralRule()
  }
};

const parsedModules = new Map();
function parseModule(file) {
  let source = parsedModules.get(file);
  if (!source) {
    source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    parsedModules.set(file, source);
  }
  return source;
}
function barrelStatements(file) {
  const { statements } = parseModule(file);
  return statements.length && statements.every(statement => ts.isExportDeclaration(statement) && statement.moduleSpecifier) ? statements : undefined;
}
function relativeSpecifier(from, to) {
  const relative = path.relative(path.dirname(from), to).replaceAll('\\', '/').replace(/\.(?:ts|tsx)$/, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
}
function exportedOwner(file, name, seen = new Set()) {
  if (seen.has(file)) return undefined;
  const next = new Set(seen);next.add(file);
  const statements = barrelStatements(file);
  if (!statements) {
    const exported = parseModule(file).statements.some(statement =>
      ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some(element => element.name.text === name)
      || ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      && (statement.name?.text === name || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name)));
    return exported ? { file, name } : undefined;
  }
  const owners = [];
  for (const statement of statements) {
    const specifier = statement.exportClause?.elements?.find(element => element.name.text === name);
    if (statement.exportClause && !specifier) continue;
    const targetName = specifier?.propertyName?.text ?? name;
    const source = statement.moduleSpecifier.text;
    if (!source.startsWith('.')) {
      if (specifier) owners.push({ module: source, name: targetName });
      continue;
    }
    const target = resolveModule(file, source);
    if (!target) continue;
    const owner = exportedOwner(target, targetName, next);
    if (owner) owners.push(owner);
  }
  return owners.length === 1 ? owners[0] : undefined;
}

function collectManifestPaths() {
  const roots = ["packages", "apps", "packages/engine/examples"];
  const paths = [];
  for (const root of roots) {
    const absolute = path.join(repoRoot, root);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(absolute, entry.name, "package.json");
      if (existsSync(manifestPath)) paths.push(manifestPath);
    }
  }
  return paths;
}

function collectPublicAliases() {
  const aliases = new Map();
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@hyperfocus/") || !isRecord(manifest.exports)) continue;
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const alias = subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
      for (const rawTarget of collectStrings(target)) {
        const source = publishedSourcePath(manifestPath, rawTarget);
        if (!source) continue;
        const current = aliases.get(source) ?? new Set();
        current.add(alias);
        aliases.set(source, current);
      }
    }
  }
  return aliases;
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(collectStrings);
}

function publishedSourcePath(manifestPath, rawTarget) {
  const root = path.dirname(manifestPath);
  const target = rawTarget.replace(/^\.\//, "");
  if (/^src\/.*\.(?:[cm]?[jt]s|[jt]sx|css)$/i.test(target)) return path.resolve(root, target);
  if (/^dist\/src\/.*\.d\.(?:[cm]?ts|tsx)$/i.test(target)) {
    return path.resolve(root, target.replace(/^dist\/src\//, "src/").replace(/\.d\.(?:[cm]?ts|tsx)$/i, ".ts"));
  }
  return undefined;
}

function resolveModule(filePath, specifier) {
  const raw = path.resolve(path.dirname(filePath), specifier);
  const extensionless = raw.replace(/\.(?:[cm]?js|jsx)$/i, "");
  const candidates = [
    raw,
    extensionless,
    ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${extensionless}${extension}`),
    ...["index.ts", "index.tsx", "index.mts", "index.cts", "index.js", "index.jsx"].map((name) => path.join(extensionless, name))
  ];
  return candidates.find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
}

function findOwner(filePath) {
  return packageRoots.find((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`)) ?? repoRoot;
}

import { isRecord } from '@hyperfocus/utilities/records';
