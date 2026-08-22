import { describe, expect, test } from "bun:test";
import {
  HYPERFOCUS_ASSETS_PATH,
  HYPERFOCUS_PROJECT_PATH,
  canonicalHyperfocusJson,
  createHyperfocusProjectFiles,
  decodeHyperfocusProject,
  exportHyperfocusExchange,
  hashHyperfocusAsset,
  openHyperfocusProjectFiles,
  packHyperfocusAssets,
  unpackHyperfocusAssets,
} from "./index.ts";

describe("portable Hyperfocus projects", () => {
  test("uses exactly two conventional files and round-trips project data plus objects", async () => {
    expect([HYPERFOCUS_PROJECT_PATH, HYPERFOCUS_ASSETS_PATH]).toEqual([
      ".hyperfocus/project.json",
      ".hyperfocus/assets.hfp",
    ]);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = await hashHyperfocusAsset(bytes);
    const project = {
      format: "foreign-friendly-project",
      version: 1,
      assets: [
        { id: "hero", name: "hero.png", mimeType: "image/png", size: 4, sha256: hash },
        { id: "hero-copy", name: "hero-copy.png", mimeType: "image/png", size: 4, sha256: hash },
      ],
    };
    const files = await createHyperfocusProjectFiles(project, [
      { id: "hero", name: "hero.png", mimeType: "image/png", bytes },
      { id: "hero-copy", name: "hero-copy.png", mimeType: "image/png", bytes },
    ]);

    expect(new TextDecoder().decode(files.assetsArchive.subarray(0, 2))).toBe("PK");
    const restored = await openHyperfocusProjectFiles<typeof project>(files.projectJson, files.assetsArchive);
    expect(restored.project).toEqual(project);
    expect(restored.objects.map((object) => [object.sha256, [...object.bytes]])).toEqual([[hash, [1, 2, 3, 4]]]);
    expect(restored.assets.map((asset) => asset.id)).toEqual(["hero", "hero-copy"]);
  });

  test("keeps project JSON engine-neutral and deterministic", () => {
    const encoded = canonicalHyperfocusJson({ z: 1, nested: { b: true, a: "first" }, a: 2 });
    expect(encoded).toBe('{"a":2,"nested":{"a":"first","b":true},"z":1}\n');
    expect(decodeHyperfocusProject<Record<string, unknown>>(encoded)).toEqual({ a: 2, nested: { a: "first", b: true }, z: 1 });
  });

  test("deduplicates content and is deterministic regardless of input order", async () => {
    const first = await packHyperfocusAssets([
      { id: "z", name: "z.bin", bytes: new Uint8Array([1, 2]) },
      { id: "a", name: "a.bin", bytes: new Uint8Array([1, 2]) },
    ]);
    const second = await packHyperfocusAssets([
      { id: "a", name: "a.bin", bytes: new Uint8Array([1, 2]) },
      { id: "z", name: "z.bin", bytes: new Uint8Array([1, 2]) },
    ]);
    expect(first).toEqual(second);
    expect((await unpackHyperfocusAssets(first)).length).toBe(1);
  });

  test("uses standard ZIP signatures and stored entries for an independent-reader baseline", async () => {
    const source = new Uint8Array([9, 8, 7]);
    const hash = await hashHyperfocusAsset(source);
    const archive = await packHyperfocusAssets([
      { id: "a", name: "a.bin", bytes: source },
    ], { compression: "none" });
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // standard ZIP store method
    const pathLength = view.getUint16(26, true);
    const path = new TextDecoder().decode(archive.subarray(30, 30 + pathLength));
    expect(path).toBe(`objects/sha256/${hash.slice(0, 2)}/${hash.slice(2)}`);
    expect(archive.subarray(30 + pathLength, 30 + pathLength + source.byteLength)).toEqual(source);
    expect(view.getUint32(archive.byteLength - 22, true)).toBe(0x06054b50);
    expect(await unpackHyperfocusAssets(archive)).toHaveLength(1);
  });

  test("auto compression keeps the smaller lossless ZIP representation", async () => {
    const compressed = await packHyperfocusAssets([
      { id: "repeated", name: "repeated.bin", bytes: new Uint8Array(1024).fill(42) },
    ]);
    const stored = await packHyperfocusAssets([
      { id: "tiny", name: "tiny.bin", bytes: new Uint8Array([1]) },
    ]);
    expect(new DataView(compressed.buffer, compressed.byteOffset).getUint16(8, true)).toBe(8);
    expect(new DataView(stored.buffer, stored.byteOffset).getUint16(8, true)).toBe(0);
  });

  test("rejects unsafe JSON and malformed or corrupted archives", async () => {
    expect(() => canonicalHyperfocusJson({ value: Number.NaN })).toThrow("must be finite");
    expect(() => canonicalHyperfocusJson({ value: undefined })).toThrow("cannot contain undefined");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalHyperfocusJson(cyclic)).toThrow("cannot contain cycles");

    const archive = await packHyperfocusAssets([{ id: "data", name: "data.bin", bytes: new Uint8Array([4, 5, 6, 7]) }], { compression: "none" });
    const corrupt = new Uint8Array(archive);
    corrupt[100] ^= 0xff;
    await expect(unpackHyperfocusAssets(corrupt)).rejects.toThrow();
    await expect(unpackHyperfocusAssets(new Uint8Array([1, 2, 3]))).rejects.toThrow("no valid ZIP end record");
  });

  test("enforces caller-owned archive, asset, and expansion limits", async () => {
    await expect(packHyperfocusAssets([
      { id: "a", name: "a", bytes: new Uint8Array() },
      { id: "b", name: "b", bytes: new Uint8Array([1]) },
    ], { maxAssets: 1 })).rejects.toThrow("asset limit 1");

    const archive = await packHyperfocusAssets([{ id: "a", name: "a", bytes: new Uint8Array(100) }]);
    await expect(unpackHyperfocusAssets(archive, { maxArchiveBytes: archive.byteLength - 1 })).rejects.toThrow("archive exceeds");
    await expect(unpackHyperfocusAssets(archive, { maxUnpackedBytes: 20 })).rejects.toThrow("unpacked byte limit");
    await expect(createHyperfocusProjectFiles({
      assets: [{ id: "missing", name: "missing.bin", mimeType: "application/octet-stream", size: 1, sha256: "0".repeat(64) }],
    })).rejects.toThrow("object that was not provided");
  });

  test("exports a neutral interchange tree only on explicit request", async () => {
    const bytes = new Uint8Array([7, 8]);
    const sha256 = await hashHyperfocusAsset(bytes);
    const exchange = exportHyperfocusExchange({
      project: { title: "Portable" },
      assets: [{ id: "hero", name: "hero.png", mimeType: "image/png", sha256, bytes }],
    });
    expect(exchange.map((file) => file.path)).toEqual(["project.json", "assets/hero--hero.png"]);
  });
});
