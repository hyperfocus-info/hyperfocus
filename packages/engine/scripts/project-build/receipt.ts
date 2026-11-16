import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { Metafile, Plugin } from "esbuild";

type InputKind = "bundle" | "canonical" | "tooling" | "configuration";
type ReceiptInput = { path: string; sha256: string; bytes: number; kind: InputKind };

export function hashReceiptInput(path: string, bytes: Uint8Array | string, kind: InputKind): ReceiptInput {
  return { path: path.replace(/\\/g, "/"), sha256: sha256(bytes), bytes: typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength, kind };
}

/** Capture the same bytes supplied to esbuild, rather than rereading changing files after compilation. */
export function captureBundleInputs() {
  const inputs = new Map<string, ReceiptInput>();
  const plugin: Plugin = { name: "build-receipt-inputs", setup(builder) {
    builder.onLoad({ filter: /.*/, namespace: "file" }, async (args) => {
      const contents = await readFile(args.path);
      inputs.set(resolve(args.path), hashReceiptInput(resolve(args.path), contents, "bundle"));
      return { contents, loader: "default", resolveDir: dirname(args.path) };
    });
  } };
  return { plugin, closure(metafile: Metafile, root: string, entry: string) {
    return Object.keys(metafile.inputs).map((path) => {
      if (path === "hyperfocus-project-entry.ts") return hashReceiptInput("generated:hyperfocus-project-entry.ts", entry, "bundle");
      const input = inputs.get(resolve(root, path));
      if (!input) throw new Error(`Build receipt could not capture bundled input: ${path}`);
      return input;
    });
  } };
}

export async function discoverBuildConfiguration(roots: readonly string[]) {
  const visited = new Set<string>();
  const inputs: ReceiptInput[] = [];
  for (const root of roots) {
    let directory = resolve(root);
    while (!visited.has(directory)) {
      visited.add(directory);
      for (const name of ["package.json", "tsconfig.json", "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
        const path = resolve(directory, name);
        try { inputs.push(hashReceiptInput(path, await readFile(path), "configuration")); }
        catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return inputs;
}

export function createGameBuildReceipt(options: {
  artifactPath: string; artifact: string; projectRoot: string; inputs: readonly ReceiptInput[];
  toolVersions: { bun: string; esbuild: string; engine: string; platform: string; arch: string };
}) {
  const payload = {
    schema: "hyperfocus-game-build-receipt-v1",
    artifact: { path: basename(options.artifactPath), sha256: sha256(options.artifact), bytes: Buffer.byteLength(options.artifact) },
    inputs: [...options.inputs].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    toolVersions: options.toolVersions,
    command: { operation: "build:game", projectRoot: resolve(options.projectRoot).replace(/\\/g, "/") },
    validation: { status: "passed", checks: ["canonical-pair", "runtime-preflight", "single-file-bundle"] },
    acceptance: { status: "unassessed", reason: "No browser, gameplay, accessibility or human acceptance was performed by this build." },
    provenance: { bundleInputs: "captured-at-load", configuration: "observed-after-build", reproducibility: "not-attested" }
  };
  return { ...payload, identity: sha256(JSON.stringify(payload)) };
}

export function verifyGameBuildReceipt(options: { receipt: ReturnType<typeof createGameBuildReceipt>; artifact: Uint8Array | string }) {
  const { identity, ...payload } = options.receipt;
  return {
    receiptMatches: identity === sha256(JSON.stringify(payload)),
    artifactMatches: options.receipt.artifact.sha256 === sha256(options.artifact)
  };
}

/** Read-only artifact verification; hashes detect mismatch, not publisher authenticity. */
export async function verifyGameBuildReceiptFile(options: { artifactPath: string }) {
  const artifactPath = resolve(options.artifactPath);
  const receipt: unknown = JSON.parse(await readFile(`${artifactPath}.receipt.json`, "utf8"));
  if (!receipt || typeof receipt !== "object" || !("schema" in receipt) || receipt.schema !== "hyperfocus-game-build-receipt-v1"
    || !("identity" in receipt) || typeof receipt.identity !== "string" || !("artifact" in receipt)
    || !receipt.artifact || typeof receipt.artifact !== "object" || !("sha256" in receipt.artifact)
    || typeof receipt.artifact.sha256 !== "string") throw new Error("Invalid game build receipt.");
  const { identity, ...payload } = receipt;
  return { receiptMatches: identity === sha256(JSON.stringify(payload)), artifactMatches: receipt.artifact.sha256 === sha256(await readFile(artifactPath)) };
}

function sha256(bytes: Uint8Array | string) { return createHash("sha256").update(bytes).digest("hex"); }
