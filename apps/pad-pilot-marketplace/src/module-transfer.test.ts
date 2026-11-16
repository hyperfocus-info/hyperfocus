import { createBundleIntegrityError, createMultipartUploadError, isMultipartUploadError } from "./module-transfer";
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {  isBundleIntegrityError,
  createBundleIntegrityVerifier,
  createInFlightLimiter,
  createPermitBoundFileStream,
  streamModuleUploadToFile,
} from "./module-transfer";

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withTempRoot(run: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "padpilot-module-transfer-"));
  try {
    await run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function multipartRequest(boundary: string, chunks: Uint8Array[]) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
  });
  return new Request("http://localhost/upload", {
    body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    method: "POST",
  });
}

describe("module transfer bounds", () => {
  it("enforces global and per-identity in-flight limits with idempotent release", () => {
    const limiter = createInFlightLimiter(2, 1);
    const releaseFirst = limiter.tryAcquire("first");
    expect(releaseFirst).toBeFunction();
    expect(limiter.tryAcquire("first")).toBeNull();
    const releaseSecond = limiter.tryAcquire("second");
    expect(releaseSecond).toBeFunction();
    expect(limiter.tryAcquire("third")).toBeNull();
    expect(limiter.active()).toBe(2);

    releaseFirst?.();
    releaseFirst?.();
    expect(limiter.active("first")).toBe(0);
    expect(limiter.active()).toBe(1);
    releaseSecond?.();
    expect(limiter.active()).toBe(0);
  });

  it("streams multipart bundle bytes to disk across single-byte boundary splits", async () => {
    const root = mkdtempSync(join(tmpdir(), "padpilot-module-transfer-"));
    const bundlePath = join(root, "bundle.zip");
    const boundary = "padpilot-stream-boundary";
    const bundle = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x10, 0x20, 0x30]);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="version"\r\n\r\n1.2.3\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="changelog"\r\n\r\nStreaming upload\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="fixture.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      bundle,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const chunks = Array.from(body, (byte) => new Uint8Array([byte]));

    try {
      const result = await streamModuleUploadToFile(
        multipartRequest(boundary, chunks),
        bundlePath,
        1024,
        4096,
      );
      expect(result).toEqual({
        bundleBytes: bundle.byteLength,
        bundleChecksumSha256: checksum(bundle),
        bundleFilename: "fixture.zip",
        changelog: "Streaming upload",
        version: "1.2.3",
      });
      expect(new Uint8Array(await Bun.file(bundlePath).arrayBuffer())).toEqual(bundle);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects a tiny-chunk multipart flood before unbounded parser work", async () => {
    await withTempRoot(async (root) => {
      const bundlePath = join(root, "bundle.zip");
      const boundary = "padpilot-chunk-flood";
      const chunks = Array.from({ length: 4_097 }, () => new Uint8Array());
      await expect(streamModuleUploadToFile(
        multipartRequest(boundary, chunks),
        bundlePath,
        1024,
        4096,
      )).rejects.toMatchObject({ code: "bundle_too_large", status: 413 });
    });
  });

  it("does not cache an unverified fingerprint", async () => {
    await withTempRoot(async (root) => {
      const bundlePath = join(root, "bundle.zip");
      const expected = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      const replacement = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
      await Bun.write(bundlePath, replacement);

      await expect(createBundleIntegrityVerifier().remember(
        bundlePath,
        checksum(expected),
        expected.byteLength,
        1024,
      )).rejects.toMatchObject({ code: "bundle_checksum_mismatch" });
    });
  });

  it("invalidates the stat cache and rejects a same-size bundle rewrite", async () => {
    const root = mkdtempSync(join(tmpdir(), "padpilot-integrity-"));
    const bundlePath = join(root, "bundle.zip");
    const original = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const verifier = createBundleIntegrityVerifier(2);
    try {
      await Bun.write(bundlePath, original);
      await verifier.remember(bundlePath, checksum(original), original.byteLength, 1024);
      await verifier.verify(bundlePath, checksum(original), original.byteLength, 1024);
      await Bun.sleep(10);
      await Bun.write(bundlePath, new Uint8Array([0x50, 0x4b, 0x05, 0x06]));

      try {
        await verifier.verify(bundlePath, checksum(original), original.byteLength, 1024);
        throw new Error("Expected the rewritten bundle to fail integrity verification.");
      } catch (error) {
        expect(isBundleIntegrityError(error)).toBe(true);
        if (isBundleIntegrityError(error)) {
          expect(error.code).toBe("bundle_checksum_mismatch");
        }
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects symbolic-link bundle paths before opening them", async () => {
    await withTempRoot(async (root) => {
      const targetPath = join(root, "target.zip");
      const linkPath = join(root, "linked.zip");
      const bytes = new Uint8Array([1, 2, 3, 4]);
      await Bun.write(targetPath, bytes);
      symlinkSync(targetPath, linkPath, "file");

      const verifier = createBundleIntegrityVerifier();
      await expect(verifier.verify(linkPath, checksum(bytes), bytes.byteLength, 1024)).rejects.toMatchObject({
        code: "bundle_not_found",
      });
    });
  });

  it("streams from the verified file handle when the path is replaced", async () => {
    await withTempRoot(async (root) => {
      const bundlePath = join(root, "bundle.zip");
      const movedPath = join(root, "verified.zip");
      const original = new Uint8Array([1, 2, 3, 4]);
      await Bun.write(bundlePath, original);

      const verifier = createBundleIntegrityVerifier();
      const verifiedFile = await verifier.openVerified(
        bundlePath,
        checksum(original),
        original.byteLength,
        1024,
      );
      renameSync(bundlePath, movedPath);
      await Bun.write(bundlePath, new Uint8Array([4, 3, 2, 1]));

      let released = false;
      const stream = createPermitBoundFileStream(verifiedFile, original.byteLength, () => {
        released = true;
      });
      expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(original);
      expect(released).toBe(true);
    });
  });

  it("holds a download permit until the response stream closes", async () => {
    const root = mkdtempSync(join(tmpdir(), "padpilot-permit-stream-"));
    const bundlePath = join(root, "bundle.zip");
    const limiter = createInFlightLimiter(1, 1);
    try {
      await Bun.write(bundlePath, new Uint8Array([1, 2, 3, 4]));
      const release = limiter.tryAcquire("client");
      expect(release).toBeFunction();
      if (!release) {
        throw new Error("Expected a download permit.");
      }
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const verifiedFile = await createBundleIntegrityVerifier().openVerified(
        bundlePath,
        checksum(bytes),
        bytes.byteLength,
        1024,
      );
      const stream = createPermitBoundFileStream(verifiedFile, 4, release);
      expect(limiter.tryAcquire("client")).toBeNull();
      expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(limiter.active()).toBe(0);
      const nextRelease = limiter.tryAcquire("client");
      expect(nextRelease).toBeFunction();
      nextRelease?.();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("errors the response when a verified file is overwritten in place", async () => {
    await withTempRoot(async (root) => {
      const bundlePath = join(root, "bundle.zip");
      const original = new Uint8Array([1, 2, 3, 4]);
      await Bun.write(bundlePath, original);
      const verifier = createBundleIntegrityVerifier();
      const verifiedFile = await verifier.openVerified(
        bundlePath,
        checksum(original),
        original.byteLength,
        1024,
      );
      await Bun.write(bundlePath, new Uint8Array([4, 3, 2, 1]));

      let released = false;
      const stream = createPermitBoundFileStream(verifiedFile, original.byteLength, () => {
        released = true;
      });
      await expect(new Response(stream).arrayBuffer()).rejects.toMatchObject({
        code: "bundle_checksum_mismatch",
      });
      expect(released).toBe(true);
    });
  });
});

 it("preserves factory error identity and rejects lookalike errors", () => {
 const integrity = createBundleIntegrityError("bundle_not_found", "missing");
 const upload = createMultipartUploadError(400, "bad_upload", "invalid");
 expect(integrity).toBeInstanceOf(Error);
 expect(integrity.name).toBe("BundleIntegrityError");
 expect(isBundleIntegrityError(integrity)).toBe(true);
 expect(isMultipartUploadError(upload)).toBe(true);
 expect(isBundleIntegrityError(upload)).toBe(false);
 expect(isBundleIntegrityError(Object.assign(new Error("missing"), { code: integrity.code }))).toBe(false);
 expect(upload.status).toBe(400);
 });
