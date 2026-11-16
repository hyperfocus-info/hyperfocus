import { cos, sin } from '../../../math/simulation.ts';
import { tuple3 } from '../../../math/tuples.ts';
import { createGltfPoseOutput, evaluateGltfAnimationPose, type CookedGltfRig, type GltfPoseOutput } from '../../../assets/gltf-skin-animation.ts';
import type { PoseTwoBoneIKSolver } from '../../../motion/solvers/pose-ik.ts';
import type { PoseBuffer } from '../../../motion/pose-buffer.ts';
import { inferHumanoidSemanticFromBoneName } from '../../../motion/mapping.ts';
import { humanoidSemantics, requiredHumanoidSemantics, type CompiledSemanticRig, type HumanoidSemantic } from '../../../motion/rig.ts';
import { createRenderCommandBuffer3D } from '../../../render/3d-scene.ts';
import { createRigidWorld3D, type RigidShape3D, type RigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration, PortableAsset3D } from '../declaration.ts';
import { requireMapValue } from '../runtime-assets.ts';
import { samplePlatformPosition3D, samplePlatformRotation3D } from '../motion/platform-motion.ts';
import { createDeliveredSceneResources3D } from './delivery-resources.ts';
import { createRuntimeEntityApplicator3D } from './entities.ts';
import { createRuntimeMaterialApplicator3D } from './materials.ts';
import { setRuntimeRotationY3D as setRotationY, type EntityApplicationStrategy3D } from './entity-transforms.ts';
import { prepareRuntimeProject3D } from './preflight.ts';

type Hyperfocus3DScene = Hyperfocus3DDeclaration['scenes'][number];
type Hyperfocus3DEntity = Hyperfocus3DScene['entities'][number];
type Hyperfocus3DPhysicsEntity = Hyperfocus3DEntity & { physics: NonNullable<Hyperfocus3DEntity['physics']> };
type Vector3 = [number, number, number];
export type SkeletonBinding = { rigId: string; rig: CookedGltfRig; semanticRig: CompiledSemanticRig; skinIndex: number; meshNode: number; handle: number; poseA: GltfPoseOutput; poseB: GltfPoseOutput; rootPose: GltfPoseOutput; poseView: PoseBuffer; ik: Map<string, PoseTwoBoneIKSolver>; palette: Float32Array };

/** Allocate the complete initial runtime state, without installing execution closures.
 * Each call owns its scene, physics and pose storage. Assets are borrowed read-only
 * until this promise settles; no timers, browser or GPU resources are created.
 * Authoring preflight uses this same operation so initialization errors stay exact. */
