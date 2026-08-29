import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      const alias = publicAliases.get(resolved);
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
      ExportNamedDeclaration: inspect,
      ExportAllDeclaration: inspect
    };
  }
};

export default {
  rules: { "canonical-imports": canonicalImports }
};

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
        const current = aliases.get(source);
        if (!current || alias.length < current.length) aliases.set(source, alias);
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
  return candidates.find((candidate) => existsSync(candidate));
}

function findOwner(filePath) {
  return packageRoots.find((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`)) ?? repoRoot;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
