import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { finished } from "node:stream/promises";

const maxBoundaryBytes = 200;
const maxHeaderBytes = 16384;
const maxVersionBytes = 128;
const maxChangelogBytes = 32768;
const maxBundleFilenameBytes = 256;
const maxMultipartChunks = 4_096;
const defaultIntegrityCacheEntries = 4096;

type MultipartFieldName = "bundle" | "changelog" | "version";

type ActivePart = {
  chunks: Buffer[];
  filename: string;
  name: MultipartFieldName;
  size: number;
};

type FileFingerprint = {
  ctimeMs: number;
  dev: number;
  ino: number;
  mtimeMs: number;
  size: number;
};

type IntegrityCacheEntry = {
  fingerprint: FileFingerprint;
};

export type VerifiedBundleFile = {
  expectedChecksum: string;
  fileHandle: FileHandle;
  fingerprint: FileFingerprint;
};

export type ModuleTransferLimits = {
  downloadGlobal: number;
  downloadPerIdentity: number;
  uploadGlobal: number;
  uploadPerIdentity: number;
};

export const defaultModuleTransferLimits: ModuleTransferLimits = {
  downloadGlobal: 16,
  downloadPerIdentity: 4,
  uploadGlobal: 2,
  uploadPerIdentity: 1,
};

const MultipartUploadErrorInstances = new WeakSet<object>();
export type MultipartUploadError = ReturnType<typeof createMultipartUploadError>;
export function createMultipartUploadError(status: number, code: string, message: string) {
  const error = Object.assign(new Error(message), { name: "MultipartUploadError", code: code, status: status });
  MultipartUploadErrorInstances.add(error);
  return error;
}
export function isMultipartUploadError(error: unknown): error is MultipartUploadError {
  return error instanceof Error && MultipartUploadErrorInstances.has(error);
}

const BundleIntegrityErrorInstances = new WeakSet<object>();
export type BundleIntegrityError = ReturnType<typeof createBundleIntegrityError>;
export function createBundleIntegrityError(code: "bundle_checksum_mismatch" | "bundle_not_found" | "bundle_size_mismatch", message: string) {
  const error = Object.assign(new Error(message), { name: "BundleIntegrityError", code: code });
  BundleIntegrityErrorInstances.add(error);
  return error;
}
export function isBundleIntegrityError(error: unknown): error is BundleIntegrityError {
  return error instanceof Error && BundleIntegrityErrorInstances.has(error);
}

function positiveLimit(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function normalizeModuleTransferLimits(input: Partial<ModuleTransferLimits> = {}) {
  return {
    downloadGlobal: positiveLimit(input.downloadGlobal, defaultModuleTransferLimits.downloadGlobal),
    downloadPerIdentity: positiveLimit(
      input.downloadPerIdentity,
      defaultModuleTransferLimits.downloadPerIdentity,
    ),
    uploadGlobal: positiveLimit(input.uploadGlobal, defaultModuleTransferLimits.uploadGlobal),
    uploadPerIdentity: positiveLimit(input.uploadPerIdentity, defaultModuleTransferLimits.uploadPerIdentity),
  };
}

export function createInFlightLimiter(globalLimit: number, perIdentityLimit: number) {
  const safeGlobalLimit = positiveLimit(globalLimit, 1);
  const safePerIdentityLimit = positiveLimit(perIdentityLimit, 1);
  const activeByIdentity = new Map<string, number>();
  let activeGlobal = 0;

  return {
    active(identity?: string) {
      return identity === undefined ? activeGlobal : activeByIdentity.get(identity) ?? 0;
    },
    tryAcquire(identity: string) {
      const activeForIdentity = activeByIdentity.get(identity) ?? 0;
      if (activeGlobal >= safeGlobalLimit || activeForIdentity >= safePerIdentityLimit) {
        return null;
      }

      activeGlobal += 1;
      activeByIdentity.set(identity, activeForIdentity + 1);
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        activeGlobal = Math.max(0, activeGlobal - 1);
        const remaining = (activeByIdentity.get(identity) ?? 1) - 1;
        if (remaining <= 0) {
          activeByIdentity.delete(identity);
        } else {
          activeByIdentity.set(identity, remaining);
        }
      };
    },
  };
}