export async function createRuntimeStartup3D(project: unknown, assets: readonly PortableAsset3D[], options: { entityApplication?: EntityApplicationStrategy3D; entityApplicationDiagnostics?: boolean } = {}) {
  const { declaration, resources, diagnostics, assetById, cookedById, rigById } = await prepareRuntimeProject3D(project, assets);
  const active = declaration.scenes.find((item) => item.id === declaration.activeSceneId);
  if (!active) throw new Error(`Validated 3D declaration is missing active scene ${declaration.activeSceneId}.`);
  const { scene, meshHandles, billboardMesh, textures, textureHandles, materialHandles, lightHandles } = createDeliveredSceneResources3D({ declaration, resources, active, cooked: {assetById,cookedById,rigById} });
  const transforms = new Map<string, number>();
  const instanceHandles = new Map<string, number>();
  const skeletonBindings = new Map<string, SkeletonBinding>();
  for (const entity of active.entities) {
    const transform = scene.transforms.create();
    scene.transforms.setPosition(transform, ...entity.position);
    scene.transforms.setScale(transform, ...entity.scale);
    setRotationY(scene, transform, entity.rotationY);
    let binding: SkeletonBinding | undefined;
    if (entity.skeleton) {
      const rig = requireMapValue(rigById, entity.skeleton.rigId, `3D rig ${entity.skeleton.rigId}`), skeleton = rig.skeletons[entity.skeleton.skinIndex]!;
      const palette = new Float32Array(skeleton.jointNodes.length * 16);
      const poseA = createGltfPoseOutput(rig), semanticRig = semanticRigFromGltf(rig);
      binding = { rigId: entity.skeleton.rigId, rig, semanticRig, skinIndex: entity.skeleton.skinIndex, meshNode: entity.skeleton.meshNode, handle: scene.createSkeleton(skeleton.jointNodes.length), poseA, poseB: createGltfPoseOutput(rig), rootPose: createGltfPoseOutput(rig), poseView: poseBufferView(poseA), ik: new Map(), palette };
      const clip = declaration.rigs!.find((item) => item.id === binding!.rigId)!.clips[0];
      if (!clip) throw new Error(`Rig ${binding.rigId} needs at least one declared clip.`);
      evaluateGltfAnimationPose(rig, { skeleton: binding.skinIndex, clip: clip.animation, timeSeconds: 0, loop: true, meshNode: binding.meshNode }, binding.poseA, binding.palette);
      scene.setSkeletonMatrices(binding.handle, binding.palette); skeletonBindings.set(entity.id, binding);
    }
    const handles = requireMapValue(materialHandles, entity.materialId, `3D material handles ${entity.materialId}`), materialHandle = entity.skeleton ? handles.skinned : handles.static;
    if (materialHandle === undefined) throw new Error(`3D material ${entity.materialId} has no ${entity.skeleton ? "skinned" : "static"} variant.`);
    instanceHandles.set(entity.id, scene.createInstance({
      mesh: requireMapValue(meshHandles, entity.meshId, `3D mesh handle ${entity.meshId}`),
      material: materialHandle,
      transform,
      ...(binding ? { skeleton: binding.handle } : {}),
    }));
    transforms.set(entity.id, transform);
  }
  const effectTransforms: number[] = [], effectInstances: number[] = [], defaultEffectMaterial = [...materialHandles.entries()].find(([, handles]) => handles.static !== undefined);
  if ((active.effectCapacity ?? 0) > 0 && (billboardMesh === undefined || defaultEffectMaterial?.[1].static === undefined)) throw new Error("A positive 3D effect capacity requires at least one canonical material.");
  for (let index = 0; index < (active.effectCapacity ?? 0); index += 1) { const transform = scene.transforms.create(), instance = scene.createInstance({ mesh: billboardMesh!, material: defaultEffectMaterial![1].static!, transform }); scene.setInstanceVisible(instance, false); effectTransforms.push(transform); effectInstances.push(instance); }
  const commands = createRenderCommandBuffer3D({ commands: active.entities.length + (active.effectCapacity ?? 0), instances: active.entities.length + (active.effectCapacity ?? 0), lights: active.lights.length });
  const physicsEntities = active.entities.filter(hasPhysics);
  const motionEntities = active.entities.filter(entity => entity.controller || entity.animation);
  const applyEntities = createRuntimeEntityApplicator3D({ scene, entities: active.entities, transforms, instances: instanceHandles, meshes: meshHandles, materials: materialHandles, transformStrategy: options.entityApplication, diagnostics: options.entityApplicationDiagnostics });
  const applyMaterials = createRuntimeMaterialApplicator3D({ scene, materials: declaration.materials, handles: materialHandles, textures: textureHandles });
  const platformRiders = active.entities.filter(entity => entity.physics?.type === 'dynamic');
  const physics = createRigidWorld3D({
    capacity: Math.max(1, physicsEntities.length),
    maxContacts: Math.max(1, physicsEntities.length * 4),
    maxCandidatePairs: Math.max(1, physicsEntities.length * 8),
    maxCcdTests: Math.max(1, physicsEntities.length * 4),
  });
  const physicsHandles = new Map<string, number>();
  for (const entity of physicsEntities) {
    const definition = entity.physics;
    const shape: RigidShape3D = definition.shape === "sphere"
      ? { kind: "sphere", radius: Math.max(...entity.scale.map(Math.abs)) }
      : { kind: "box", halfX: Math.abs(entity.scale[0]), halfY: Math.abs(entity.scale[1]), halfZ: Math.abs(entity.scale[2]) };
    physicsHandles.set(entity.id, physics.addBody({ id: entity.id, type: definition.type, shape, x: entity.position[0], y: entity.position[1], z: entity.position[2], rotation: [0, sin(entity.rotationY / 2), 0, cos(entity.rotationY / 2)], gravityScale: definition.gravityScale, continuous: definition.continuous }));
  }
  const positions = new Map<string, Vector3>();
  const rotations = new Map<string, number>();
  initializeRuntimePoses(active, physics, positions, rotations);
  return { declaration, diagnostics, active, scene, meshHandles, billboardMesh, textures, textureHandles, materialHandles, lightHandles,
    transforms, instanceHandles, skeletonBindings, effectTransforms, effectInstances, commands, physicsEntities, motionEntities,
    applyEntities, applyMaterials, platformRiders, physics, physicsHandles, positions, rotations };
}

