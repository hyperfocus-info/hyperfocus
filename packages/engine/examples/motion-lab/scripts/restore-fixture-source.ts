import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { generateMotionLabFixtures, SOURCE_SHA256 } from "./generate-fixtures.ts";

// Official CC0 release, verified against the already-pinned fixture source hash.
const ARCHIVE_URL = "https://kenney.nl/media/pages/assets/animated-characters-survivors/27b16052a7-1774772958/kenney_animated-characters-survivors.zip";
const ARCHIVE_SHA256 = "fdadced07a0454c9b7f0b46507be6144a072b4d03b4ffa37f225893c76c62845";
const LICENSE_SHA256 = "8eab20a1fa97308ae50443f6b8a0fabc4dd1fc37062988cd635fc74c8f1be21c";
const engineRoot = resolve(import.meta.dir, "../../..");
const upstreamRoot = resolve(engineRoot, "examples/three-arena/assets/source/kenney/animated-characters-survivors");
const fixtureRoot = resolve(import.meta.dir, "../assets");

function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

/** Preserve existing local assets; restoration never silently replaces different bytes. */
async function restoreFile(path: string, bytes: Uint8Array) {
  try {
    const prior = await readFile(path);
    if (!prior.equals(bytes)) throw new Error(`Existing source differs; preserve and inspect it before restoring: ${path}`);
    return;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}

async function downloadPinnedArchive() {
  const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Kenney source download failed: HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > 2_000_000) throw new Error("Kenney archive exceeds the pinned source download boundary.");
      chunks.push(result.value);
    }
  } finally { await reader.cancel(); }
  const archive = Buffer.concat(chunks);
  if (digest(archive) !== ARCHIVE_SHA256) throw new Error("Kenney archive changed; inspect provenance instead of refreshing its hash automatically.");
  return archive;
}

const files = unzipSync(await downloadPinnedArchive(), {
  filter: (entry) => entry.name === "Model/characterMedium.fbx" || entry.name === "License.txt",
});
const source = files["Model/characterMedium.fbx"], license = files["License.txt"];
if (!source || digest(source) !== SOURCE_SHA256 || !license || digest(license) !== LICENSE_SHA256) throw new Error("Kenney source or CC0 license does not match pinned provenance.");
await restoreFile(resolve(upstreamRoot, "Model/characterMedium.fbx"), source);
await restoreFile(resolve(upstreamRoot, "License.txt"), license);

const scratch = await mkdtemp(resolve(tmpdir(), "engine-motion-fixture-source-"));
try {
  const manifest = await generateMotionLabFixtures({ outputDirectory: scratch });
  for (const file of ["manifest.json", ...manifest.fixtures.map((fixture) => fixture.file)]) {
    if (!(await readFile(resolve(scratch, file))).equals(await readFile(resolve(fixtureRoot, file)))) throw new Error(`Regeneration differs from the checked-in fixture: ${file}`);
  }
  for (const file of ["kenney-character-medium.fbx", "LICENSE.txt", "PROVENANCE.json"]) {
    await restoreFile(resolve(fixtureRoot, "source", file), await readFile(resolve(scratch, "source", file)));
  }
} finally {
  const cleanupPath = resolve(scratch);
  if (dirname(cleanupPath) !== resolve(tmpdir()) || !basename(cleanupPath).startsWith("engine-motion-fixture-source-")) {
    throw new Error(`Refusing to remove an unexpected fixture scratch directory: ${cleanupPath}`);
  }
  await rm(cleanupPath, { recursive: true, force: true });
}
console.log("Restored checksum-verified CC0 sources; all five checked-in GLBs and manifest reproduce exactly.");
