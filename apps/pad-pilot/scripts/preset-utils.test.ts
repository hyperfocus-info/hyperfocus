import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  MAX_PRESET_MANIFEST_BYTES,
  updateManifest,
  validatePresetId,
  writeBinaryFile,
  writePresetFile,
} from "./preset-utils";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("preset utilities", () => {
  it("rejects IDs that could escape a preset output directory", () => {
    expect(() => validatePresetId("../../outside")).toThrow("kebab-case");
    expect(() => validatePresetId("valid-preset")).not.toThrow();
  });

  it("serializes concurrent manifest updates without losing entries", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-preset-manifest-"));
    tempRoots.push(root);
    const manifest = path.join(root, "index.json");
    await Promise.all([
      updateManifest(manifest, { file: "one.preset", id: "one", name: "One" }),
      updateManifest(manifest, { file: "two.preset", id: "two", name: "Two" }),
    ]);
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { presets: Array<{ id: string }> };
    expect(parsed.presets.map((entry) => entry.id)).toEqual(["one", "two"]);
  });

  it("rejects oversized manifests before parsing them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-preset-manifest-limit-"));
    tempRoots.push(root);
    const manifest = path.join(root, "index.json");
    writeFileSync(manifest, Buffer.alloc(MAX_PRESET_MANIFEST_BYTES + 1, 0x20));

    await expect(updateManifest(manifest, { file: "one.preset", id: "one", name: "One" }))
      .rejects.toThrow("exceeds");
  });

  it("rejects unsafe entries already present in a manifest", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-preset-manifest-entry-"));
    tempRoots.push(root);
    const manifest = path.join(root, "index.json");
    writeFileSync(manifest, JSON.stringify({
      presets: [{ file: "../outside.preset", id: "outside", name: "Outside" }],
    }));

    await expect(updateManifest(manifest, { file: "one.preset", id: "one", name: "One" }))
      .rejects.toThrow("filename");
  });

  it("atomically replaces binary preset output", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-preset-binary-"));
    tempRoots.push(root);
    const file = path.join(root, "preset.preset");
    await writeBinaryFile(file, new Uint8Array([1, 2]));
    await writeBinaryFile(file, new Uint8Array([3, 4]));
    expect([...readFileSync(file)]).toEqual([3, 4]);
  });

  it("keeps a same-ID preset binary and manifest update under one lock", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-preset-pair-"));
    tempRoots.push(root);
    await Promise.all([
      writePresetFile(root, "shared.preset", new Uint8Array([1]), { file: "shared.preset", id: "shared", name: "First" }),
      writePresetFile(root, "shared.preset", new Uint8Array([2]), { file: "shared.preset", id: "shared", name: "Second" }),
    ]);
    const manifest = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8")) as { presets: Array<{ name: string }> };
    const binary = readFileSync(path.join(root, "shared.preset"))[0];
    expect([[1, "First"], [2, "Second"]]).toContainEqual([binary, manifest.presets[0]?.name]);
  });
});