function readMultipartBoundary(contentType: string | null) {
  if (!contentType) {
    throw createMultipartUploadError(415, "multipart_required", "Upload body must use multipart form data.");
  }
  const segments = contentType.split(";");
  if (segments.shift()?.trim().toLowerCase() !== "multipart/form-data") {
    throw createMultipartUploadError(415, "multipart_required", "Upload body must use multipart form data.");
  }

  for (const segment of segments) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim().toLowerCase() !== "boundary") {
      continue;
    }
    let boundary = segment.slice(separator + 1).trim();
    if (boundary.startsWith('"') && boundary.endsWith('"')) {
      boundary = boundary.slice(1, -1);
    }
    if (
      Buffer.byteLength(boundary) <= maxBoundaryBytes &&
      /^[0-9A-Za-z'()+_,./:=?-]+$/.test(boundary)
    ) {
      return boundary;
    }
  }

  throw createMultipartUploadError(400, "invalid_upload", "Upload multipart boundary was invalid.");
}

function readDispositionParameter(disposition: string, parameterName: string) {
  const pattern = new RegExp(`(?:^|;)\\s*${parameterName}="([^"\\r\\n]*)"`, "i");
  return pattern.exec(disposition)?.[1] ?? "";
}

function parsePartHeaders(bytes: Buffer): { filename: string; name: MultipartFieldName } {
  if (bytes.byteLength > maxHeaderBytes) {
    throw createMultipartUploadError(400, "invalid_upload", "Upload part headers exceeded their limit.");
  }
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw createMultipartUploadError(400, "invalid_upload", "Upload part headers were not valid UTF-8.");
  }
  const headers = new Map<string, string>();
  for (const line of text.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw createMultipartUploadError(400, "invalid_upload", "Upload part headers were malformed.");
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    if (headers.has(name)) {
      throw createMultipartUploadError(400, "invalid_upload", "Upload part headers were duplicated.");
    }
    headers.set(name, line.slice(separator + 1).trim());
  }

  const disposition = headers.get("content-disposition") ?? "";
  if (!/^form-data(?:;|$)/i.test(disposition)) {
    throw createMultipartUploadError(400, "invalid_upload", "Upload part disposition was invalid.");
  }
  const name = readDispositionParameter(disposition, "name");
  if (name !== "bundle" && name !== "changelog" && name !== "version") {
    throw createMultipartUploadError(400, "invalid_upload", "Upload contained an unsupported form field.");
  }
  const filename = readDispositionParameter(disposition, "filename");
  if (Buffer.byteLength(filename) > maxBundleFilenameBytes) {
    throw createMultipartUploadError(400, "invalid_upload", "Upload bundle filename exceeded its limit.");
  }
  if ((name === "bundle") !== Boolean(filename)) {
    throw createMultipartUploadError(400, "invalid_upload", "Upload bundle field metadata was invalid.");
  }
  return { filename, name };
}

function findPartBoundary(bytes: Buffer, delimiter: Buffer) {
  let searchOffset = 0;
  while (true) {
    const index = bytes.indexOf(delimiter, searchOffset);
    if (index < 0) {
      return { kind: "none" } as const;
    }
    const suffixOffset = index + delimiter.byteLength;
    if (bytes.byteLength < suffixOffset + 2) {
      return { index, kind: "incomplete" } as const;
    }
    const first = bytes[suffixOffset];
    const second = bytes[suffixOffset + 1];
    if (first === 45 && second === 45) {
      return { final: true, index, kind: "found", suffixOffset } as const;
    }
    if (first === 13 && second === 10) {
      return { final: false, index, kind: "found", suffixOffset } as const;
    }
    searchOffset = index + 1;
  }
}

