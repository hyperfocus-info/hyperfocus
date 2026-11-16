import { packHyperfocusExchangeFiles } from "@hyperfocus/engine/project";
import { createNeutralExportBundle, type NeutralExportBundle, type NeutralExportProject } from "@hyperfocus/engine/project/neutral-export";
import type { EditorPortableAsset } from "./portable-project.ts";

export type NeutralWritableFile = {
  write(value: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

export type NeutralFileHandle = {
  createWritable(): Promise<NeutralWritableFile>;
};

export type NeutralDirectoryHandle = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<NeutralDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<NeutralFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
};

export type NeutralDirectoryExportEvidence = {
  directoryName: string;
  fileCount: number;
  bytesWritten: number;
};

export async function createEditorNeutralExport(
  project: NeutralExportProject,
  assets: readonly EditorPortableAsset[],
): Promise<NeutralExportBundle> {
  return createNeutralExportBundle(project, assets);
}

/** A deterministic, uncompressed standard ZIP for browsers without directory access. */
export async function createNeutralExportArchive(bundle: NeutralExportBundle): Promise<Uint8Array> {
  return packHyperfocusExchangeFiles(bundle.files, { compression: "none", maxFiles: 5_514, maxBytes: 1107296256 });
}

export function neutralExportBaseName(projectName: string): string {
  const safe = projectName.normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return `${safe || "game"}-neutral-export`;
}

/** Creates one fresh child directory and never opens or overwrites an existing export. */
export async function writeNeutralExportDirectory(
  root: NeutralDirectoryHandle,
  directoryName: string,
  bundle: NeutralExportBundle,
): Promise<NeutralDirectoryExportEvidence> {
  try {
    await root.getDirectoryHandle(directoryName);
    throw new Error(`Neutral export destination already exists: ${directoryName}. Rename or remove it; no files were overwritten.`);
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("Neutral export destination already exists:")) throw cause;
    if (!isMissingEntryError(cause)) {
      throw new Error(`Cannot check neutral export destination ${directoryName}: ${errorMessage(cause)}`);
    }
  }

  let directory: NeutralDirectoryHandle | undefined;
  try {
    directory = await root.getDirectoryHandle(directoryName, { create: true });
    for (const file of bundle.files) {
      const segments = file.path.split("/");
      const name = segments.pop()!;
      let target = directory;
      for (const segment of segments) target = await target.getDirectoryHandle(segment, { create: true });
      await writeFile(target, name, file.bytes);
    }
    return { directoryName, fileCount: bundle.fileCount, bytesWritten: bundle.bytesWritten };
  } catch (cause) {
    let cleaned = false;
    if (directory && root.removeEntry) {
      cleaned = await root.removeEntry(directoryName, { recursive: true }).then(() => true, () => false);
    }
    const disposition = cleaned ? "The incomplete directory was removed." : "An incomplete directory may remain; existing files were never overwritten.";
    throw new Error(`Neutral export could not write ${directoryName}: ${errorMessage(cause)} ${disposition}`);
  }
}

async function writeFile(directory: NeutralDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(new Uint8Array(bytes));
    await writable.close();
  } catch (cause) {
    await writable.abort?.().catch(() => undefined);
    throw cause;
  }
}

function isMissingEntryError(value: unknown): boolean {
  return value instanceof DOMException ? value.name === "NotFoundError" : value instanceof Error && value.name === "NotFoundError";
}

function errorMessage(value: unknown): string {
  if (value instanceof DOMException && value.name === "NotAllowedError") return `permission denied (${value.message || value.name})`;
  return value instanceof Error ? value.message : String(value);
}