function semanticRigFromGltf(rig: CookedGltfRig): CompiledSemanticRig {
  const semanticIndices = new Int32Array(humanoidSemantics.length); semanticIndices.fill(-1);
  const claimed = new Set<number>();
  for (let node = 0; node < rig.nodeIds.length; node += 1) {
    const semantic = inferHumanoidSemanticFromBoneName(rig.nodeIds[node]!); if (!semantic) continue;
    const semanticIndex = humanoidSemantics.indexOf(semantic); if (semanticIndices[semanticIndex] >= 0 || claimed.has(node)) continue;
    semanticIndices[semanticIndex] = node; claimed.add(node);
  }
  const mapped = (semantic: HumanoidSemantic) => semanticIndices[humanoidSemantics.indexOf(semantic)] >= 0;
  const chain = (...semantics: HumanoidSemantic[]) => semantics.every(mapped);
  const leftArm = chain("leftUpperArm", "leftLowerArm", "leftHand"), rightArm = chain("rightUpperArm", "rightLowerArm", "rightHand"), leftLeg = chain("leftUpperLeg", "leftLowerLeg", "leftFoot"), rightLeg = chain("rightUpperLeg", "rightLowerLeg", "rightFoot");
  const capabilities = { baseLocomotion: mapped("hips") && (mapped("leftUpperLeg") || mapped("rightUpperLeg")), aim: mapped("head"), leftArm, rightArm, leftLeg, rightLeg, leftReach: leftArm, rightReach: rightArm, leftFootPlant: leftLeg, rightFootPlant: rightLeg };
  const diagnostics = requiredHumanoidSemantics.filter((semantic) => !mapped(semantic)).map((semantic) => ({ code: "semantic-unresolved", message: `Required semantic ${semantic} is unresolved`, severity: "warning" as const, semantic }));
  const tags = new Map<string, Uint32Array>(); for (const semantic of humanoidSemantics) { const index = semanticIndices[humanoidSemantics.indexOf(semantic)]; if (index >= 0) tags.set(semantic, Uint32Array.of(index)); }
  const motionRootIndex = Math.max(0, rig.nodeParents.findIndex((parent) => parent < 0));
  return { deformCount: rig.nodeCount, totalCount: rig.nodeCount, motionRootIndex, sourceParents: rig.nodeParents, semanticParents: rig.nodeParents, evaluationOrder: rig.nodeTopologicalOrder, referenceRotations: rig.nodeRotations, referenceTranslations: rig.nodeTranslations, referenceScales: rig.nodeScales, sourceReferenceRotations: rig.nodeRotations, sourceReferenceTranslations: rig.nodeTranslations, sourceReferenceScales: rig.nodeScales, semanticIndices, tags, capabilities, diagnostics, validated: diagnostics.length === 0 };
}

function poseBufferView(pose: GltfPoseOutput): PoseBuffer { return { buffer: pose.rotations.buffer, byteOffset: 0, byteLength: pose.rotations.byteLength + pose.translations.byteLength + pose.scales.byteLength, deformCount: pose.translations.length / 3, totalCount: pose.translations.length / 3, rotations: pose.rotations, translations: pose.translations, scales: pose.scales }; }

function hasPhysics(entity: Hyperfocus3DEntity): entity is Hyperfocus3DPhysicsEntity {
  return entity.physics !== undefined;
}

function initializeRuntimePoses(active: Hyperfocus3DDeclaration['scenes'][number], physics: RigidWorld3D, positions: Map<string, Vector3>, rotations: Map<string, number>) {
  for (const entity of active.entities) {
    const start = entity.animation?.kind === 'ping-pong' && entity.animation.travelSeconds !== undefined ? samplePlatformPosition3D(entity, 0) : tuple3(...entity.position);
    positions.set(entity.id, start);
    if (entity.physics) physics.setPosition(entity.id, ...start);
    const rotation = samplePlatformRotation3D(entity, 0);
    rotations.set(entity.id, rotation);
    if (entity.physics) physics.setRotation(entity.id, 0, sin(rotation / 2), 0, cos(rotation / 2));
  }
}
