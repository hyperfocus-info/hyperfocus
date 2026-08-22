import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "./project.ts";
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
    const root = new MemoryDirectory("root");
    const evidence = await writeNeutralExportDirectory(root, "directory-test-neutral-export", bundle);
    expect(evidence).toEqual({ directoryName: "directory-test-neutral-export", fileCount: 2, bytesWritten: bundle.bytesWritten });
    expect([...root.children.get("directory-test-neutral-export")!.files.keys()].sort()).toEqual(["manifest.json", "project.json"]);
    await expect(writeNeutralExportDirectory(root, "directory-test-neutral-export", bundle)).rejects.toThrow("no files were overwritten");
  });

  test("exports embedded TypeScript as ordinary nested source files", async () => {
    const bundle = await createEditorNeutralExport(createPongProject("Script Escape"), []);
    expect(bundle.files.map((file) => file.path)).toEqual(["project.json", "manifest.json", "scripts/src/gameplay.ts"]);
    expect(bundle.manifest.scripts).toEqual([{ sourcePath: "src/gameplay.ts", path: "scripts/src/gameplay.ts", mimeType: "text/typescript", size: bundle.files[2].bytes.byteLength }]);
    const root = new MemoryDirectory("root");
    await writeNeutralExportDirectory(root, "script-escape", bundle);
    expect(root.children.get("script-escape")?.children.get("scripts")?.children.get("src")?.files.has("gameplay.ts")).toBe(true);
  });

  test("reports permission failures and removes incomplete output", async () => {
    const project = createDefaultProject("Denied");
    const bundle = await createEditorNeutralExport(project, []);
    const root = new MemoryDirectory("root");
    root.failWrite = true;
    await expect(writeNeutralExportDirectory(root, "denied-neutral-export", bundle)).rejects.toThrow("permission denied");
    expect(root.children.has("denied-neutral-export")).toBe(false);
  });
});

class MemoryDirectory implements NeutralDirectoryHandle {
  readonly children = new Map<string, MemoryDirectory>();
  readonly files = new Map<string, Uint8Array>();
  failWrite = false;

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    const existing = this.children.get(name);
    if (existing) return existing;
    if (!options?.create) throw new DOMException("missing", "NotFoundError");
    const directory = new MemoryDirectory(name);
    directory.failWrite = this.failWrite;
    this.children.set(name, directory);
    return directory;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!options?.create && !this.files.has(name)) throw new DOMException("missing", "NotFoundError");
    return {
      createWritable: async (): Promise<NeutralWritableFile> => ({
        write: async (bytes) => {
          if (this.failWrite) throw new DOMException("user blocked access", "NotAllowedError");
          this.files.set(name, new Uint8Array(bytes));
        },
        close: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string): Promise<void> {
    this.children.delete(name);
    this.files.delete(name);
  }
}
