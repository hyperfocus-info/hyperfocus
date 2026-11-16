import { bytesToBase64 } from "../../proto/base64";
import {  type PresetSummary } from "./fx-types";
import { readBoundedStreamBytes } from "@hyperfocus/pad-pilot/bounded-stream";

export type BundledFxPresetManifestEntry = PresetSummary & {
  file: string;
};

export type BundledFxPresetManifest = {
  presets: BundledFxPresetManifestEntry[];
};

export type BundledFxPreset = BundledFxPresetManifestEntry & {
  payloadBase64: string;
};

export const BUNDLED_FX_PRESET_MANIFEST_URL = "/fx/chains/presets/index.json";
export const BUNDLED_FX_PRESET_FILE_ROOT = "/fx/chains/presets";
export const MAX_BUNDLED_FX_PRESETS = 64;
const MAX_BUNDLED_FX_MANIFEST_BYTES = 131072;
const MAX_BUNDLED_FX_PRESET_BYTES = 524288;
const MAX_BUNDLED_FX_PRESET_ID_LENGTH = 128;
const MAX_BUNDLED_FX_PRESET_NAME_LENGTH = 256;
const MAX_BUNDLED_FX_PRESET_DESCRIPTION_LENGTH = 512;
const MAX_BUNDLED_FX_PRESET_METADATA_ITEMS = 32;
const MAX_BUNDLED_FX_PRESET_METADATA_ITEM_LENGTH = 96;

function contentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readBoundedBytes(response: Response, maxBytes: number) {
  const declaredLength = contentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new Error(`Bundled FX preset response exceeds ${maxBytes} bytes.`);
  }
  return readBoundedStreamBytes(response.body, {
    label: "Bundled FX preset response",
    maxBytes,
  });
}

function stringProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null) {
    return "";
  }
  const propertyValue = Reflect.get(value, property);
  return typeof propertyValue === "string" ? propertyValue : "";
}

function stringArrayProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const propertyValue = Reflect.get(value, property);
  if (!Array.isArray(propertyValue) || propertyValue.length > MAX_BUNDLED_FX_PRESET_METADATA_ITEMS) {
    return [];
  }
  return propertyValue.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }
    const normalized = item.trim();
    return normalized && normalized.length <= MAX_BUNDLED_FX_PRESET_METADATA_ITEM_LENGTH ? [normalized] : [];
  });
}

function categoryProperty(value: unknown) {
  const category = stringProperty(value, "category");
  switch (category) {
    case "creative":
    case "era":
    case "system":
    case "utility":
      return category;
    default:
      return undefined;
  }
}

function normalizeManifestEntries(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const entries = Reflect.get(value, "presets");
  if (!Array.isArray(entries) || entries.length > MAX_BUNDLED_FX_PRESETS) {
    return [];
  }

  const normalized: BundledFxPresetManifestEntry[] = [];
  const seenIds = new Set<string>();
  for (const entry of entries) {
    const id = stringProperty(entry, "id").trim();
    const name = stringProperty(entry, "name").trim();
    const file = stringProperty(entry, "file").trim();
    const description = stringProperty(entry, "description").trim();
    const category = categoryProperty(entry);
    const intensity = stringProperty(entry, "intensity").trim();
    const jobs = stringArrayProperty(entry, "jobs");
    const sources = stringArrayProperty(entry, "sources");
    const tags = stringArrayProperty(entry, "tags");
    if (
      !id ||
      id.length > MAX_BUNDLED_FX_PRESET_ID_LENGTH ||
      !name ||
      name.length > MAX_BUNDLED_FX_PRESET_NAME_LENGTH ||
      description.length > MAX_BUNDLED_FX_PRESET_DESCRIPTION_LENGTH ||
      !/^[a-zA-Z0-9._-]+\.preset$/.test(file) ||
      seenIds.has(id)
    ) {
      continue;
    }
    seenIds.add(id);
    normalized.push({
      file,
      id,
      name,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(intensity && intensity.length <= MAX_BUNDLED_FX_PRESET_METADATA_ITEM_LENGTH ? { intensity } : {}),
      ...(jobs.length > 0 ? { jobs } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    });
  }
  return normalized;
}

export async function loadBundledFxPresets(fetchImpl: typeof fetch = fetch, signal?: AbortSignal) {
  const manifestResponse = await fetchImpl(BUNDLED_FX_PRESET_MANIFEST_URL, { signal });
  if (!manifestResponse.ok) {
    return [];
  }

  let entries: BundledFxPresetManifestEntry[];
  try {
    const manifestBytes = await readBoundedBytes(manifestResponse, MAX_BUNDLED_FX_MANIFEST_BYTES);
    entries = normalizeManifestEntries(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)));
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return [];
  }

  const bundledPresets: BundledFxPreset[] = [];
  for (const entry of entries) {
    const presetResponse = await fetchImpl(`${BUNDLED_FX_PRESET_FILE_ROOT}/${entry.file}`, { signal });
    if (!presetResponse.ok) {
      continue;
    }

    const contentType = presetResponse.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      continue;
    }

    try {
      const bytes = await readBoundedBytes(presetResponse, MAX_BUNDLED_FX_PRESET_BYTES);
      bundledPresets.push({
        ...entry,
        payloadBase64: bytesToBase64(bytes),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
    }
  }
  return bundledPresets;
}

export function mergeFxPresetSummaries(bundled: readonly PresetSummary[], host: readonly PresetSummary[]) {
  const merged: PresetSummary[] = [];
  const seen = new Set<string>();
  for (const preset of [...bundled, ...host]) {
    if (seen.has(preset.id)) {
      continue;
    }
    seen.add(preset.id);
    merged.push(preset);
  }
  return merged;
}
