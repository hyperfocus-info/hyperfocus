const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END = 0x06054b50;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_END_BYTES = 22;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE = 0;
const ZIP_DEFLATE = 8;
const ZIP_VERSION = 20;
const DEFAULT_MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_ASSETS = 10_000;
const MAX_JSON_DEPTH = 128;
const OBJECT_PREFIX = "objects/sha256/";

export const HYPERFOCUS_DIRECTORY = ".hyperfocus";
export const HYPERFOCUS_PROJECT_FILENAME = "project.json";
export const HYPERFOCUS_ASSETS_FILENAME = "assets.hfp";
export const HYPERFOCUS_PROJECT_PATH = `${HYPERFOCUS_DIRECTORY}/${HYPERFOCUS_PROJECT_FILENAME}`;
export const HYPERFOCUS_ASSETS_PATH = `${HYPERFOCUS_DIRECTORY}/${HYPERFOCUS_ASSETS_FILENAME}`;
export const HYPERFOCUS_PORTABLE_VERSION = 1;

export type HyperfocusCompression = "auto" | "deflate" | "none";

export type HyperfocusAssetInput = {
  id: string;
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
};

export type HyperfocusPortableAsset = {
  id: string;
  name: string;
  mimeType: string;
  sha256: string;
  bytes: Uint8Array;
};

export type HyperfocusPackedObject = {
  sha256: string;
  bytes: Uint8Array;
};

export type HyperfocusPortableProject<TProject = unknown> = {
  project: TProject;
  assets: HyperfocusPortableAsset[];
};

export type HyperfocusProjectFiles = {
  projectJson: Uint8Array;
  assetsArchive: Uint8Array;
};

export type HyperfocusOpenedProject<TProject = unknown> = {
  project: TProject;
  objects: HyperfocusPackedObject[];
  assets: HyperfocusPortableAsset[];
};

export type HyperfocusPackOptions = {
  compression?: HyperfocusCompression;
  maxAssets?: number;
  maxUnpackedBytes?: number;
};

export type HyperfocusUnpackOptions = {
  maxArchiveBytes?: number;
  maxAssets?: number;
  maxUnpackedBytes?: number;
  verifyHashes?: boolean;
};

export type HyperfocusExchangeFile = {
  path: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type HyperfocusExchangeArchiveOptions = {
  compression?: HyperfocusCompression;
  maxFiles?: number;
  maxBytes?: number;
};

type ZipSource = { path: string; bytes: Uint8Array };
type EncodedZipEntry = ZipSource & { compressed: Uint8Array; crc32: number; method: number; localOffset: number };
type ParsedZipEntry = { path: string; compressedSize: number; uncompressedSize: number; crc32: number; method: number; localOffset: number };

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let value = 0xffff_ffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  return (value ^ 0xffff_ffff) >>> 0;
}

function assertBoundedInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be a non-negative safe integer no greater than ${maximum}`);
  }
  return value;
}

function normalizeLimit(value: number | undefined, fallback: number, label: string) {
  return assertBoundedInteger(value ?? fallback, label);
}

function assertText(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string no longer than ${maxLength} characters`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeJson(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (depth > MAX_JSON_DEPTH) throw new Error(`portable project JSON exceeds maximum depth ${MAX_JSON_DEPTH}`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("portable project JSON numbers must be finite");
    return Object.is(value, -0) ? 0 : value;
  }
  if (!value || typeof value !== "object") throw new Error(`portable project JSON cannot contain ${typeof value}`);
  if (ancestors.has(value)) throw new Error("portable project JSON cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry, ancestors, depth + 1));
    if (!isPlainRecord(value)) throw new Error("portable project JSON may contain only plain objects and arrays");
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new Error(`portable project JSON property ${key} must not be an accessor`);
      result[key] = normalizeJson(descriptor.value, ancestors, depth + 1);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** Stable, newline-terminated JSON that stays readable and diffable without Hyperfocus. */
export function canonicalHyperfocusJson(value: unknown) {
  return `${JSON.stringify(normalizeJson(value))}\n`;
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array, label: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function encodeHyperfocusProject(project: unknown) {
  return utf8(canonicalHyperfocusJson(project));
}

export function decodeHyperfocusProject<TProject = unknown>(source: Uint8Array | string): TProject {
  const text = typeof source === "string" ? source : decodeUtf8(source, "Hyperfocus project");
  return normalizeJson(parseJson(text, "Hyperfocus project")) as TProject;
}

function concatBytes(chunks: readonly Uint8Array[], total: number) {
  assertBoundedInteger(total, "portable archive byte length", 0xffff_ffff);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== total) throw new Error("portable archive byte assembly length mismatch");
  return output;
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

export async function hashHyperfocusAsset(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array)) throw new Error("portable asset bytes must be Uint8Array");
  const owned = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned.buffer));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function objectPath(hash: string) {
  return `${OBJECT_PREFIX}${hash.slice(0, 2)}/${hash.slice(2)}`;
}

