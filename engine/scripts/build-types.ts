import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { $ } from "bun";
import {
  assertCameraDeclarationSource,
  assertCameraRootExportsSource,
  assertNoElidedAnyDeclarationSource,
  assertRootBrowserSubpathOnlyDeclarationsSource,
} from "./declaration-hygiene.ts";

const rootDir = join(import.meta.dir, "..");
const distDir = join(rootDir, "dist");

export function rewriteDeclarationImports(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      rewriteDeclarationImports(path);
      continue;
    }
    if (!path.endsWith(".d.ts")) continue;

    const source = readFileSync(path, "utf8");
    const rewritten = source
      .replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
      .replace(/(import\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
      .replace(/(import\s*\(\s*["'][^"']+)\.ts(["']\s*\))/g, "$1.js$2");
    if (rewritten !== source) {
      writeFileSync(path, rewritten);
    }
  }
}

export function assertNoElidedAnyDeclarations(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      assertNoElidedAnyDeclarations(path);
      continue;
    }
    if (!path.endsWith(".d.ts")) continue;

    assertNoElidedAnyDeclarationSource(readFileSync(path, "utf8"), path);
  }
}

export function assertCameraDeclarationsStayPublic(dir: string) {
  const cameraDeclarationPath = join(dir, "src", "canvas", "camera.d.ts");
  const indexDeclarationPath = join(dir, "src", "index.d.ts");
  const source = readFileSync(cameraDeclarationPath, "utf8");
  const indexSource = readFileSync(indexDeclarationPath, "utf8");

  assertCameraDeclarationSource(source, basename(cameraDeclarationPath));
  assertCameraRootExportsSource(indexSource, basename(indexDeclarationPath));
  assertRootBrowserSubpathOnlyDeclarationsSource(indexSource, basename(indexDeclarationPath));
}

export function copyRuntimeArtifacts(sourceDir: string, targetDir: string) {
  cpSync(sourceDir, targetDir, {
    recursive: true,
    filter(source) {
      if (!statSync(source).isFile()) return true;
      return !source.endsWith(".d.ts") && !source.endsWith(".d.ts.map");
    },
  });
}

export async function emitPackageDeclarations(targetDir: string, projectRoot = rootDir) {
  await $`bun run tsc -p ./tsconfig.types.json --outDir ${targetDir}`.cwd(projectRoot);
  rewriteDeclarationImports(targetDir);
  assertNoElidedAnyDeclarations(targetDir);
  assertCameraDeclarationsStayPublic(targetDir);
}

export async function buildTypes() {
  const nonce = `${process.pid}-${Date.now()}`;
  const stagingDir = join(rootDir, `.dist-types-${nonce}`);
  const backupDir = join(rootDir, `.dist-backup-${nonce}`);

  try {
    await emitPackageDeclarations(stagingDir);
    if (existsSync(distDir)) copyRuntimeArtifacts(distDir, stagingDir);
    if (existsSync(distDir)) renameSync(distDir, backupDir);
    try {
      renameSync(stagingDir, distDir);
    } catch (error) {
      if (!existsSync(distDir) && existsSync(backupDir)) renameSync(backupDir, distDir);
      throw error;
    }
    rmSync(backupDir, { force: true, recursive: true });
  } finally {
    rmSync(stagingDir, { force: true, recursive: true });
    if (!existsSync(distDir) && existsSync(backupDir)) renameSync(backupDir, distDir);
  }
}

if (import.meta.main) {
  await buildTypes();
}
