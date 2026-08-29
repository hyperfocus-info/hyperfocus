import { fromJson, toBinary, type DescMessage } from "@bufbuild/protobuf";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { cp, mkdtemp, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { snapshotDirectory } from "./directory-snapshot";
import { promoteStagedDirectory, withProcessLock } from "./directory-transaction";
import { readBoundedUtf8File } from "@hyperfocus/pad-pilot/bounded-file";

export const MAX_PRESET_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PRESET_MANIFEST_ENTRIES = 4096;
const presetManifestSchema = z.object({
  presets: z.array(z.object({
    file: z.string(),
    id: z.string(),
    name: z.string(),
  })).max(MAX_PRESET_MANIFEST_ENTRIES),
});

export type PresetManifestEntry = {
  file: string;
  id: string;
  name: string;
};

export type PresetManifest = {
  presets: PresetManifestEntry[];
};

export function requireArg(value: string | undefined, message: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

export function parseJsonArg<T extends object>(payload: string) {
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Preset JSON must be an object.");
  }
  return parsed as T;
}

export function parseProtoJson<T extends object>(schema: DescMessage, payload: object) {
  return fromJson(schema, payload as never) as T;
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function validatePresetId(value: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) {
    throw new Error("Preset ID must be 1-64 lowercase kebab-case characters.");
  }
  return value;
}

export function validatePresetName(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new Error("Preset name must be 1-128 characters.");
  }
  return normalized;
}

async function atomicWrite(filePath: string, contents: Uint8Array | string) {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeBinaryFile(filePath: string, bytes: Uint8Array) {
  ensureDir(path.dirname(filePath));
  await atomicWrite(filePath, bytes);
}

async function nextManifest(manifestPath: string, entry: PresetManifestEntry) {
  validateManifestEntry(entry);
  let manifest: PresetManifest = { presets: [] };
  const file = Bun.file(manifestPath);
  if (await file.exists()) {
    const contents = await readBoundedUtf8File(
      manifestPath,
      MAX_PRESET_MANIFEST_BYTES,
      "Preset manifest",
    );
    const parsed = presetManifestSchema.safeParse(JSON.parse(contents) as unknown);
    if (!parsed.success) {
      throw new Error(`Invalid preset manifest: ${manifestPath}`, { cause: parsed.error });
    }
    for (const existingEntry of parsed.data.presets) {
      validateManifestEntry(existingEntry);
    }
    manifest = parsed.data;
  }

  const nextEntries = manifest.presets.some((item) => item.id === entry.id)
    ? manifest.presets.map((item) => (item.id === entry.id ? entry : item))
    : [...manifest.presets, entry];
  nextEntries.sort((left, right) => left.name.localeCompare(right.name));
  return `${JSON.stringify({ presets: nextEntries }, null, 2)}\n`;
}

export async function updateManifest(manifestPath: string, entry: PresetManifestEntry) {
  const directory = path.dirname(path.resolve(manifestPath));
  ensureDir(directory);
  await withProcessLock(presetDirectoryLock(directory), async () => {
    await atomicWrite(manifestPath, await nextManifest(manifestPath, entry));
  });
}

export async function writePresetFile(directory: string, fileName: string, bytes: Uint8Array, entry: PresetManifestEntry) {
  const outputDirectory = path.resolve(directory);
  validatePresetId(entry.id);
  validatePresetName(entry.name);
  if (fileName !== `${entry.id}.preset` || entry.file !== fileName || path.basename(fileName) !== fileName) {
    throw new Error("Preset filename must match its validated preset ID.");
  }
  const parent = path.dirname(outputDirectory);
  ensureDir(parent);
  await withProcessLock(presetDirectoryLock(outputDirectory), async () => {
    if (existsSync(outputDirectory)) {
      const outputStat = lstatSync(outputDirectory);
      if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
        throw new Error("Preset output must be a real directory.");
      }
    }
    const staged = await mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.preset-stage-`));
    let stagedExists = true;
    try {
      if (existsSync(outputDirectory)) {
        await cp(outputDirectory, staged, { force: false, recursive: true });
      }
      const stagedManifest = path.join(staged, "index.json");
      const manifestText = await nextManifest(stagedManifest, entry);
      await atomicWrite(path.join(staged, fileName), bytes);
      await atomicWrite(stagedManifest, manifestText);
      const stagedSnapshot = await snapshotDirectory(staged);
      await promoteStagedDirectory(staged, outputDirectory, {
        validate: async (directory) => {
          if (await snapshotDirectory(directory) !== stagedSnapshot) {
            throw new Error("Staged preset directory changed before promotion.");
          }
        },
      });
      stagedExists = false;
    } finally {
      if (stagedExists) {
        await rm(staged, { force: true, recursive: true });
      }
    }
  });
}

function presetDirectoryLock(directory: string) {
  const resolved = path.resolve(directory);
  return path.join(path.dirname(resolved), `.${path.basename(resolved)}.padpilot-preset.lock`);
}

function validateManifestEntry(entry: PresetManifestEntry) {
  validatePresetId(entry.id);
  validatePresetName(entry.name);
  if (entry.file !== `${entry.id}.preset` || path.basename(entry.file) !== entry.file) {
    throw new Error("Preset manifest filename must match its validated preset ID.");
  }
}

export function binaryFromProtoJson(schema: DescMessage, payload: object) {
  return toBinary(schema, fromJson(schema, payload as never));
}