async function transform(bytes: Uint8Array, kind: "compress" | "decompress", maximum: number) {
  const stream = kind === "compress" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw");
  const reader = new Blob([new Uint8Array(bytes).buffer]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maximum) throw new Error(`portable archive expansion exceeds byte limit ${maximum}`);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return concatBytes(chunks, total);
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, true);
}

function readUint16(source: Uint8Array, offset: number) {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint16(offset, true);
}

function readUint32(source: Uint8Array, offset: number) {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(offset, true);
}

function assertZipPath(path: string) {
  assertText(path, "portable archive entry path", 512);
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`portable archive entry path is unsafe: ${path}`);
  }
}

async function encodeZip(sources: readonly ZipSource[], compression: HyperfocusCompression) {
  const entries: EncodedZipEntry[] = [];
  const localChunks: Uint8Array[] = [];
  let localOffset = 0;
  for (const source of sources) {
    assertZipPath(source.path);
    const pathBytes = utf8(source.path);
    const deflated = compression === "none" ? undefined : await transform(source.bytes, "compress", 0xffff_ffff);
    const useDeflate = deflated !== undefined && (compression === "deflate" || deflated.byteLength < source.bytes.byteLength);
    const compressed = useDeflate ? deflated : new Uint8Array(source.bytes);
    const method = useDeflate ? ZIP_DEFLATE : ZIP_STORE;
    const checksum = crc32(source.bytes);
    const header = new Uint8Array(ZIP_LOCAL_HEADER_BYTES + pathBytes.byteLength);
    writeUint32(header, 0, ZIP_LOCAL_FILE);
    writeUint16(header, 4, ZIP_VERSION);
    writeUint16(header, 6, ZIP_UTF8_FLAG);
    writeUint16(header, 8, method);
    writeUint32(header, 14, checksum);
    writeUint32(header, 18, compressed.byteLength);
    writeUint32(header, 22, source.bytes.byteLength);
    writeUint16(header, 26, pathBytes.byteLength);
    header.set(pathBytes, ZIP_LOCAL_HEADER_BYTES);
    entries.push({ ...source, compressed, crc32: checksum, method, localOffset });
    localChunks.push(header, compressed);
    localOffset += header.byteLength + compressed.byteLength;
    assertBoundedInteger(localOffset, "portable archive local data length", 0xffff_ffff);
  }

  const centralOffset = localOffset;
  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const pathBytes = utf8(entry.path);
    const header = new Uint8Array(ZIP_CENTRAL_HEADER_BYTES + pathBytes.byteLength);
    writeUint32(header, 0, ZIP_CENTRAL_FILE);
    writeUint16(header, 4, ZIP_VERSION);
    writeUint16(header, 6, ZIP_VERSION);
    writeUint16(header, 8, ZIP_UTF8_FLAG);
    writeUint16(header, 10, entry.method);
    writeUint32(header, 16, entry.crc32);
    writeUint32(header, 20, entry.compressed.byteLength);
    writeUint32(header, 24, entry.bytes.byteLength);
    writeUint16(header, 28, pathBytes.byteLength);
    writeUint32(header, 42, entry.localOffset);
    header.set(pathBytes, ZIP_CENTRAL_HEADER_BYTES);
    centralChunks.push(header);
    centralSize += header.byteLength;
  }
  const end = new Uint8Array(ZIP_END_BYTES);
  writeUint32(end, 0, ZIP_END);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, centralOffset);
  return concatBytes([...localChunks, ...centralChunks, end], centralOffset + centralSize + end.byteLength);
}

