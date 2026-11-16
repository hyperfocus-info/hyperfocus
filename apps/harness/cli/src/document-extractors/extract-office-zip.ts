import { isRecord } from "@hyperfocus/utilities/records";
import { XMLParser } from "fast-xml-parser";
import { Buffer } from "node:buffer";
import { posix as pathPosix } from "node:path";
import { Readable } from "node:stream";
import { Entry,fromBuffer,ZipFile } from "yauzl";
import type { DocumentExtractionOptions } from "./types";
import { createResourceBudget,type ResourceBudget } from "./types";

type XmlValue = string | number | boolean | null | XmlValue[] | XmlNode;
export type XmlNode = {
  [key: string]: XmlValue;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false
});

const defaultMaxArchiveEntries = 2048;
const defaultMaxExpandedBytes = 33554432;
const defaultMaxEntryBytes = 16777216;
const defaultMaxCompressionRatio = 200;
const defaultMaxDurationMs = 10_000;
const defaultMaxOutputChars = 1_000_000;

export type OfficeZipReadOptions = DocumentExtractionOptions & {
  includeEntry?: (normalizedPath: string) => boolean;
};

export async function readOfficeZipEntries(
  input: ArrayBuffer | Uint8Array | Buffer,
  options: OfficeZipReadOptions = {}
) {
  const inputBuffer = toBuffer(input);
  const maxInputBytes = options.maxInputBytes ?? 16777216;
  if (inputBuffer.byteLength > maxInputBytes) {
    throw new RangeError(`Office archive exceeded the ${maxInputBytes.toLocaleString("en-US")} byte input budget`);
  }

  const budget = createResourceBudget({
    maxItems: options.maxItems ?? defaultMaxArchiveEntries,
    maxBytes: options.maxExpandedBytes ?? defaultMaxExpandedBytes,
    maxDurationMs: options.maxDurationMs ?? defaultMaxDurationMs,
    signal: options.signal
  });
  const maxEntryBytes = options.maxEntryBytes ?? defaultMaxEntryBytes;
  const maxCompressionRatio = options.maxCompressionRatio ?? defaultMaxCompressionRatio;
  validatePositiveLimit(maxEntryBytes, "maxEntryBytes");
  validatePositiveLimit(maxCompressionRatio, "maxCompressionRatio");

  const zipFile = await openZipBuffer(inputBuffer);
  const entries = new Map<string, Buffer>();

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      zipFile.once("error", finish);
      zipFile.once("end", () => finish());
      zipFile.on("entry", (entry: Entry) => {
        try {
          budget.consumeItems(1, "Office archive");
        } catch (error) {
          finish(error);
          return;
        }

        const normalizedPath = normalizeZipPath(entry.fileName);
        if (entry.fileName.endsWith("/") || (options.includeEntry && !options.includeEntry(normalizedPath))) {
          zipFile.readEntry();
          return;
        }

        try {
          validateEntry(entry, normalizedPath, maxEntryBytes, maxCompressionRatio);
          budget.consumeBytes(entry.uncompressedSize, `Office archive entry ${normalizedPath}`);
        } catch (error) {
          finish(error);
          return;
        }

        void readEntryBuffer(zipFile, entry, maxEntryBytes, budget)
          .then((buffer) => {
            if (!settled) {
              entries.set(normalizedPath, buffer);
              zipFile.readEntry();
            }
          })
          .catch(finish);
      });

      try {
        budget.check("Office archive");
        zipFile.readEntry();
      } catch (error) {
        finish(error);
      }
    });
  } finally {
    zipFile.close();
  }

  return entries;
}

export function parseXmlDocument(input: Buffer | string) {
  const xmlText = typeof input === "string" ? input : input.toString("utf8");
  const parsed: unknown = xmlParser.parse(xmlText);
  if (!isXmlNode(parsed)) {
    throw new Error("XML document did not parse into an object");
  }

  return parsed;
}

export function normalizeExtractedText(text: string) {
  const normalizedLines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
  const collapsed = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return collapsed;
}

export function enforceExtractedTextBudget(text: string, options: DocumentExtractionOptions = {}) {
  const maxOutputChars = options.maxOutputChars ?? defaultMaxOutputChars;
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 0) {
    throw new RangeError("maxOutputChars must be a non-negative safe integer");
  }
  if (text.length > maxOutputChars) {
    throw new RangeError(
      `Extracted document text exceeded the ${maxOutputChars.toLocaleString("en-US")} character output budget`
    );
  }
  return text;
}

