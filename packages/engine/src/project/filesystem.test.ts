import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHyperfocusProjectFiles } from "./index.ts";
import {
  HYPERFOCUS_PREVIOUS_DIRECTORY,
  HYPERFOCUS_STAGING_DIRECTORY,
  readHyperfocusProjectPair,
  recoverHyperfocusProjectPair,
  writeHyperfocusProjectPair,
} from "./filesystem.ts";

const roots: string[] = [];

type NamedProject = Record<string, unknown> & { name: string };

function parseNamedProject(value: unknown): NamedProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project must be an object");
  const name = Reflect.get(value, "name");
  if (typeof name !== "string") throw new Error("Project name must be a string");
  return { ...value, name };
}

const namedProjectOptions = { parseProject: parseNamedProject };

afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (absolute.startsWith(resolve(tmpdir()) + "\\") || absolute.startsWith(resolve(tmpdir()) + "/")) {
      rmSync(absolute, { recursive: true, force: true });
    }
  }
});

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), "hyperfocus-pair-"));
  roots.push(root);
  return root;
}

async function pair(name: string, byte: number) {
  return createHyperfocusProjectFiles({
    format: "fixture-project",
    version: 1,
    name,
    assets: [{ id: "asset", name: "asset.bin", mimeType: "application/octet-stream", size: 1 }],
  }, [{ id: "asset", name: "asset.bin", mimeType: "application/octet-stream", bytes: new Uint8Array([byte]) }]);
}

describe("crash-safe Hyperfocus pair persistence", () => {
  test("writes and replaces the canonical directory as a validated pair", async () => {
    const root = temporaryProject();
    const first = await writeHyperfocusProjectPair(root, await pair("first", 1));
    expect(first.replacedExisting).toBe(false);
    expect(existsSync(join(root, ".hyperfocus", "project.json"))).toBe(true);
    expect(existsSync(join(root, ".hyperfocus", "assets.hfp"))).toBe(true);

    const second = await writeHyperfocusProjectPair(root, await pair("second", 2));
    expect(second.replacedExisting).toBe(true);
    const opened = await readHyperfocusProjectPair(root, namedProjectOptions);
    expect(opened.project.name).toBe("second");
    expect([...opened.assets[0].bytes]).toEqual([2]);
    expect(existsSync(join(root, HYPERFOCUS_STAGING_DIRECTORY))).toBe(false);
    expect(existsSync(join(root, HYPERFOCUS_PREVIOUS_DIRECTORY))).toBe(false);
  });

  test("keeps the old pair when interrupted after staging but before backup", async () => {
    const root = temporaryProject();
    await writeHyperfocusProjectPair(root, await pair("old", 3));
    await expect(writeHyperfocusProjectPair(root, await pair("new", 4), {
      recoverOnError: false,
      onPhase(phase) { if (phase === "prepared") throw new Error("simulated crash"); },
    })).rejects.toThrow("simulated crash");
    expect(existsSync(join(root, HYPERFOCUS_STAGING_DIRECTORY))).toBe(true);

    const evidence = await recoverHyperfocusProjectPair(root);
    expect(evidence.status).toBe("canonical");
    expect((await readHyperfocusProjectPair(root, namedProjectOptions)).project.name).toBe("old");
    expect(existsSync(join(root, HYPERFOCUS_STAGING_DIRECTORY))).toBe(false);
  });

  test("completes the new pair when interrupted after moving the old pair aside", async () => {
    const root = temporaryProject();
    await writeHyperfocusProjectPair(root, await pair("old", 5));
    await expect(writeHyperfocusProjectPair(root, await pair("new", 6), {
      recoverOnError: false,
      onPhase(phase) { if (phase === "backup-installed") throw new Error("simulated power loss"); },
    })).rejects.toThrow("simulated power loss");
    expect(existsSync(join(root, ".hyperfocus"))).toBe(false);
    expect(existsSync(join(root, HYPERFOCUS_STAGING_DIRECTORY))).toBe(true);
    expect(existsSync(join(root, HYPERFOCUS_PREVIOUS_DIRECTORY))).toBe(true);

    const evidence = await recoverHyperfocusProjectPair(root);
    expect(evidence.status).toBe("completed");
    const opened = await readHyperfocusProjectPair(root, namedProjectOptions);
    expect(opened.project.name).toBe("new");
    expect([...opened.assets[0].bytes]).toEqual([6]);
  });

  test("accepts the committed pair and removes the leftover previous directory", async () => {
    const root = temporaryProject();
    await writeHyperfocusProjectPair(root, await pair("old", 7));
    await expect(writeHyperfocusProjectPair(root, await pair("new", 8), {
      recoverOnError: false,
      onPhase(phase) { if (phase === "committed") throw new Error("simulated termination"); },
    })).rejects.toThrow("simulated termination");
    const evidence = await recoverHyperfocusProjectPair(root);
    expect(evidence.status).toBe("canonical");
    expect(evidence.removedArtifacts).toContain(join(root, HYPERFOCUS_PREVIOUS_DIRECTORY));
    expect((await readHyperfocusProjectPair(root, namedProjectOptions)).project.name).toBe("new");
  });

  test("validates a proposed pair before touching canonical storage", async () => {
    const root = temporaryProject();
    await writeHyperfocusProjectPair(root, await pair("safe", 9));
    const corrupt = await pair("corrupt", 10);
    corrupt.assetsArchive = new Uint8Array(corrupt.assetsArchive);
    corrupt.assetsArchive[0] = 0;
    await expect(writeHyperfocusProjectPair(root, corrupt)).rejects.toThrow();
    expect((await readHyperfocusProjectPair(root, namedProjectOptions)).project.name).toBe("safe");
    expect(existsSync(join(root, HYPERFOCUS_STAGING_DIRECTORY))).toBe(false);
  });

  test("refuses unrecoverable transaction artifacts instead of deleting them", async () => {
    const root = temporaryProject();
    const stage = join(root, HYPERFOCUS_STAGING_DIRECTORY);
    mkdirSync(stage);
    writeFileSync(join(stage, "project.json"), "not json");
    writeFileSync(join(stage, "assets.hfp"), "not zip");
    await expect(recoverHyperfocusProjectPair(root)).rejects.toThrow("No valid Hyperfocus project pair");
    expect(existsSync(stage)).toBe(true);
    await expect(writeHyperfocusProjectPair(root, await pair("replacement", 11))).rejects.toThrow("transaction is pending");
    expect(existsSync(stage)).toBe(true);
  });
});