function parseZipDirectory(archive: Uint8Array, maxEntries: number) {
  if (archive.byteLength < ZIP_END_BYTES || readUint32(archive, archive.byteLength - ZIP_END_BYTES) !== ZIP_END) {
    throw new Error("portable asset archive has no valid ZIP end record");
  }
  const endOffset = archive.byteLength - ZIP_END_BYTES;
  if (readUint16(archive, endOffset + 4) !== 0 || readUint16(archive, endOffset + 6) !== 0 || readUint16(archive, endOffset + 20) !== 0) {
    throw new Error("portable asset archive uses unsupported multi-disk ZIP or comments");
  }
  const entriesOnDisk = readUint16(archive, endOffset + 8);
  const entryCount = readUint16(archive, endOffset + 10);
  if (entriesOnDisk !== entryCount || entryCount > maxEntries) throw new Error(`portable asset archive exceeds entry limit ${maxEntries}`);
  const centralSize = readUint32(archive, endOffset + 12);
  const centralOffset = readUint32(archive, endOffset + 16);
  if (centralOffset + centralSize !== endOffset) throw new Error("portable asset archive central directory layout is invalid");

  const entries: ParsedZipEntry[] = [];
  const paths = new Set<string>();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + ZIP_CENTRAL_HEADER_BYTES > endOffset || readUint32(archive, offset) !== ZIP_CENTRAL_FILE) {
      throw new Error(`portable asset archive central entry ${index} is invalid`);
    }
    const flags = readUint16(archive, offset + 8);
    const method = readUint16(archive, offset + 10);
    const pathLength = readUint16(archive, offset + 28);
    const extraLength = readUint16(archive, offset + 30);
    const commentLength = readUint16(archive, offset + 32);
    if (flags !== ZIP_UTF8_FLAG || (method !== ZIP_STORE && method !== ZIP_DEFLATE) || extraLength !== 0 || commentLength !== 0) {
      throw new Error(`portable asset archive central entry ${index} uses unsupported ZIP features`);
    }
    const next = offset + ZIP_CENTRAL_HEADER_BYTES + pathLength;
    if (next > endOffset) throw new Error(`portable asset archive central entry ${index} is truncated`);
    const path = decodeUtf8(archive.subarray(offset + ZIP_CENTRAL_HEADER_BYTES, next), `portable archive entry ${index} path`);
    assertZipPath(path);
    if (paths.has(path)) throw new Error(`duplicate portable archive entry: ${path}`);
    paths.add(path);
    entries.push({
      path,
      method,
      crc32: readUint32(archive, offset + 16),
      compressedSize: readUint32(archive, offset + 20),
      uncompressedSize: readUint32(archive, offset + 24),
      localOffset: readUint32(archive, offset + 42),
    });
    offset = next;
  }
  if (offset !== endOffset) throw new Error("portable asset archive central directory contains trailing data");
  return { entries, centralOffset };
}

