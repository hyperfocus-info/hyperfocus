import { assert } from "@hyperfocus/utilities/assert";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReleaseCommand } from "./smoke/run-command.ts";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts } from "./package-artifacts.ts";

const rootDir = join(import.meta.dir, "..");
const supportedViteVersions = ["8.0.14"] as const;
const runCurrentVite = process.argv.includes("--current");
const viteVersions = runCurrentVite ? (["latest"] as const) : supportedViteVersions;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const packDir = mkdtempSync(join(tmpdir(), "catalog-engine-vite-pack-"));

try {
  const missingArtifacts = getMissingPackageArtifacts(rootDir);
  assert(missingArtifacts.length === 0, formatMissingPackageArtifactsMessage(missingArtifacts));
  const tarballOutput = await runReleaseCommand({ cmd: [npmCommand, "pack", "--json", "--pack-destination", packDir], cwd: rootDir });
  const packOutput: unknown = JSON.parse(tarballOutput);
  if (!Array.isArray(packOutput) || !packOutput.every(isPackEntry)) throw new Error("npm pack output was malformed");
  const [tarball] = packOutput;
  assert(tarball?.filename, "npm pack did not produce an engine tarball");

  for (const viteVersion of viteVersions) {
    const consumerDir = mkdtempSync(join(tmpdir(), `catalog-engine-vite-${viteVersion.replaceAll(".", "-")}-`));

    try {
      writeFileSync(
        join(consumerDir, "package.json"),
        JSON.stringify(
          {
            type: "module",
            scripts: {
              build: "vite build"
            },
            dependencies: {
              "@hyperfocus/engine": join(packDir, tarball.filename)
            },
            devDependencies: {
              vite: viteVersion
            }
          },
          null,
          2
        )
      );
      writeFileSync(join(consumerDir, "index.html"), '<script type="module" src="/src/main.ts"></script>\n');
      writeFileSync(
        join(consumerDir, "vite.config.ts"),
        ["import { defineConfig } from 'vite';", "", "export default defineConfig({ build: { assetsInlineLimit: 0 } });", ""].join(
          "\n"
        )
      );
      mkdirSync(join(consumerDir, "src"));
      writeFileSync(
        join(consumerDir, "src", "main.ts"),
        [
          'import { createCollisionKernel } from "@hyperfocus/engine";',
          'import collisionKernelWasmUrl from "@hyperfocus/engine/wasm/collision-kernel.wasm?url";',
          "",
          "const wasmUrl: string = collisionKernelWasmUrl;",
          "void createCollisionKernel(wasmUrl).then((kernel) => {",
          "  document.body.dataset.backend = kernel.backend;",
          "  document.body.dataset.asset = wasmUrl;",
          "});",
          ""
        ].join("\n")
      );

      await runReleaseCommand({ cmd: [process.execPath, "install", "--no-progress"], cwd: consumerDir });
      await runReleaseCommand({ cmd: [process.execPath, "run", "build"], cwd: consumerDir });
      const emittedFiles = readdirSync(join(consumerDir, "dist", "assets"));

      assert(
        emittedFiles.some((file) => /^collision-kernel-[\w-]+\.wasm$/.test(file)),
        `Vite ${viteVersion} build did not emit the engine WASM asset as a rewritten URL`
      );
    } finally {
      rmSync(consumerDir, { force: true, recursive: true });
    }
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}

function isPackEntry(value: unknown): value is { filename: string } {
  return typeof value === "object" && value !== null && "filename" in value && typeof value.filename === "string";
}
