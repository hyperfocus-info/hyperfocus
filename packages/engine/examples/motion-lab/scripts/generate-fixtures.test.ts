import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { Vector3, type Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ASSET_BUDGET_BYTES,
  FIXTURE_FILE_NAMES,
  FIXTURE_IDS,
  SOURCE_SHA256,
  generateMotionLabFixtures,
  inspectGlb,
  parseMotionLabFixtureManifest,
  type MotionLabFixtureManifest,
} from "./generate-fixtures.ts";

const ENGINE_ROOT = resolve(import.meta.dir, "..", "..", "..");
const ASSET_DIRECTORY = resolve(import.meta.dir, "..", "assets");
const MANIFEST_PATH = resolve(ASSET_DIRECTORY, "manifest.json");
const SOURCE_FILE = "source/kenney-character-medium.fbx";
const LICENSE_FILE = "source/LICENSE.txt";
const PROVENANCE_FILE = "source/PROVENANCE.json";
const COPIED_SOURCE_ASSETS_AVAILABLE = [SOURCE_FILE, LICENSE_FILE, PROVENANCE_FILE]
  .every((path) => existsSync(resolve(ASSET_DIRECTORY, path)));
const UPSTREAM_SOURCE_ASSETS_AVAILABLE = [
  "examples/three-arena/assets/source/kenney/animated-characters-survivors/Model/characterMedium.fbx",
  "examples/three-arena/assets/source/kenney/animated-characters-survivors/License.txt",
].every((path) => existsSync(resolve(ENGINE_ROOT, path)));
const sourceRegenerationTest = UPSTREAM_SOURCE_ASSETS_AVAILABLE ? test : test.skip;

async function readManifest(directory = ASSET_DIRECTORY): Promise<MotionLabFixtureManifest> {
  return parseMotionLabFixtureManifest(JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")));
}

function requireJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return Object.fromEntries(Object.entries(value));
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadGlb(path: string): Promise<GLTF> {
  const bytes = new Uint8Array(await readFile(path));
  return await new Promise<GLTF>((resolveLoad, rejectLoad) => {
    new GLTFLoader().parse(Uint8Array.from(bytes).buffer, "", resolveLoad, rejectLoad);
  });
}

function countSkinnedMeshes(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) count += 1;
  });
  return count;
}

function worldDistance(root: Object3D, firstName: string, secondName: string): number {
  root.updateMatrixWorld(true);
  const first = root.getObjectByName(firstName);
  const second = root.getObjectByName(secondName);
  if (!first || !second) throw new Error(`Missing ${firstName} or ${secondName}.`);
  return first.getWorldPosition(new Vector3()).distanceTo(second.getWorldPosition(new Vector3()));
}

function managedPaths(manifest: MotionLabFixtureManifest): string[] {
  return [
    "manifest.json",
    SOURCE_FILE,
    LICENSE_FILE,
    PROVENANCE_FILE,
    ...manifest.fixtures.map((fixture) => fixture.file),
  ];
}

