import { describe, expect, it } from "bun:test";
import { transformAsync } from "@babel/core";
import { readdir } from "node:fs/promises";
import path from "node:path";

type AstNode = {
  type: string;
  loc?: { start?: { line?: number } };
  [key: string]: unknown;
};

const sourceRoot = import.meta.dir;
const harnessRoot = path.resolve(sourceRoot, "..", "..");
const legacyStylesheet = path.join(sourceRoot, "legacy.css");
const ignoredSourceDirectories = new Set([".local", "dist", "node_modules"]);

describe("harness legacy style boundary", () => {
  it("does not ship or import the retired legacy stylesheet", async () => {
    expect(await Bun.file(legacyStylesheet).exists()).toBe(false);

    const offenders: string[] = [];
    for (const filename of await harnessSourceFiles()) {
      const source = await Bun.file(filename).text();
      if (/\b(?:import|require)\b[^\n;]*legacy\.css/.test(source)) {
        offenders.push(relativeLocation(filename));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps raw class utilities and imperative class state out of production TSX", async () => {
    const offenders: string[] = [];
    const filenames = (await productionSourceFiles()).filter((filename) => filename.endsWith(".tsx"));

    for (const filename of filenames) {
      const source = await Bun.file(filename).text();
      const result = await transformAsync(source, {
        ast: true,
        babelrc: false,
        code: false,
        configFile: false,
        filename,
        parserOpts: {
          plugins: ["jsx", "typescript"],
          sourceType: "module",
        },
      });
      if (!result?.ast) {
        offenders.push(`${relativeLocation(filename)} could not be parsed`);
        continue;
      }
      visit(result.ast, (node) => auditNode(node, filename, offenders));
    }

    expect(offenders).toEqual([]);
  });

  it("keeps translucent application surfaces adaptive to the active theme", async () => {
    const offenders: string[] = [];
    const filenames = (await productionSourceFiles()).filter(
      (filename) => /\.(?:styles|utilities)\.ts$/.test(filename) && !filename.endsWith("tutorial-overlay.styles.ts")
    );

    for (const filename of filenames) {
      const source = await Bun.file(filename).text();
      if (/rgb\(255 255 255 \/ 0\.\d+\)/.test(source)) {
        offenders.push(relativeLocation(filename));
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function productionSourceFiles(directory = sourceRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return productionSourceFiles(filename);
    }
    if (!/\.(?:css|ts|tsx)$/.test(entry.name) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) {
      return [];
    }
    return [filename];
  }));
  return nested.flat();
}

async function harnessSourceFiles(directory = harnessRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && ignoredSourceDirectories.has(entry.name)) {
      return [];
    }
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return harnessSourceFiles(filename);
    }
    return /\.(?:css|js|mjs|ts|tsx)$/.test(entry.name) ? [filename] : [];
  }));
  return nested.flat();
}

function auditNode(node: AstNode, filename: string, offenders: string[]) {
  if (node.type === "JSXAttribute") {
    const name = readJsxAttributeName(node.name);
    if (name && isClassAttribute(name)) {
      const rawValue = rawClassAttributeValue(node.value);
      if (rawValue !== undefined) {
        offenders.push(`${relativeLocation(filename, node)} raw ${name}=${JSON.stringify(rawValue)}`);
      }
      if (name === "classList" && readNodeType(readExpressionContainer(readAstNode(node.value))) === "ObjectExpression") {
        offenders.push(`${relativeLocation(filename, node)} raw classList object`);
      }
    }
  }

  if (node.type === "CallExpression") {
    const callee = readAstNode(node.callee);
    if (callee?.type === "Identifier" && callee.name === "cn") {
      for (const argument of readNodeArray(node.arguments)) {
        for (const value of directClassStrings(argument)) {
          offenders.push(`${relativeLocation(filename, argument)} raw cn() class ${JSON.stringify(value)}`);
        }
      }
    }

    if (callee?.type === "MemberExpression") {
      const propertyName = readMemberPropertyName(callee);
      const object = readAstNode(callee.object);
      const objectPropertyName = object?.type === "MemberExpression" ? readMemberPropertyName(object) : undefined;
      if (objectPropertyName === "classList" && ["add", "remove", "replace", "toggle"].includes(propertyName ?? "")) {
        offenders.push(`${relativeLocation(filename, node)} imperative classList.${propertyName}`);
      }
      if (propertyName === "setAttribute") {
        const args = readNodeArray(node.arguments);
        if (readString(args[0]) === "class" && readString(args[1])?.trim()) {
          offenders.push(`${relativeLocation(filename, node)} imperative class attribute`);
        }
      }
    }
  }
}