async function decodeZipEntry(archive: Uint8Array, entry: ParsedZipEntry, maximum: number) {
  if (entry.uncompressedSize > maximum) throw new Error(`portable archive entry ${entry.path} exceeds byte limit ${maximum}`);
  const offset = entry.localOffset;
  if (offset + ZIP_LOCAL_HEADER_BYTES > archive.byteLength || readUint32(archive, offset) !== ZIP_LOCAL_FILE) {
    throw new Error(`portable archive entry ${entry.path} local header is invalid`);
  }
  const pathLength = readUint16(archive, offset + 26);
  const extraLength = readUint16(archive, offset + 28);
  const dataOffset = offset + ZIP_LOCAL_HEADER_BYTES + pathLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (readUint16(archive, offset + 6) !== ZIP_UTF8_FLAG || readUint16(archive, offset + 8) !== entry.method || extraLength !== 0 || dataEnd > archive.byteLength) {
    throw new Error(`portable archive entry ${entry.path} local data is invalid`);
  }
  const localPath = decodeUtf8(archive.subarray(offset + ZIP_LOCAL_HEADER_BYTES, offset + ZIP_LOCAL_HEADER_BYTES + pathLength), "portable archive local path");
  if (localPath !== entry.path || readUint32(archive, offset + 14) !== entry.crc32 || readUint32(archive, offset + 18) !== entry.compressedSize || readUint32(archive, offset + 22) !== entry.uncompressedSize) {
    throw new Error(`portable archive entry ${entry.path} headers disagree`);
  }
  const compressed = archive.subarray(dataOffset, dataEnd);
  const bytes = entry.method === ZIP_DEFLATE ? await transform(compressed, "decompress", maximum) : new Uint8Array(compressed);
  if (bytes.byteLength !== entry.uncompressedSize || crc32(bytes) !== entry.crc32) throw new Error(`portable archive entry ${entry.path} checksum or length mismatch`);
  return bytes;
}

/** Creates `assets.hfp`, a deterministic standard ZIP of content-addressed objects. */
export async function packHyperfocusAssets(assetInputs: readonly HyperfocusAssetInput[] = [], options: HyperfocusPackOptions = {}) {
  const maxAssets = normalizeLimit(options.maxAssets, DEFAULT_MAX_ASSETS, "portable asset maxAssets");
  const maxUnpackedBytes = normalizeLimit(options.maxUnpackedBytes, DEFAULT_MAX_UNPACKED_BYTES, "portable asset maxUnpackedBytes");
  if (assetInputs.length > maxAssets) throw new Error(`portable asset archive exceeds asset limit ${maxAssets}`);
  const ids = new Set<string>();
  const blobs = new Map<string, Uint8Array>();
  let unpackedBytes = 0;
  for (const input of assetInputs) {
    assertText(input.id, "portable asset id", 256);
    assertText(input.name, `portable asset ${input.id} name`, 1024);
    if (ids.has(input.id)) throw new Error(`duplicate portable asset id: ${input.id}`);
    ids.add(input.id);
    if (!(input.bytes instanceof Uint8Array)) throw new Error(`portable asset ${input.id} bytes must be Uint8Array`);
    const bytes = new Uint8Array(input.bytes);
    const hash = await hashHyperfocusAsset(bytes);
    const existing = blobs.get(hash);
    if (existing && !bytesEqual(existing, bytes)) throw new Error(`SHA-256 collision while packing asset ${input.id}`);
    if (!existing) {
      blobs.set(hash, bytes);
      unpackedBytes += bytes.byteLength;
      if (unpackedBytes > maxUnpackedBytes) throw new Error(`portable asset archive exceeds unpacked byte limit ${maxUnpackedBytes}`);
    }
  }
  const sources = [...blobs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hash, bytes]) => ({ path: objectPath(hash), bytes }));
  return encodeZip(sources, options.compression ?? "auto");
}

