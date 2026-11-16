import { positiveInteger, nonNegativeInteger, positiveNumber } from "./src/benchmark-options.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHumanoidMotionController, createWorldPose, evaluateWorldPose, getRigSemanticIndex } from "@hyperfocus/engine/motion";
import { compileThreeHumanoidRig } from "@hyperfocus/engine/motion/three";
import { SkinnedMesh } from "three";

type Options = {
  characters: number;
  frames: number;
  warmup: number;
  assertP95Ms?: number;
  out?: string;
  jointLimits: boolean;
};

const options = parseArgs(process.argv.slice(2));
const fixturePath = resolve(import.meta.dir, "assets", "fixtures", "canonical_rig.glb");
const gltf = await loadGlb(fixturePath);
const skeleton = findSkinnedMesh(gltf).skeleton;
const compiled = compileThreeHumanoidRig(skeleton);
const controllers = Array.from({ length: options.characters }, (_, index) => {
  const controller = createHumanoidMotionController({ rig: compiled.rig, jointLimits: options.jointLimits ? undefined : false });
  const angle = index / Math.max(1, options.characters) * Math.PI * 2;
  controller.move([Math.sin(angle) * 2.4, 0, Math.cos(angle) * 2.4]);
  controller.setAimTarget([Math.sin(angle) * 3, 1.5, Math.cos(angle) * 3], index % 3 === 0 ? 1 : 0.2);
  return controller;
});

for (let frame = 0; frame < options.warmup; frame += 1) {
  for (const controller of controllers) controller.update(0.016666666666666666);
}

const samples = new Float64Array(options.frames);
let maximumFootSlip = 0;
let maximumVerticalError = 0;
let invalidPoses = 0;
for (let frame = 0; frame < options.frames; frame += 1) {
  const started = performance.now();
  for (const controller of controllers) {
    const state = controller.update(0.016666666666666666);
    maximumFootSlip = Math.max(maximumFootSlip, state.metrics.footSlipDistance);
    maximumVerticalError = Math.max(maximumVerticalError, state.metrics.plantedVerticalError);
    if (!state.metrics.poseFinite) invalidPoses += 1;
  }
  samples[frame] = performance.now() - started;
}

const ordered = Array.from(samples).sort((a, b) => a - b);
const probe = controllers[0]!;
const probeWorld = createWorldPose(compiled.rig);
evaluateWorldPose(compiled.rig, probe.state.pose, probeWorld);
const leftFootIndex = getRigSemanticIndex(compiled.rig, "leftFoot");
const rightFootIndex = getRigSemanticIndex(compiled.rig, "rightFoot");
if (leftFootIndex < 0 || rightFootIndex < 0) throw new Error("canonical benchmark fixture did not map both feet");
const lateralFootOrderMeters = probeWorld.translations[leftFootIndex * 3]
  - probeWorld.translations[rightFootIndex * 3];
const result = {
  benchmark: "motion-lab-full-fidelity",
  fixture: "canonical_rig.glb",
  characters: options.characters,
  frames: options.frames,
  warmup: options.warmup,
  jointLimits: options.jointLimits,
  poseStackMs: {
    average: ordered.reduce((sum, value) => sum + value, 0) / ordered.length,
    p50: percentile(ordered, 0.5),
    p95: percentile(ordered, 0.95),
    p99: percentile(ordered, 0.99),
    maximum: ordered.at(-1) ?? 0,
  },
  gates: {
    footSlipMeters: maximumFootSlip,
    lateralFootOrderMeters,
    plantedVerticalErrorMeters: maximumVerticalError,
    invalidPoses,
  },
};

if (options.out) {
  const outputPath = resolve(options.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
if (options.assertP95Ms !== undefined && result.poseStackMs.p95 >= options.assertP95Ms) {
  throw new Error(`motion pose-stack p95 ${result.poseStackMs.p95.toFixed(3)}ms exceeds ${options.assertP95Ms}ms`);
}
if (maximumFootSlip >= 0.02) throw new Error(`motion foot-slip ${maximumFootSlip.toFixed(4)}m exceeds 0.02m`);
if (lateralFootOrderMeters <= 0.02) {
  throw new Error(`canonical semantic feet crossed or collapsed (${lateralFootOrderMeters.toFixed(4)}m lateral order)`);
}
if (maximumVerticalError > 1e-4) throw new Error(`planted vertical error ${maximumVerticalError.toFixed(6)}m exceeds zero-tolerance epsilon`);
if (invalidPoses > 0) throw new Error(`motion benchmark produced ${invalidPoses} invalid poses`);

function parseArgs(args: readonly string[]): Options {
  const parsed: Options = { characters: 15, frames: 600, warmup: 120, jointLimits: true };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key === "--no-joint-limits") {
      parsed.jointLimits = false;
      continue;
    }
    if (key === "--characters") parsed.characters = positiveInteger(value, key);
    else if (key === "--frames") parsed.frames = positiveInteger(value, key);
    else if (key === "--warmup") parsed.warmup = nonNegativeInteger(value, key);
    else if (key === "--assert-p95-ms") parsed.assertP95Ms = positiveNumber(value, key);
    else if (key === "--out") {
      if (!value) throw new Error("--out requires a path");
      parsed.out = value;
    } else {
      throw new Error(`unknown motion-lab bench option: ${key}`);
    }
    index += 1;
  }
  return parsed;
}

async function loadGlb(path: string): Promise<GLTF> {
  const bytes = new Uint8Array(await readFile(path));
  return await new Promise<GLTF>((resolveLoad, rejectLoad) => {
    new GLTFLoader().parse(Uint8Array.from(bytes).buffer, "", resolveLoad, rejectLoad);
  });
}

function findSkinnedMesh(gltf: GLTF): SkinnedMesh {
  const meshes: SkinnedMesh[] = [];
  gltf.scene.traverse((object) => {
    if (meshes.length === 0 && object instanceof SkinnedMesh) meshes.push(object);
  });
  const mesh = meshes[0];
  if (!mesh) throw new Error("benchmark fixture contains no SkinnedMesh");
  return mesh;
}

function percentile(ordered: readonly number[], ratio: number) {
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))] ?? 0;
}