function isZipSignature(bytes: Buffer) {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

async function writeStreamChunk(
  output: ReturnType<typeof createWriteStream>,
  bytes: Buffer,
) {
  if (bytes.byteLength === 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    output.write(bytes, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function streamModuleUploadToFile(
  request: Request,
  bundlePath: string,
  maximumBundleBytes: number,
  maximumBodyBytes: number,
) {
  const boundary = readMultipartBoundary(request.headers.get("content-type"));
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBodyBytes)) {
    throw createMultipartUploadError(
      413,
      "bundle_too_large",
      `Upload exceeds the ${maximumBundleBytes} byte bundle limit.`,
    );
  }
  if (!request.body) {
    throw createMultipartUploadError(400, "invalid_upload", "Upload body was empty.");
  }

  const initialBoundary = Buffer.from(`--${boundary}\r\n`);
  const partBoundary = Buffer.from(`\r\n--${boundary}`);
  const headerTerminator = Buffer.from("\r\n\r\n");
  const seenFields = new Set<MultipartFieldName>();
  const hash = createHash("sha256");
  const signature = Buffer.alloc(4);
  const output = createWriteStream(bundlePath, { flags: "wx" });
  const reader = request.body.getReader();
  let activePart: ActivePart | null = null;
  let bundleBytes = 0;
  let bundleFilename = "";
  let changelog = "";
  let completed = false;
  let chunksRead = 0;
  let pending = Buffer.alloc(0);
  let rawBytes = 0;
  let signatureBytes = 0;
  let state: "body" | "done" | "headers" | "initial" = "initial";
  let succeeded = false;
  let version = "";

  const compactPending = () => {
    pending = pending.byteLength === 0 ? Buffer.alloc(0) : Buffer.from(pending);
  };

  const consumePartBytes = async (bytes: Buffer) => {
    if (!activePart || bytes.byteLength === 0) {
      return;
    }
    activePart.size += bytes.byteLength;
    if (activePart.name === "bundle") {
      if (activePart.size > maximumBundleBytes) {
        throw createMultipartUploadError(
          413,
          "bundle_too_large",
          `Bundle exceeds the ${maximumBundleBytes} byte limit.`,
        );
      }
      if (signatureBytes < signature.byteLength) {
        const copied = Math.min(signature.byteLength - signatureBytes, bytes.byteLength);
        bytes.copy(signature, signatureBytes, 0, copied);
        signatureBytes += copied;
      }
      hash.update(bytes);
      bundleBytes += bytes.byteLength;
      await writeStreamChunk(output, bytes);
      return;
    }

    const maximumFieldBytes = activePart.name === "version" ? maxVersionBytes : maxChangelogBytes;
    if (activePart.size > maximumFieldBytes) {
      throw createMultipartUploadError(400, "invalid_upload", `Upload ${activePart.name} exceeded its limit.`);
    }
    activePart.chunks.push(Buffer.from(bytes));
  };

  const finishPart = () => {
    if (!activePart) {
      throw createMultipartUploadError(400, "invalid_upload", "Upload part was missing.");
    }
    if (activePart.name !== "bundle") {
      let value = "";
      try {
        value = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(activePart.chunks)).trim();
      } catch {
        throw createMultipartUploadError(400, "invalid_upload", `Upload ${activePart.name} was not valid UTF-8.`);
      }
      if (activePart.name === "version") {
        version = value;
      } else {
        changelog = value;
      }
    }
    activePart = null;
  };

  const processPending = async (endOfStream: boolean) => {
    while (true) {
      if (state === "initial") {
        if (pending.byteLength < initialBoundary.byteLength) {
          if (endOfStream) {
            throw createMultipartUploadError(400, "invalid_upload", "Upload multipart body was incomplete.");
          }
          compactPending();
          return;
        }
        if (!pending.subarray(0, initialBoundary.byteLength).equals(initialBoundary)) {
          throw createMultipartUploadError(400, "invalid_upload", "Upload multipart opening boundary was invalid.");
        }
        pending = pending.subarray(initialBoundary.byteLength);
        state = "headers";
        continue;
      }

      if (state === "headers") {
        const terminatorIndex = pending.indexOf(headerTerminator);
        if (terminatorIndex < 0) {
          if (pending.byteLength > maxHeaderBytes || endOfStream) {
            throw createMultipartUploadError(400, "invalid_upload", "Upload part headers were incomplete or oversized.");
          }
          compactPending();
          return;
        }
        const parsedHeaders = parsePartHeaders(pending.subarray(0, terminatorIndex));
        if (seenFields.has(parsedHeaders.name)) {
          throw createMultipartUploadError(400, "invalid_upload", "Upload form fields must not be duplicated.");
        }
        seenFields.add(parsedHeaders.name);
        activePart = {
          chunks: [],
          filename: parsedHeaders.filename,
          name: parsedHeaders.name,
          size: 0,
        };
        if (parsedHeaders.name === "bundle") {
          bundleFilename = parsedHeaders.filename;
        }
        pending = pending.subarray(terminatorIndex + headerTerminator.byteLength);
        state = "body";
        continue;
      }

      if (state === "body") {
        const located = findPartBoundary(pending, partBoundary);
        if (located.kind === "found") {
          await consumePartBytes(pending.subarray(0, located.index));
          finishPart();
          pending = pending.subarray(located.suffixOffset + 2);
          if (located.final) {
            completed = true;
            state = "done";
            if (pending.byteLength >= 2 && pending[0] === 13 && pending[1] === 10) {
              pending = pending.subarray(2);
            }
          } else {
            state = "headers";
          }
          continue;
        }
        if (located.kind === "incomplete") {
          await consumePartBytes(pending.subarray(0, located.index));
          pending = pending.subarray(located.index);
          if (endOfStream) {
            throw createMultipartUploadError(400, "invalid_upload", "Upload multipart boundary was incomplete.");
          }
          compactPending();
          return;
        }
        if (endOfStream) {
          throw createMultipartUploadError(400, "invalid_upload", "Upload multipart closing boundary was missing.");
        }
        const retainedBytes = partBoundary.byteLength + 1;
        const consumedBytes = Math.max(0, pending.byteLength - retainedBytes);
        await consumePartBytes(pending.subarray(0, consumedBytes));
        pending = pending.subarray(consumedBytes);
        compactPending();
        return;
      }

      if (pending.byteLength === 0) {
        compactPending();
        return;
      }
      if (pending[0] === 13 && pending.byteLength < 2 && !endOfStream) {
        compactPending();
        return;
      }
      if (pending[0] === 13 && pending[1] === 10) {
        pending = pending.subarray(2);
        if (pending.byteLength === 0) {
          compactPending();
          return;
        }
      }
      throw createMultipartUploadError(400, "invalid_upload", "Upload multipart body had an invalid epilogue.");
    }
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunksRead += 1;
      if (chunksRead > maxMultipartChunks) {
        throw createMultipartUploadError(
          413,
          "bundle_too_large",
          `Upload exceeded ${maxMultipartChunks} transport chunks.`,
        );
      }
      rawBytes += next.value.byteLength;
      if (rawBytes > maximumBodyBytes) {
        throw createMultipartUploadError(
          413,
          "bundle_too_large",
          `Upload exceeds the ${maximumBundleBytes} byte bundle limit.`,
        );
      }
      const nextBuffer = Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength);
      pending = pending.byteLength === 0 ? nextBuffer : Buffer.concat([pending, nextBuffer]);
      await processPending(false);
    }
    await processPending(true);
    if (!completed || !seenFields.has("version") || !seenFields.has("bundle")) {
      throw createMultipartUploadError(400, "invalid_upload", "Upload requires a version and bundle.");
    }
    if (!isZipSignature(signature.subarray(0, signatureBytes))) {
      throw createMultipartUploadError(400, "invalid_bundle", "Module bundle did not contain a ZIP file signature.");
    }
    output.end();
    await finished(output);
    succeeded = true;
    return {
      bundleBytes,
      bundleChecksumSha256: hash.digest("hex"),
      bundleFilename,
      changelog,
      version,
    };
  } finally {
    if (!succeeded) {
      try {
        await reader.cancel();
      } catch {
        // The parser error remains the useful failure for the caller.
      }
    }
    reader.releaseLock();
    if (!succeeded) {
      output.destroy();
      try {
        await finished(output);
      } catch {
        // The caller owns removal of the generated staging directory.
      }
    }
  }
}

