import { isRecord } from "@hyperfocus/utilities/records";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_FILE = 0x06054b50;

type IndependentProjectFixture = {
  format: string;
  version: number;
  name: string;
  assets: Array<{ id: string; size: number; sha256: string }>;
};



function parseProjectFixture(text: string): IndependentProjectFixture {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.format !== "string" || typeof value.version !== "number"
    || typeof value.name !== "string" || !Array.isArray(value.assets)
    || !value.assets.every((asset) => isRecord(asset) && typeof asset.id === "string"
      && typeof asset.size === "number" && typeof asset.sha256 === "string")) {
    throw new Error("Independent project fixture has an invalid shape");
  }
  return {
    format: value.format,
    version: value.version,
    name: value.name,
    assets: value.assets.map((asset) => {
      if (!isRecord(asset) || typeof asset.id !== "string" || typeof asset.size !== "number" || typeof asset.sha256 !== "string") {
        throw new Error("Independent project fixture has an invalid asset");
      }
      return { id: asset.id, size: asset.size, sha256: asset.sha256 };
    }),
  };
}

function parseSchemaFixture(text: string) {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.$schema !== "string" || !isRecord(value.properties)
    || !isRecord(value.properties.format) || typeof value.properties.format.const !== "string"
    || !isRecord(value.properties.version) || typeof value.properties.version.const !== "number"
    || !Array.isArray(value.required) || !value.required.every((entry) => typeof entry === "string")) {
    throw new Error("Independent schema fixture has an invalid shape");
  }
  const format = value.properties.format;
  const version = value.properties.version;
  if (!isRecord(format) || typeof format.const !== "string" || !isRecord(version) || typeof version.const !== "number") {
    throw new Error("Independent schema fixture has invalid property declarations");
  }
  return {
    $schema: value.$schema,
    properties: { format: { const: format.const }, version: { const: version.const } },
    required: [...value.required],
  };
}

function u16(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function u32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function independentZipReader(bytes: Uint8Array) {
  const endOffset = bytes.byteLength - 22;
  if (endOffset < 0 || u32(bytes, endOffset) !== END_FILE) throw new Error("not a standard single-disk ZIP");
  const count = u16(bytes, endOffset + 10);
  const centralOffset = u32(bytes, endOffset + 16);
  const files = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== CENTRAL_FILE) throw new Error("invalid ZIP central record");
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const pathLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const path = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + pathLength));
    if (u32(bytes, localOffset) !== LOCAL_FILE) throw new Error("invalid ZIP local record");
    const localPathLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localPathLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const extracted = method === 0
      ? new Uint8Array(compressed)
      : method === 8
        ? new Uint8Array(inflateRawSync(compressed))
        : (() => { throw new Error(`unsupported independent ZIP method ${method}`); })();
    if (extracted.byteLength !== uncompressedSize) throw new Error("independent ZIP length mismatch");
    files.set(path, extracted);
    cursor += 46 + pathLength + extraLength + commentLength;
  }
  return files;
}

describe("independent portable project fixture", () => {
  test("recovers JSON and verifies standard ZIP objects using no engine project APIs", () => {
    const fixture = join(import.meta.dir, "fixtures", "independent-v2");
    const project = parseProjectFixture(readFileSync(join(fixture, "project.json"), "utf8"));
    const archive = new Uint8Array(Buffer.from(readFileSync(join(fixture, "assets.hfp.base64"), "utf8").trim(), "base64"));
    const files = independentZipReader(archive);

    expect(project.format).toBe("catalog-engine-editor-project");
    expect(project.version).toBe(2);
    expect(project.name).toBe("Independent Reader Fixture");
    expect(files.size).toBe(1);
    for (const asset of project.assets) {
      const path = `objects/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256.slice(2)}`;
      const bytes = files.get(path);
      expect(bytes, `missing ${asset.id} at ${path}`).toBeDefined();
      if (!bytes) throw new Error(`Missing ${asset.id} at ${path}`);
      expect(bytes?.byteLength).toBe(asset.size);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
    expect(new TextDecoder().decode(files.values().next().value)).toBe("portable fixture asset\n");
  });

  test("publishes a machine-readable schema for the same discriminator and version", () => {
    const schema = parseSchemaFixture(readFileSync(join(import.meta.dir, "..", "..", "docs", "schema", "editor-project-v2.schema.json"), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.properties.format.const).toBe("catalog-engine-editor-project");
    expect(schema.properties.version.const).toBe(2);
    expect(schema.required).toContain("assets");
    expect(schema.required).toContain("tilemap");
  });
});
