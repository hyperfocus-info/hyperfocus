import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bumpPatchVersion, VERSIONED_MANIFESTS } from "./release-readiness";

async function readJson(filePath: string) {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  if (!isRecord(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

async function main() {
  const explicitVersion = process.argv.find((argument) => argument.startsWith("--version="))?.slice("--version=".length);
  const rootManifestPath = path.resolve("package.json");
  const rootManifest = await readJson(rootManifestPath);
  if (typeof rootManifest.version !== "string") throw new Error("package.json needs a version before it can be bumped");
  const nextVersion = explicitVersion ?? bumpPatchVersion(rootManifest.version);

  for (const manifestPath of VERSIONED_MANIFESTS) {
    const absolutePath = path.resolve(manifestPath);
    const manifest = await readJson(absolutePath);
    if (typeof manifest.version !== "string") throw new Error(`${manifestPath} needs a version before it can be bumped`);
    manifest.version = nextVersion;
    await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Bumped ${VERSIONED_MANIFESTS.length} manifests to ${nextVersion}.`);
}

if (import.meta.main) await main();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