function fingerprint(stats: Stats) {
  return {
    ctimeMs: Number(stats.ctimeMs),
    dev: Number(stats.dev),
    ino: Number(stats.ino),
    mtimeMs: Number(stats.mtimeMs),
    size: Number(stats.size),
  };
}

function fingerprintsMatch(left: FileFingerprint, right: FileFingerprint) {
  return left.ctimeMs === right.ctimeMs && left.dev === right.dev && left.ino === right.ino &&
    left.mtimeMs === right.mtimeMs && left.size === right.size;
}

async function openBundleFile(filePath: string, expectedBytes: number, maximumBytes: number) {
  let fileHandle: FileHandle | null = null;
  try {
    const pathStats = await lstat(filePath);
    if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
      throw createBundleIntegrityError("bundle_not_found", "The downloadable bundle is unavailable.");
    }
    fileHandle = await open(filePath, "r");
    const openedStats = await fileHandle.stat();
    const pathFingerprint = fingerprint(pathStats);
    const openedFingerprint = fingerprint(openedStats);
    if (!openedStats.isFile() || !fingerprintsMatch(pathFingerprint, openedFingerprint)) {
      throw createBundleIntegrityError(
        "bundle_checksum_mismatch",
        "The downloadable bundle changed while it was being opened.",
      );
    }
    if (
      !Number.isSafeInteger(expectedBytes) ||
      expectedBytes < 0 ||
      expectedBytes > maximumBytes ||
      Number(openedStats.size) !== expectedBytes
    ) {
      throw createBundleIntegrityError(
        "bundle_size_mismatch",
        "The downloadable bundle failed its integrity check.",
      );
    }
    return { fileHandle, fingerprint: openedFingerprint };
  } catch (error) {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch {
        // The integrity failure remains authoritative.
      }
    }
    if (isBundleIntegrityError(error)) {
      throw error;
    }
    throw createBundleIntegrityError("bundle_not_found", "The downloadable bundle is unavailable.");
  }
}