function visit(value: unknown, callback: (node: AstNode) => void) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      visit(entry, callback);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const node = readAstNode(value);
  if (node) callback(node);
  for (const [key, child] of Object.entries(value)) {
    if (key !== "loc" && key !== "start" && key !== "end") {
      visit(child, callback);
    }
  }
}

function directClassStrings(node: AstNode | undefined): string[] {
  if (!node) {
    return [];
  }
  const direct = readString(node);
  if (direct?.trim()) {
    return [direct];
  }
  if (node.type === "ConditionalExpression") {
    return [
      ...directClassStrings(readAstNode(node.consequent)),
      ...directClassStrings(readAstNode(node.alternate)),
    ];
  }
  if (node.type === "LogicalExpression") {
    return directClassStrings(readAstNode(node.right));
  }
  if (node.type === "ArrayExpression") {
    return readNodeArray(node.elements).flatMap((entry) => directClassStrings(entry));
  }
  if (node.type === "ObjectExpression") {
    return readNodeArray(node.properties).flatMap((property) => {
      if (property.type !== "ObjectProperty") {
        return [];
      }
      const key = readAstNode(property.key);
      const className = readString(key) ?? (key?.type === "Identifier" ? String(key.name ?? "") : "");
      return className.trim() ? [className] : [];
    });
  }
  return [];
}

function rawClassAttributeValue(value: unknown) {
  const node = readAstNode(value);
  if (!node) {
    return undefined;
  }
  if (node.type === "StringLiteral") {
    return String(node.value ?? "");
  }
  const expression = readExpressionContainer(node);
  return readString(expression);
}

function readExpressionContainer(node: AstNode | undefined) {
  return node?.type === "JSXExpressionContainer" ? readAstNode(node.expression) : undefined;
}

function readString(node: AstNode | undefined): string | undefined {
  if (node?.type === "StringLiteral") {
    return String(node.value ?? "");
  }
  if (node?.type === "TemplateLiteral") {
    const literalText = readNodeArray(node.quasis).map((quasi) => readTemplateRaw(quasi)).join("");
    return literalText.trim() ? literalText : undefined;
  }
  return undefined;
}

function readJsxAttributeName(value: unknown) {
  const name = readAstNode(value);
  return name?.type === "JSXIdentifier" ? String(name.name ?? "") : undefined;
}

function isClassAttribute(name: string) {
  return name === "class" || name === "className" || name === "classList" || /Class$/.test(name);
}

function readMemberPropertyName(member: AstNode) {
  const property = readAstNode(member.property);
  if (property?.type === "Identifier") {
    return String(property.name ?? "");
  }
  return readString(property);
}

function readNodeType(node: AstNode | undefined) {
  return node?.type;
}

function readAstNode(value: unknown): AstNode | undefined {
  return isAstNode(value) ? value : undefined;
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object" && typeof Reflect.get(value, "type") === "string");
}

function readNodeArray(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.filter(isAstNode) : [];
}

function readTemplateRaw(node: AstNode) {
  const value = node.value;
  if (!value || typeof value !== "object") return "";
  const raw = Reflect.get(value, "raw");
  return typeof raw === "string" ? raw : "";
}

function relativeLocation(filename: string, node?: AstNode) {
  const relative = path.relative(sourceRoot, filename).replaceAll("\\", "/");
  const line = node?.loc?.start?.line;
  return line ? `${relative}:${line}` : relative;
}