/** Reads and verifies every content-addressed object in `assets.hfp`. */
export async function unpackHyperfocusAssets(archive: Uint8Array, options: HyperfocusUnpackOptions = {}) {
  if (!(archive instanceof Uint8Array)) throw new Error("portable asset archive must be Uint8Array");
  const maxArchiveBytes = normalizeLimit(options.maxArchiveBytes, DEFAULT_MAX_ARCHIVE_BYTES, "portable asset maxArchiveBytes");
  const maxUnpackedBytes = normalizeLimit(options.maxUnpackedBytes, DEFAULT_MAX_UNPACKED_BYTES, "portable asset maxUnpackedBytes");
  const maxAssets = normalizeLimit(options.maxAssets, DEFAULT_MAX_ASSETS, "portable asset maxAssets");
  if (archive.byteLength > maxArchiveBytes) throw new Error(`portable asset archive exceeds byte limit ${maxArchiveBytes}`);
  const { entries, centralOffset } = parseZipDirectory(archive, maxAssets);
  const objects: HyperfocusPackedObject[] = [];
  let totalUnpacked = 0;
  for (const entry of entries) {
    const match = /^objects\/sha256\/([0-9a-f]{2})\/([0-9a-f]{62})$/.exec(entry.path);
    if (!match) throw new Error(`portable asset archive entry is not content-addressed: ${entry.path}`);
    const hash = `${match[1]}${match[2]}`;
    totalUnpacked += entry.uncompressedSize;
    if (totalUnpacked > maxUnpackedBytes) throw new Error(`portable asset archive exceeds unpacked byte limit ${maxUnpackedBytes}`);
    const bytes = await decodeZipEntry(archive, entry, entry.uncompressedSize);
    if (options.verifyHashes !== false && await hashHyperfocusAsset(bytes) !== hash) throw new Error(`portable asset blob hash mismatch: ${hash}`);
    objects.push({ sha256: hash, bytes });
  }
  let expectedLocalOffset = 0;
  for (const entry of [...entries].sort((a, b) => a.localOffset - b.localOffset)) {
    if (entry.localOffset !== expectedLocalOffset) throw new Error("portable asset archive local entries are not contiguous");
    expectedLocalOffset += ZIP_LOCAL_HEADER_BYTES + utf8(entry.path).byteLength + entry.compressedSize;
  }
  if (expectedLocalOffset !== centralOffset) throw new Error("portable asset archive local data has trailing bytes");
  return objects;
}

export async function createHyperfocusProjectFiles(
  project: unknown,
  assetInputs: readonly HyperfocusAssetInput[] = [],
  options: HyperfocusPackOptions = {},
): Promise<HyperfocusProjectFiles> {
  const portableProject = normalizeJson(project);
  if (!isPlainRecord(portableProject)) throw new Error("portable project root must be a JSON object");
  if (!Array.isArray(portableProject.assets)) {
    if (assetInputs.length) throw new Error("portable project must contain an assets catalog before binary assets can be packed");
  } else {
    const records = new Map<string, Record<string, unknown>>();
    const packedHashes = new Set<string>();
    for (const [index, candidate] of portableProject.assets.entries()) {
      if (!isPlainRecord(candidate)) throw new Error(`portable project asset record ${index} is invalid`);
      assertText(candidate.id, `portable project asset record ${index} id`, 256);
      if (records.has(candidate.id)) throw new Error(`duplicate portable project asset record id: ${candidate.id}`);
      records.set(candidate.id, candidate);
    }
    for (const input of assetInputs) {
      const record = records.get(input.id);
      if (!record) throw new Error(`portable binary asset ${input.id} has no project.json asset record`);
      record.name = input.name;
      record.mimeType = input.mimeType || "application/octet-stream";
      record.size = input.bytes.byteLength;
      const hash = await hashHyperfocusAsset(input.bytes);
      record.sha256 = hash;
      packedHashes.add(hash);
    }
    for (const record of records.values()) {
      if (record.sha256 === undefined) continue;
      assertText(record.sha256, `portable project asset ${String(record.id)} SHA-256`, 64);
      if (!packedHashes.has(record.sha256)) {
        throw new Error(`portable project asset ${String(record.id)} references an object that was not provided`);
      }
    }
  }
  return { projectJson: encodeHyperfocusProject(portableProject), assetsArchive: await packHyperfocusAssets(assetInputs, options) };
}