export function createBundleIntegrityVerifier(maximumCacheEntries = defaultIntegrityCacheEntries) {
  const cache = new Map<string, IntegrityCacheEntry>();
  const safeCacheEntries = positiveLimit(maximumCacheEntries, defaultIntegrityCacheEntries);

  const cacheKey = (filePath: string, checksum: string, size: number) => `${filePath}\0${checksum}\0${size}`;
  const rememberFingerprint = (key: string, value: FileFingerprint) => {
    cache.delete(key);
    while (cache.size >= safeCacheEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
    cache.set(key, { fingerprint: value });
  };

  const openVerified = async (
    filePath: string,
    expectedChecksum: string,
    expectedBytes: number,
    maximumBytes: number,
  ) => {
    if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) {
      throw createBundleIntegrityError(
        "bundle_checksum_mismatch",
        "The downloadable bundle failed its integrity check.",
      );
    }
    const key = cacheKey(filePath, expectedChecksum, expectedBytes);
    const opened = await openBundleFile(filePath, expectedBytes, maximumBytes);
    try {
      const before = opened.fingerprint;
      const cached = cache.get(key);
      if (cached && fingerprintsMatch(cached.fingerprint, before)) {
        rememberFingerprint(key, before);
        return { expectedChecksum, fileHandle: opened.fileHandle, fingerprint: before };
      }
      cache.delete(key);

      const hash = createHash("sha256");
      let streamedBytes = 0;
      for await (const chunk of opened.fileHandle.createReadStream({
        autoClose: false,
        highWaterMark: 65536,
        start: 0,
      })) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        streamedBytes += bytes.byteLength;
        if (streamedBytes > expectedBytes || streamedBytes > maximumBytes) {
          throw createBundleIntegrityError(
            "bundle_size_mismatch",
            "The downloadable bundle failed its integrity check.",
          );
        }
        hash.update(bytes);
      }
      if (streamedBytes !== expectedBytes || hash.digest("hex") !== expectedChecksum) {
        throw createBundleIntegrityError(
          "bundle_checksum_mismatch",
          "The downloadable bundle failed its integrity check.",
        );
      }
      const after = fingerprint(await opened.fileHandle.stat());
      if (!fingerprintsMatch(before, after)) {
        throw createBundleIntegrityError(
          "bundle_checksum_mismatch",
          "The downloadable bundle changed during its integrity check.",
        );
      }
      rememberFingerprint(key, after);
      return { expectedChecksum, fileHandle: opened.fileHandle, fingerprint: after };
    } catch (error) {
      try {
        await opened.fileHandle.close();
      } catch {
        // The integrity failure remains authoritative.
      }
      if (isBundleIntegrityError(error)) {
        throw error;
      }
      throw createBundleIntegrityError("bundle_not_found", "The downloadable bundle is unavailable.");
    }
  };

  return {
    async openVerified(filePath: string, expectedChecksum: string, expectedBytes: number, maximumBytes: number) {
      return openVerified(filePath, expectedChecksum, expectedBytes, maximumBytes);
    },
    async remember(filePath: string, expectedChecksum: string, expectedBytes: number, maximumBytes: number) {
      const verifiedFile = await openVerified(filePath, expectedChecksum, expectedBytes, maximumBytes);
      try {
        return;
      } finally {
        await verifiedFile.fileHandle.close();
      }
    },
    async verify(filePath: string, expectedChecksum: string, expectedBytes: number, maximumBytes: number) {
      const verifiedFile = await openVerified(filePath, expectedChecksum, expectedBytes, maximumBytes);
      await verifiedFile.fileHandle.close();
    },
  };
}