export function normalizeZipPath(input: string) {
  const normalized = pathPosix.normalize(input.replace(/\\/g, "/"));
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
}

export function resolveZipPath(basePath: string, target: string) {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) {
    return normalizeZipPath(normalizedTarget);
  }

  return normalizeZipPath(pathPosix.join(pathPosix.dirname(basePath), normalizedTarget));
}

export function toArray<T>(value: T | T[] | undefined) {
  if (value === undefined) {
    const empty: T[] = [];
    return empty;
  }

  return Array.isArray(value) ? value : [value];
}

export function getChildObject(node: XmlNode | undefined, key: string) {
  const value = node?.[key];
  return isXmlNode(value) ? value : undefined;
}

export function getChildObjects(node: XmlNode | undefined, key: string) {
  return toArray(node?.[key]).filter(isXmlNode);
}

export function getNodeText(node: unknown): string {
  if (node === undefined || node === null) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((entry) => getNodeText(entry)).join("");
  }

  if (!isRecord(node)) return "";
  const directText = node["#text"];
  const textParts: string[] = [];
  if (typeof directText === "string" || typeof directText === "number" || typeof directText === "boolean") {
    textParts.push(String(directText));
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "#text") {
      continue;
    }

    textParts.push(getNodeText(value));
  }

  return textParts.join("");
}


function isXmlNode(value: unknown): value is XmlNode {
  return isRecord(value) && Object.values(value).every(isXmlValue);
}

function isXmlValue(value: unknown): value is XmlValue {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || (Array.isArray(value) ? value.every(isXmlValue) : isXmlNode(value));
}

export function getAttribute(node: XmlNode | undefined, key: string) {
  const value = node?.[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function collectByLocalName(node: unknown, localName: string, results: string[] = []) {
  if (node === undefined || node === null) {
    return results;
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return results;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectByLocalName(entry, localName, results);
    }
    return results;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "#text") {
      continue;
    }

    if (key === localName || key.endsWith(`:${localName}`)) {
      const text = getNodeText(value).trim();
      if (text) {
        results.push(text);
      }
    }

    collectByLocalName(value, localName, results);
  }

  return results;
}

function openZipBuffer(buffer: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Could not open zip archive"));
        return;
      }

      resolve(zipFile);
    });
  });
}

function readEntryBuffer(zipFile: ZipFile, entry: Entry, maxEntryBytes: number, budget: ResourceBudget) {
  return new Promise<Buffer>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Could not read ${entry.fileName}`));
        return;
      }

      void readStreamToBuffer(stream, maxEntryBytes, budget, normalizeZipPath(entry.fileName))
        .then(resolve)
        .catch(reject);
    });
  });
}

function readStreamToBuffer(stream: Readable, maxBytes: number, budget: ResourceBudget, entryPath: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) {
        stream.destroy();
        reject(error);
      } else {
        resolve(Buffer.concat(chunks, bytes));
      }
    };

    stream.on("data", (chunk) => {
      try {
        budget.check(`Office archive entry ${entryPath}`);
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > maxBytes) {
          throw new RangeError(
            `Office archive entry ${entryPath} exceeded the ${maxBytes.toLocaleString("en-US")} byte entry budget`
          );
        }
        chunks.push(buffer);
      } catch (error) {
        finish(error);
      }
    });
    stream.once("end", () => finish());
    stream.once("error", finish);
  });
}

function validateEntry(entry: Entry, path: string, maxEntryBytes: number, maxCompressionRatio: number) {
  if (entry.uncompressedSize > maxEntryBytes) {
    throw new RangeError(
      `Office archive entry ${path} exceeded the ${maxEntryBytes.toLocaleString("en-US")} byte entry budget`
    );
  }

  const compressionRatio = entry.compressedSize === 0
    ? entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY
    : entry.uncompressedSize / entry.compressedSize;
  if (compressionRatio > maxCompressionRatio) {
    throw new RangeError(
      `Office archive entry ${path} exceeded the ${maxCompressionRatio.toLocaleString("en-US")}:1 compression-ratio budget`
    );
  }
}

function validatePositiveLimit(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number`);
  }
}

function toBuffer(input: ArrayBuffer | Uint8Array | Buffer) {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input);
  }

  return Buffer.from(input);
}
