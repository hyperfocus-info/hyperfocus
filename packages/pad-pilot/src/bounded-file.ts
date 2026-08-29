import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { lstat } from "node:fs/promises";

import { readBoundedStreamBytes } from "@hyperfocus/pad-pilot/bounded-stream";

function validateMaximumBytes(maximumBytes: number, label: string) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error(`${label} byte limit must be a positive safe integer.`);
  }
}

function sameFileIdentity(
  left: { ctimeMs: bigint | number; dev: bigint | number; ino: bigint | number; mtimeMs: bigint | number; size: bigint | number },
  right: { ctimeMs: bigint | number; dev: bigint | number; ino: bigint | number; mtimeMs: bigint | number; size: bigint | number },
) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function verifyRegularFile(
  filePath: string,
  maximumBytes: number,
  label: string,
  limitVerb: "exceeded" | "exceeds" = "exceeded",
) {
  validateMaximumBytes(maximumBytes, label);
  const fileStat = await lstat(filePath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
  if (fileStat.size < 0 || fileStat.size > maximumBytes) {
    throw new Error(`${label} ${limitVerb} ${maximumBytes} bytes: ${filePath}`);
  }
  return fileStat;
}

async function verifyUnchangedFile(
  filePath: string,
  before: Awaited<ReturnType<typeof lstat>>,
  bytesRead: number,
  label: string,
) {
  const after = await lstat(filePath);
  if (!after.isFile() || after.isSymbolicLink() || !sameFileIdentity(before, after) || bytesRead !== after.size) {
    throw new Error(`${label} changed while being read: ${filePath}`);
  }
}

async function readBoundedFileBytesWithVerb(
  filePath: string,
  maximumBytes: number,
  label: string,
  limitVerb: "exceeded" | "exceeds",
) {
  const before = await verifyRegularFile(filePath, maximumBytes, label, limitVerb);
  const bytes = await readBoundedStreamBytes(Bun.file(filePath).stream(), {
    label,
    maxBytes: maximumBytes,
  });
  await verifyUnchangedFile(filePath, before, bytes.byteLength, label);
  return bytes;
}

export async function readBoundedFileBytes(filePath: string, maximumBytes: number, label: string) {
  return readBoundedFileBytesWithVerb(filePath, maximumBytes, label, "exceeded");
}

export async function readBoundedUtf8File(filePath: string, maximumBytes: number, label: string) {
  const bytes = await readBoundedFileBytesWithVerb(filePath, maximumBytes, label, "exceeds");
  if (bytes.byteLength === 0) {
    throw new Error(`${label} is empty.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8 text.`);
  }
}

export function readBoundedUtf8FileSync(filePath: string, maximumBytes: number, label: string) {
  validateMaximumBytes(maximumBytes, label);
  const pathStat = lstatSync(filePath);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
  if (pathStat.size <= 0 || pathStat.size > maximumBytes) {
    throw new Error(`${label} is empty or exceeds ${maximumBytes} bytes: ${filePath}`);
  }

  const descriptor = openSync(filePath, "r");
  try {
    const openedStat = fstatSync(descriptor);
    if (!openedStat.isFile() || !sameFileIdentity(pathStat, openedStat)) {
      throw new Error(`${label} changed before it could be read safely: ${filePath}`);
    }
    const bytes = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const bytesRead = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead <= 0) {
        throw new Error(`${label} could not be read completely: ${filePath}`);
      }
      offset += bytesRead;
    }
    const trailingByte = Buffer.allocUnsafe(1);
    const trailingBytes = readSync(descriptor, trailingByte, 0, 1, bytes.byteLength);
    const finalOpenedStat = fstatSync(descriptor);
    const finalPathStat = lstatSync(filePath);
    if (trailingBytes !== 0 || !sameFileIdentity(openedStat, finalOpenedStat)
        || !sameFileIdentity(finalOpenedStat, finalPathStat)) {
      throw new Error(`${label} changed while being read: ${filePath}`);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${label} is not valid UTF-8 text.`);
    }
  } finally {
    closeSync(descriptor);
  }
}

export async function hashBoundedFile(filePath: string, maximumBytes: number, label: string) {
  const before = await verifyRegularFile(filePath, maximumBytes, label);
  const hash = createHash("sha256");
  const reader = Bun.file(filePath).stream().getReader();
  let completed = false;
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        completed = true;
        break;
      }
      size += next.value.byteLength;
      if (size > maximumBytes) {
        throw new Error(`${label} grew beyond ${maximumBytes} bytes: ${filePath}`);
      }
      hash.update(next.value);
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // The read or size failure remains authoritative.
      }
    }
    reader.releaseLock();
  }
  await verifyUnchangedFile(filePath, before, size, label);
  return { sha256: hash.digest("hex"), size };
}