export function createPermitBoundFileStream(
  verifiedFile: VerifiedBundleFile,
  expectedBytes: number,
  releasePermit: () => void,
) {
  const { fileHandle } = verifiedFile;
  const outgoingHash = createHash("sha256");
  let closed = false;
  let position = 0;
  let streamFingerprint: FileFingerprint | null = null;
  const closeFile = async () => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      await fileHandle.close();
    } finally {
      releasePermit();
    }
  };

  return new ReadableStream<Uint8Array>({
    async cancel() {
      await closeFile();
    },
    async pull(controller) {
      if (closed) {
        return;
      }
      try {
        const currentFingerprint = fingerprint(await fileHandle.stat());
        if (streamFingerprint && !fingerprintsMatch(streamFingerprint, currentFingerprint)) {
          throw createBundleIntegrityError(
            "bundle_checksum_mismatch",
            "The downloadable bundle changed while it was being streamed.",
          );
        }
        streamFingerprint = currentFingerprint;
        const remaining = expectedBytes - position;
        if (remaining <= 0) {
          if (outgoingHash.digest("hex") !== verifiedFile.expectedChecksum) {
            throw createBundleIntegrityError(
              "bundle_checksum_mismatch",
              "The downloadable bundle changed while it was being streamed.",
            );
          }
          await closeFile();
          controller.close();
          return;
        }
        const buffer = Buffer.alloc(Math.min(65536, remaining));
        const next = await fileHandle.read(buffer, 0, buffer.byteLength, position);
        if (next.bytesRead <= 0) {
          throw createBundleIntegrityError(
            "bundle_size_mismatch",
            "The downloadable bundle changed while it was being streamed.",
          );
        }
        position += next.bytesRead;
        outgoingHash.update(buffer.subarray(0, next.bytesRead));
        controller.enqueue(buffer.subarray(0, next.bytesRead));
        if (position === expectedBytes) {
          const finalFingerprint = fingerprint(await fileHandle.stat());
          if (
            !streamFingerprint || !fingerprintsMatch(streamFingerprint, finalFingerprint) ||
            outgoingHash.digest("hex") !== verifiedFile.expectedChecksum
          ) {
            throw createBundleIntegrityError(
              "bundle_checksum_mismatch",
              "The downloadable bundle changed while it was being streamed.",
            );
          }
          await closeFile();
          controller.close();
        }
      } catch (error) {
        await closeFile();
        controller.error(error);
      }
    },
  });
}
