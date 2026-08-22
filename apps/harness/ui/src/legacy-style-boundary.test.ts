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
      visit(result.ast as unknown as AstNode, (node) => auditNode(node, filename, offenders));
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
      if (name === "classList" && readNodeType(readExpressionContainer(node.value as AstNode | undefined)) === "ObjectExpression") {
        offenders.push(`${relativeLocation(filename, node)} raw classList object`);
      }
    }
  }

  if (node.type === "CallExpression") {
    const callee = node.callee as AstNode | undefined;
    if (callee?.type === "Identifier" && callee.name === "cn") {
      for (const argument of (node.arguments as AstNode[] | undefined) ?? []) {
        for (const value of directClassStrings(argument)) {
          offenders.push(`${relativeLocation(filename, argument)} raw cn() class ${JSON.stringify(value)}`);
        }
      }
    }

    if (callee?.type === "MemberExpression") {
      const propertyName = readMemberPropertyName(callee);
      const object = callee.object as AstNode | undefined;
      const objectPropertyName = object?.type === "MemberExpression" ? readMemberPropertyName(object) : undefined;
      if (objectPropertyName === "classList" && ["add", "remove", "replace", "toggle"].includes(propertyName ?? "")) {
        offenders.push(`${relativeLocation(filename, node)} imperative classList.${propertyName}`);
      }
      if (propertyName === "setAttribute") {
        const args = (node.arguments as AstNode[] | undefined) ?? [];
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
  const node = value as AstNode;
  if (typeof node.type === "string") {
    callback(node);
  }
  for (const [key, child] of Object.entries(node)) {
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
      ...directClassStrings(node.consequent as AstNode | undefined),
      ...directClassStrings(node.alternate as AstNode | undefined),
    ];
  }
  if (node.type === "LogicalExpression") {
    return directClassStrings(node.right as AstNode | undefined);
  }
  if (node.type === "ArrayExpression") {
    return ((node.elements as AstNode[] | undefined) ?? []).flatMap((entry) => directClassStrings(entry));
  }
  if (node.type === "ObjectExpression") {
    return ((node.properties as AstNode[] | undefined) ?? []).flatMap((property) => {
      if (property.type !== "ObjectProperty") {
        return [];
      }
      const key = property.key as AstNode | undefined;
      const className = readString(key) ?? (key?.type === "Identifier" ? String(key.name ?? "") : "");
      return className.trim() ? [className] : [];
    });
  }
  return [];
}

function rawClassAttributeValue(value: unknown) {
  const node = value as AstNode | undefined;
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
  return node?.type === "JSXExpressionContainer" ? node.expression as AstNode | undefined : undefined;
}

function readString(node: AstNode | undefined): string | undefined {
  if (node?.type === "StringLiteral") {
    return String(node.value ?? "");
  }
  if (node?.type === "TemplateLiteral") {
    const quasis = (node.quasis as Array<{ value?: { raw?: string } }> | undefined) ?? [];
    const literalText = quasis.map((quasi) => quasi.value?.raw ?? "").join("");
    return literalText.trim() ? literalText : undefined;
  }
  return undefined;
}

function readJsxAttributeName(value: unknown) {
  const name = value as AstNode | undefined;
  return name?.type === "JSXIdentifier" ? String(name.name ?? "") : undefined;
}

function isClassAttribute(name: string) {
  return name === "class" || name === "className" || name === "classList" || /Class$/.test(name);
}

function readMemberPropertyName(member: AstNode) {
  const property = member.property as AstNode | undefined;
  if (property?.type === "Identifier") {
    return String(property.name ?? "");
  }
  return readString(property);
}

function readNodeType(node: AstNode | undefined) {
  return node?.type;
}

function relativeLocation(filename: string, node?: AstNode) {
  const relative = path.relative(sourceRoot, filename).replaceAll("\\", "/");
  const line = node?.loc?.start?.line;
  return line ? `${relative}:${line}` : relative;
}
