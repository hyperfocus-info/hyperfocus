import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { createPongProject } from "./starter-projects.ts";
import {
  createEditorNeutralExport,
  createNeutralExportArchive,
  neutralExportBaseName,
  writeNeutralExportDirectory,
  type NeutralDirectoryHandle,
  type NeutralWritableFile,
} from "./neutral-export.ts";

describe("editor neutral export", () => {
  test("creates deterministic ordinary files and archive with exact diagnostics", async () => {
    const project = createDefaultProject("Portable Test");
    const bundleA = await createEditorNeutralExport(project, []);
    const bundleB = await createEditorNeutralExport(project, []);
    const archiveA = await createNeutralExportArchive(bundleA);
    const archiveB = await createNeutralExportArchive(bundleB);
    expect(bundleA.files.map((file) => file.path)).toEqual(["project.json", "manifest.json"]);
    expect(bundleA.manifest.diagnostics.map(({ code, pointer }) => ({ code, pointer }))).toEqual(bundleB.manifest.diagnostics.map(({ code, pointer }) => ({ code, pointer })));
    expect(archiveA).toEqual(archiveB);
    expect([...archiveA.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(neutralExportBaseName(" Portable Test! ")).toBe("portable-test-neutral-export");
  });

  test("writes a fresh directory and refuses overwrite transactionally", async () => {
    const project = createDefaultProject("Directory Test");
    const bundle = await createEditorNeutralExport(project, []);
    const root = createMemoryDirectory("root");
    const evidence = await writeNeutralExportDirectory(root, "directory-test-neutral-export", bundle);
    expect(evidence).toEqual({ directoryName: "directory-test-neutral-export", fileCount: 2, bytesWritten: bundle.bytesWritten });
    expect([...root.children.get("directory-test-neutral-export")!.files.keys()].sort()).toEqual(["manifest.json", "project.json"]);
    await expect(writeNeutralExportDirectory(root, "directory-test-neutral-export", bundle)).rejects.toThrow("no files were overwritten");
  });

  test("exports embedded TypeScript as ordinary nested source files", async () => {
    const bundle = await createEditorNeutralExport(createPongProject("Script Escape"), []);
    expect(bundle.files.map((file) => file.path)).toEqual(["project.json", "manifest.json", "scripts/src/gameplay.ts"]);
    expect(bundle.manifest.scripts).toEqual([{ sourcePath: "src/gameplay.ts", path: "scripts/src/gameplay.ts", mimeType: "text/typescript", size: bundle.files[2].bytes.byteLength }]);
    const root = createMemoryDirectory("root");
    await writeNeutralExportDirectory(root, "script-escape", bundle);
    expect(root.children.get("script-escape")?.children.get("scripts")?.children.get("src")?.files.has("gameplay.ts")).toBe(true);
  });

  test("reports permission failures and removes incomplete output", async () => {
    const project = createDefaultProject("Denied");
    const bundle = await createEditorNeutralExport(project, []);
    const root = createMemoryDirectory("root");
    root.failWrite = true;
    await expect(writeNeutralExportDirectory(root, "denied-neutral-export", bundle)).rejects.toThrow("permission denied");
    expect(root.children.has("denied-neutral-export")).toBe(false);
  });
});

type MemoryDirectory = NeutralDirectoryHandle & {
  children: Map<string, MemoryDirectory>;
  files: Map<string, Uint8Array>;
  failWrite: boolean;
};

function createMemoryDirectory(name: string): MemoryDirectory {
  const directory: MemoryDirectory = {
    name,
    children: new Map(),
    files: new Map(),
    failWrite: false,
    async getDirectoryHandle(childName, options) {
      const existing = directory.children.get(childName);
      if (existing) return existing;
      if (!options?.create) throw new DOMException("missing", "NotFoundError");
      const child = createMemoryDirectory(childName);
      child.failWrite = directory.failWrite;
      directory.children.set(childName, child);
      return child;
    },
    async getFileHandle(fileName, options) {
      if (!options?.create && !directory.files.has(fileName)) throw new DOMException("missing", "NotFoundError");
      return {
        createWritable: async (): Promise<NeutralWritableFile> => ({
          write: async (bytes) => {
            if (directory.failWrite) throw new DOMException("user blocked access", "NotAllowedError");
            directory.files.set(fileName, new Uint8Array(bytes));
          },
          close: async () => undefined,
        }),
      };
    },
    async removeEntry(childName) {
      directory.children.delete(childName);
      directory.files.delete(childName);
    },
  };
  return directory;
}