function resolveProjectAssetCatalog(project: unknown, objects: readonly HyperfocusPackedObject[]) {
  if (!isPlainRecord(project) || !Array.isArray(project.assets)) {
    if (objects.length) throw new Error("project.json has no asset catalog for packed objects");
    return [];
  }
  const objectByHash = new Map(objects.map((object) => [object.sha256, object.bytes]));
  const referencedHashes = new Set<string>();
  const assets: HyperfocusPortableAsset[] = [];
  const ids = new Set<string>();
  for (const [index, record] of project.assets.entries()) {
    if (!isPlainRecord(record) || record.sha256 === undefined) continue;
    assertText(record.id, `project.json asset ${index} id`, 256);
    assertText(record.name, `project.json asset ${record.id} name`, 1024);
    assertText(record.mimeType, `project.json asset ${record.id} MIME type`, 256);
    assertText(record.sha256, `project.json asset ${record.id} SHA-256`, 64);
    if (!/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error(`project.json asset ${record.id} SHA-256 is invalid`);
    if (ids.has(record.id)) throw new Error(`duplicate project.json asset id: ${record.id}`);
    ids.add(record.id);
    const bytes = objectByHash.get(record.sha256);
    if (!bytes) throw new Error(`asset pack is missing ${record.name} (${record.id})`);
    const expectedSize = record.size ?? record.byteLength;
    assertBoundedInteger(expectedSize as number, `project.json asset ${record.id} size`, DEFAULT_MAX_UNPACKED_BYTES);
    if (bytes.byteLength !== expectedSize) throw new Error(`packed asset ${record.id} has a different size than project.json`);
    referencedHashes.add(record.sha256);
    assets.push({ id: record.id, name: record.name, mimeType: record.mimeType, sha256: record.sha256, bytes: new Uint8Array(bytes) });
  }
  if (referencedHashes.size !== objects.length) throw new Error("asset pack contains objects not referenced by project.json");
  return assets;
}

export async function openHyperfocusProjectFiles<TProject = unknown>(
  projectJson: Uint8Array | string,
  assetsArchive: Uint8Array,
  options: HyperfocusUnpackOptions = {},
): Promise<HyperfocusOpenedProject<TProject>> {
  const [project, objects] = await Promise.all([
    Promise.resolve(decodeHyperfocusProject<TProject>(projectJson)),
    unpackHyperfocusAssets(assetsArchive, options),
  ]);
  return { project, objects, assets: resolveProjectAssetCatalog(project, objects) };
}

/** Compatibility alias; returns the agreed two-file representation. */
export const packHyperfocusProject = createHyperfocusProjectFiles;
/** Compatibility alias; opens the agreed two-file representation. */
export const unpackHyperfocusProject = openHyperfocusProjectFiles;

function safeExchangeName(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 160) || "asset.bin";
}

/** Produces ordinary JSON and asset files for migration to any other engine. */
export function exportHyperfocusExchange(project: HyperfocusPortableProject): HyperfocusExchangeFile[] {
  const files: HyperfocusExchangeFile[] = [{ path: "project.json", mimeType: "application/json", bytes: encodeHyperfocusProject(project.project) }];
  const usedPaths = new Set(files.map((file) => file.path));
  for (const asset of [...project.assets].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = `assets/${safeExchangeName(asset.id)}--${safeExchangeName(asset.name)}`;
    let path = base;
    let suffix = 2;
    while (usedPaths.has(path)) path = `${base}-${suffix++}`;
    usedPaths.add(path);
    files.push({ path, mimeType: asset.mimeType, bytes: new Uint8Array(asset.bytes) });
  }
  return files;
}

/** Packs ordinary exchange files into one deterministic standard ZIP fallback. */
export async function packHyperfocusExchangeFiles(
  files: readonly HyperfocusExchangeFile[],
  options: HyperfocusExchangeArchiveOptions = {},
): Promise<Uint8Array> {
  const maxFiles = normalizeLimit(options.maxFiles, DEFAULT_MAX_ASSETS + 2, "exchange archive maxFiles");
  const maxBytes = normalizeLimit(options.maxBytes, DEFAULT_MAX_UNPACKED_BYTES, "exchange archive maxBytes");
  if (files.length > maxFiles) throw new Error(`exchange archive exceeds file limit ${maxFiles}`);
  const paths = new Set<string>();
  let total = 0;
  const sources = [...files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => {
    assertZipPath(file.path);
    if (paths.has(file.path)) throw new Error(`duplicate exchange archive path: ${file.path}`);
    paths.add(file.path);
    if (!(file.bytes instanceof Uint8Array)) throw new Error(`exchange archive file ${file.path} bytes must be Uint8Array`);
    total += file.bytes.byteLength;
    if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error(`exchange archive exceeds byte limit ${maxBytes}`);
    return { path: file.path, bytes: new Uint8Array(file.bytes) };
  });
  return encodeZip(sources, options.compression ?? "none");
}
