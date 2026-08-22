import type { Group, Object3D, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { clonePreparedThreeObject, loadThreeLoaderAsset } from "@hyperfocus/engine/render/3d";

export const MOTION_LAB_FIXTURE_IDS = [
  "canonical",
  "renamed-bones",
  "ape-proportions",
  "extra-bones",
  "incomplete",
] as const;

export type MotionLabFixtureId = (typeof MOTION_LAB_FIXTURE_IDS)[number];

export const MOTION_LAB_FIXTURE_LABELS: Readonly<Record<MotionLabFixtureId, string>> = {
  "ape-proportions": "Ape proportions",
  canonical: "Canonical rig",
  "extra-bones": "Extra bones",
  incomplete: "Incomplete limbs",
  "renamed-bones": "Renamed bones",
};

export type MotionLabFixtureEntry = {
  byteLength: number;
  expected: {
    completeArmChains: boolean;
    completeLegChains: boolean;
    extraBonePassthrough: boolean;
    nameBasedMapping: boolean;
  };
  file: string;
  id: MotionLabFixtureId;
  inspection: {
    animations: number;
    jointNames: string[];
    joints: number;
    nodeNames: string[];
  };
  sha256: string;
  transform: string;
};

export type MotionLabAssetManifest = {
  budget: {
    limitBytes: number;
    remainingBytes: number;
    totalBytes: number;
  };
  coordinateSystem: {
    forward: string;
    handedness: string;
    targetHeightMeters: number;
    units: string;
    up: string;
  };
  fixtures: MotionLabFixtureEntry[];
  license: {
    id: string;
  };
  source: {
    name: string;
    sha256: string;
  };
};

export type MotionLabFixtureRepository = {
  readonly canonicalJointNames: readonly string[];
  readonly manifest: MotionLabAssetManifest;
  createInstance(id: MotionLabFixtureId): Group;
  entry(id: MotionLabFixtureId): MotionLabFixtureEntry;
};

function isFixtureId(value: unknown): value is MotionLabFixtureId {
  return typeof value === "string" && (MOTION_LAB_FIXTURE_IDS as readonly string[]).includes(value);
}

function findSkinnedMesh(root: Object3D): SkinnedMesh {
  let mesh: SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!mesh && (object as SkinnedMesh).isSkinnedMesh) mesh = object as SkinnedMesh;
  });
  if (!mesh) throw new Error("Fixture contains no Three.js SkinnedMesh.");
  return mesh;
}

function validateManifest(value: unknown): MotionLabAssetManifest {
  if (!value || typeof value !== "object") throw new Error("Motion-lab asset manifest is not an object.");
  const manifest = value as Partial<MotionLabAssetManifest>;
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== MOTION_LAB_FIXTURE_IDS.length) {
    throw new Error("Motion-lab asset manifest does not declare all five fixtures.");
  }
  const ids = manifest.fixtures.map((fixture) => fixture?.id);
  if (!ids.every(isFixtureId) || MOTION_LAB_FIXTURE_IDS.some((id) => !ids.includes(id))) {
    throw new Error("Motion-lab asset manifest fixture identifiers are invalid.");
  }
  if (!manifest.coordinateSystem || !manifest.budget || !manifest.license || !manifest.source) {
    throw new Error("Motion-lab asset manifest metadata is incomplete.");
  }
  return manifest as MotionLabAssetManifest;
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url.pathname}: HTTP ${response.status}.`);
  return await response.json() as unknown;
}

export async function loadMotionLabFixtureRepository(baseUrl = new URL("../", import.meta.url)): Promise<MotionLabFixtureRepository> {
  const manifestUrl = new URL("assets/manifest.json", baseUrl);
  const manifest = validateManifest(await fetchJson(manifestUrl));
  const loader = new GLTFLoader();
  const loaded = new Map<MotionLabFixtureId, Group>();

  await Promise.all(manifest.fixtures.map(async (fixture) => {
    const fixtureUrl = new URL(`assets/${fixture.file}`, baseUrl);
    const gltf = await loadThreeLoaderAsset(loader, fixtureUrl.href, { encodeUrl: false });
    if (gltf.animations.length !== 0) throw new Error(`${fixture.id} must not contain animation clips.`);
    if (findSkinnedMesh(gltf.scene).skeleton.bones.length !== fixture.inspection.joints) {
      throw new Error(`${fixture.id} skin joint count differs from its manifest.`);
    }
    gltf.scene.name = `fixture:${fixture.id}`;
    loaded.set(fixture.id, gltf.scene);
  }));

  const canonical = manifest.fixtures.find((fixture) => fixture.id === "canonical");
  if (!canonical) throw new Error("Canonical fixture metadata is missing.");

  return {
    manifest,
    canonicalJointNames: canonical.inspection.jointNames,
    createInstance(id) {
      const source = loaded.get(id);
      if (!source) throw new Error(`Fixture was not preloaded: ${id}`);
      const instance = clonePreparedThreeObject(source, {
        clone: (object) => clone(object) as Group,
        castShadow: true,
        receiveShadow: true,
      });
      instance.name = `fixture-instance:${id}`;
      return instance;
    },
    entry(id) {
      const entry = manifest.fixtures.find((fixture) => fixture.id === id);
      if (!entry) throw new Error(`Fixture metadata is unavailable: ${id}`);
      return entry;
    },
  };
}