describe("motion-lab fixture assets", () => {
  test("manifest declares the exact fixture set and pinned CC0 provenance", async () => {
    const manifest = await readManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtures.map((fixture) => fixture.id)).toEqual([...FIXTURE_IDS]);
    expect(manifest.fixtures.map((fixture) => fixture.file)).toEqual(
      FIXTURE_IDS.map((id) => `fixtures/${FIXTURE_FILE_NAMES[id]}`),
    );
    expect(manifest.source.sha256).toBe(SOURCE_SHA256);
    expect(manifest.license.id).toBe("CC0-1.0");
    expect(manifest.coordinateSystem).toEqual({
      forward: "+Z",
      handedness: "right",
      targetHeightMeters: 1.8,
      units: "meters",
      up: "+Y",
    });
    if (COPIED_SOURCE_ASSETS_AVAILABLE) {
      const provenance = requireJsonRecord(JSON.parse(await readFile(resolve(ASSET_DIRECTORY, PROVENANCE_FILE), "utf8")));
      const sourceBytes = new Uint8Array(await readFile(resolve(ASSET_DIRECTORY, SOURCE_FILE)));
      const license = await readFile(resolve(ASSET_DIRECTORY, LICENSE_FILE), "utf8");
      expect(hash(sourceBytes)).toBe(SOURCE_SHA256);
      expect(provenance.sha256).toBe(SOURCE_SHA256);
      expect(provenance.license).toBe("CC0-1.0");
      expect(license).toContain("Creative Commons Zero, CC0");
    }
  });

  test("every GLB has a valid header, one parseable skin, and zero clips", async () => {
    const manifest = await readManifest();
    for (const fixture of manifest.fixtures) {
      const path = resolve(ASSET_DIRECTORY, fixture.file);
      const bytes = new Uint8Array(await readFile(path));
      const inspection = inspectGlb(bytes);
      const gltf = await loadGlb(path);

      expect(inspection).toEqual(fixture.inspection);
      expect(inspection.assetVersion).toBe("2.0");
      expect(inspection.animations).toBe(0);
      expect(inspection.skins).toBe(1);
      expect(inspection.meshes).toBe(1);
      expect(inspection.scenes).toBe(1);
      expect(gltf.animations).toHaveLength(0);
      expect(countSkinnedMeshes(gltf.scene)).toBe(1);
      expect(hash(bytes)).toBe(fixture.sha256);
      expect(bytes.byteLength).toBe(fixture.byteLength);
    }
  });

  test("variants preserve or remove the intended topology", async () => {
    const manifest = await readManifest();
    const byId = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture] as const));
    const canonical = byId.get("canonical");
    const renamed = byId.get("renamed-bones");
    const ape = byId.get("ape-proportions");
    const extra = byId.get("extra-bones");
    const incomplete = byId.get("incomplete");
    if (!canonical || !renamed || !ape || !extra || !incomplete) throw new Error("Fixture manifest is incomplete.");

    expect(renamed.inspection.joints).toBe(canonical.inspection.joints);
    expect(ape.inspection.joints).toBe(canonical.inspection.joints);
    expect(extra.inspection.joints).toBe(canonical.inspection.joints + 6);
    expect(incomplete.inspection.joints).toBe(canonical.inspection.joints - 4);
    expect(renamed.inspection.nodeNames.some((name) => /hips|head|hand|foot|arm|leg/i.test(name))).toBe(false);
    expect(extra.inspection.jointNames).toEqual(expect.arrayContaining([
      "Wing_L_01",
      "Wing_L_02",
      "Wing_R_01",
      "Wing_R_02",
      "Ponytail_01",
      "Ponytail_02",
    ]));
    expect(incomplete.inspection.nodeNames).not.toEqual(expect.arrayContaining([
      "LeftLeg",
      "RightLeg",
      "LeftForeArm",
      "RightForeArm",
    ]));

    const canonicalGltf = await loadGlb(resolve(ASSET_DIRECTORY, canonical.file));
    const apeGltf = await loadGlb(resolve(ASSET_DIRECTORY, ape.file));
    const canonicalArm = worldDistance(canonicalGltf.scene, "LeftArm", "LeftForeArm");
    const apeArm = worldDistance(apeGltf.scene, "LeftArm", "LeftForeArm");
    const canonicalThigh = worldDistance(canonicalGltf.scene, "LeftUpLeg", "LeftLeg");
    const apeThigh = worldDistance(apeGltf.scene, "LeftUpLeg", "LeftLeg");
    expect(apeArm).toBeGreaterThan(canonicalArm * 1.5);
    expect(apeThigh).toBeLessThan(canonicalThigh * 0.85);
  });

  test("all copied source and runtime fixtures remain below the one MiB budget", async () => {
    const manifest = await readManifest();
    const runtimePaths = manifest.fixtures.map((fixture) => fixture.file);
    const budgetedPaths = COPIED_SOURCE_ASSETS_AVAILABLE
      ? [SOURCE_FILE, LICENSE_FILE, PROVENANCE_FILE, ...runtimePaths]
      : runtimePaths;
    let actualBudgetedBytes = 0;
    for (const path of budgetedPaths) actualBudgetedBytes += (await stat(resolve(ASSET_DIRECTORY, path))).size;
    const allManagedBytes = actualBudgetedBytes + (await stat(MANIFEST_PATH)).size;

    if (COPIED_SOURCE_ASSETS_AVAILABLE) expect(actualBudgetedBytes).toBe(manifest.budget.totalBytes);
    else expect(actualBudgetedBytes).toBe(manifest.fixtures.reduce((sum, fixture) => sum + fixture.byteLength, 0));
    expect(manifest.budget.limitBytes).toBe(ASSET_BUDGET_BYTES);
    expect(manifest.budget.remainingBytes).toBe(ASSET_BUDGET_BYTES - manifest.budget.totalBytes);
    expect(manifest.budget.totalBytes).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    expect(actualBudgetedBytes).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    expect(allManagedBytes).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    for (const fixture of manifest.fixtures) expect(fixture.byteLength).toBeLessThan(ASSET_BUDGET_BYTES);
  });

  sourceRegenerationTest("regeneration is byte-for-byte deterministic and matches checked-in assets", async () => {
    const scratchParent = resolve(ENGINE_ROOT, ".local", "motion-lab-fixture-tests");
    await mkdir(scratchParent, { recursive: true });
    const firstDirectory = await mkdtemp(resolve(scratchParent, "first-"));
    const secondDirectory = await mkdtemp(resolve(scratchParent, "second-"));
    try {
      const firstManifest = await generateMotionLabFixtures({ outputDirectory: firstDirectory });
      const secondManifest = await generateMotionLabFixtures({ outputDirectory: secondDirectory });
      expect(firstManifest).toEqual(secondManifest);

      for (const relativePath of managedPaths(firstManifest)) {
        const [checkedIn, first, second] = await Promise.all([
          readFile(resolve(ASSET_DIRECTORY, relativePath)),
          readFile(resolve(firstDirectory, relativePath)),
          readFile(resolve(secondDirectory, relativePath)),
        ]);
        expect(Buffer.compare(first, second)).toBe(0);
        expect(Buffer.compare(first, checkedIn)).toBe(0);
      }
    } finally {
      await Promise.all([
        rm(firstDirectory, { force: true, recursive: true }),
        rm(secondDirectory, { force: true, recursive: true }),
      ]);
    }
  }, 30_000);
});
