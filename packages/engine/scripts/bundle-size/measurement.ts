import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "esbuild";

export type BundleBytes = { raw: number; gzip: number; brotli: number };

export function compressedBundleBytes(contents: Uint8Array): BundleBytes {
  return { raw: contents.byteLength, gzip: gzipSync(contents).byteLength, brotli: brotliCompressSync(contents).byteLength };
}

/** Enumerate actual deliverables, including chunks that no budget entry names. */
export function javascriptArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? javascriptArtifacts(path) : entry.name.endsWith(".js") ? [path] : [];
  });
}

export function sumBundleBytes(values: Iterable<BundleBytes>): BundleBytes {
  const sum: BundleBytes = { raw: 0, gzip: 0, brotli: 0 };
  for (const value of values) { sum.raw += value.raw; sum.gzip += value.gzip; sum.brotli += value.brotli; }
  return sum;
}

/** Count each native module once, then separately measure the rebundled consumer. */
export async function measureDeliveredBundle(packageRoot: string, entryPath: string) {
  const result = await build({
    absWorkingDir: packageRoot,
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    external: ["three", "node:*", "bun:sqlite", ...(entryPath.startsWith("dist/tooling/") ? ["esbuild"] : [])],
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const files = Object.keys(result.metafile.inputs).map((path) => {
    const absolute = resolve(packageRoot, path), local = relative(packageRoot, absolute);
    if (local.startsWith("..") || isAbsolute(local)) throw new Error(`Bundle ${entryPath} escapes the delivered package: ${path}`);
    return { path: local.replaceAll("\\", "/"), ...compressedBundleBytes(readFileSync(absolute)) };
  });
  return {
    files,
    native: sumBundleBytes(files),
    rebundled: sumBundleBytes(result.outputFiles.map((output) => compressedBundleBytes(output.contents))),
  };
}

export function checkBundleBytes(label: string, actual: BundleBytes, maximum: BundleBytes): string[] {
  const dimensions = ["raw", "gzip", "brotli"] as const;
  return dimensions.flatMap((dimension) => actual[dimension] > maximum[dimension]
    ? [`${label} ${dimension} is ${actual[dimension] - maximum[dimension]} bytes over budget (${actual[dimension]} / ${maximum[dimension]})`]
    : []);
}
