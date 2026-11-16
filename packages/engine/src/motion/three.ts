import {
  Matrix4,
  Object3D,
  Quaternion,
  Skeleton,
  Vector3,
  type Bone,
  type SkinnedMesh,
} from "three";
import {
  createHumanoidMotionController,
  type HumanoidMotionController,
  type HumanoidMotionControllerOptions,
} from "./humanoid/controller.ts";
import { autoMapHumanoidRig, type AutoMapHumanoidRigOptions } from "./mapping.ts";
import type { MotionQuaternion, MotionVec3 } from "./math.ts";
import type { PoseBuffer } from "./pose-buffer.ts";
import { reconcileT3Rig } from "./reconciliation.ts";
import {
  compileSemanticRig,
  parseT3Rig,
  type CompileSemanticRigOptions,
  type CompiledSemanticRig,
  type RigDiagnostic,
  type RigFingerprint,
  type SourceBoneDescriptor,
  type SourceRigDescriptor,
  type T3RigDocument,
} from "./rig.ts";
import { createWorldPose, evaluateWorldPose, type WorldPose } from "./solvers/world-pose.ts";

export type DescribeThreeSkeletonOptions = {
  assetFingerprint?: RigFingerprint;
  /** Coordinate boundary whose child transforms are baked into source root bones. */
  coordinateRoot?: Object3D;
};

export type ThreeRigCompilationOptions = DescribeThreeSkeletonOptions & {
  t3rig?: string | T3RigDocument;
  mapper?: AutoMapHumanoidRigOptions;
  compile?: CompileSemanticRigOptions;
};

export type ThreeRigCompilation = {
  source: SourceRigDescriptor;
  document: T3RigDocument;
  rig: CompiledSemanticRig;
  diagnostics: readonly RigDiagnostic[];
  reconciled: boolean;
};

export type ThreePoseBindingOptions = {
  skeleton: Skeleton;
  rig: CompiledSemanticRig;
  motionRoot: Object3D;
};

export type ThreePoseBinding = {
  readonly skeleton: Skeleton;
  readonly rig: CompiledSemanticRig;
  readonly motionRoot: Object3D;
  readonly world: WorldPose;
  apply(pose: PoseBuffer): void;
};

export type ThreeHumanoidMotionControllerOptions = Omit<HumanoidMotionControllerOptions, "rig"> & ThreeRigCompilationOptions & {
  root: Object3D;
  motionRoot?: Object3D;
  skeleton?: Skeleton;
};

export type ThreeHumanoidMotionController = HumanoidMotionController & {
  readonly source: SourceRigDescriptor;
  readonly document: T3RigDocument;
  readonly binding: ThreePoseBinding;
  readonly mappingDiagnostics: readonly RigDiagnostic[];
};

/** Describes an already canonicalized (+Y up, +Z forward, meters) Three skeleton. */
export function describeThreeSkeleton(
  skeleton: Skeleton,
  options: DescribeThreeSkeletonOptions = {},
): SourceRigDescriptor {
  if (!(skeleton instanceof Skeleton) || skeleton.bones.length === 0) {
    throw new Error("Three rig description requires a non-empty Skeleton");
  }
  const indexByBone = new Map<Bone, number>();
  for (const [index, bone] of skeleton.bones.entries()) indexByBone.set(bone, index);
  options.coordinateRoot?.updateWorldMatrix(true, false);
  const inverseCoordinateWorld = new Matrix4();
  if (options.coordinateRoot) inverseCoordinateWorld.copy(options.coordinateRoot.matrixWorld).invert();
  const canonicalMatrix = new Matrix4();
  const canonicalPosition = new Vector3();
  const canonicalRotation = new Quaternion();
  const canonicalScale = new Vector3();
  const bones: SourceBoneDescriptor[] = [];
  for (const [index, bone] of skeleton.bones.entries()) {
    const parentIndex = bone.parent && isBone(bone.parent)
      ? (indexByBone.get(bone.parent) ?? -1)
      : -1;
    const siblingOrdinal = resolveSiblingOrdinal(bone, indexByBone);
    const hierarchyPath = resolveHierarchyPath(bone, indexByBone);
    let sourcePosition = bone.position;
    let sourceRotation = bone.quaternion;
    let sourceScale = bone.scale;
    if (parentIndex < 0) {
      bone.updateWorldMatrix(true, false);
      canonicalMatrix.copy(bone.matrixWorld);
      if (options.coordinateRoot) canonicalMatrix.premultiply(inverseCoordinateWorld);
      canonicalMatrix.decompose(canonicalPosition, canonicalRotation, canonicalScale);
      sourcePosition = canonicalPosition;
      sourceRotation = canonicalRotation;
      sourceScale = canonicalScale;
    }
    const translation: MotionVec3 = [sourcePosition.x, sourcePosition.y, sourcePosition.z];
    const rotation: MotionQuaternion = [sourceRotation.x, sourceRotation.y, sourceRotation.z, sourceRotation.w];
    const scale: MotionVec3 = [sourceScale.x, sourceScale.y, sourceScale.z];
    const structuralHash = fingerprint([
      parentIndex,
      siblingOrdinal,
      countBoneChildren(bone, indexByBone),
      ...quantizeTransform(translation, rotation, scale),
    ]);
    bones.push({
      index,
      parentIndex,
      name: bone.name || `bone-${index}`,
      hierarchyPath,
      siblingOrdinal,
      skinJointOrdinal: index,
      bindTransform: { translation, rotation, scale },
      structuralHash,
    });
  }
  const skinFingerprint = fingerprint(bones.flatMap((bone) => [
    bone.parentIndex,
    bone.siblingOrdinal,
    bone.structuralHash.value,
  ]));
  const assetFingerprint = options.assetFingerprint ?? fingerprint(bones.flatMap((bone) => [
    bone.name,
    bone.hierarchyPath,
    bone.structuralHash.value,
  ]));
  return {
    assetFingerprint,
    skinFingerprint,
    normalization: {
      sourceUp: "+y",
      sourceForward: "+z",
      sourceHandedness: "right",
      metersPerUnit: 1,
      sourceToCanonicalRotation: [0, 0, 0, 1],
    },
    bones,
  };
}

export function compileThreeHumanoidRig(
  skeleton: Skeleton,
  options: ThreeRigCompilationOptions = {},
): ThreeRigCompilation {
  const source = describeThreeSkeleton(skeleton, options);
  let document: T3RigDocument;
  let diagnostics: readonly RigDiagnostic[];
  let reconciled = false;
  if (options.t3rig) {
    const result = reconcileT3Rig(source, parseT3Rig(options.t3rig));
    document = result.document;
    diagnostics = result.diagnostics;
    reconciled = result.changed;
  } else {
    const result = autoMapHumanoidRig(source, options.mapper);
    document = result.document;
    diagnostics = result.diagnostics;
  }
  const rig = compileSemanticRig(source, document, options.compile);
  return {
    source,
    document,
    rig,
    diagnostics: [...diagnostics, ...rig.diagnostics],
    reconciled,
  };
}

export function createThreePoseBinding(options: ThreePoseBindingOptions): ThreePoseBinding {
  const { skeleton, rig, motionRoot } = options;
  if (skeleton.bones.length !== rig.deformCount) {
    throw new RangeError("Three skeleton bone count must match semantic rig deformCount");
  }
  const world = createWorldPose(rig);
  const characterRotations = new Float32Array(rig.deformCount * 4);
  const characterTranslations = new Float32Array(rig.deformCount * 3);
  const characterScales = new Float32Array(rig.deformCount * 3);
  const inverseRootRotation = new Float32Array(4);
  const scratchQuaternion = new Float32Array(4);
  const scratchVector = new Float32Array(3);
  const externalParentRotations = new Float32Array(rig.deformCount * 4);
  const externalParentTranslations = new Float32Array(rig.deformCount * 3);
  const externalParentScales = new Float32Array(rig.deformCount * 3);
  const inverseMotionWorld = new Matrix4();
  const externalMatrix = new Matrix4();
  const externalPosition = new Vector3();
  const externalRotation = new Quaternion();
  const externalScale = new Vector3();
  motionRoot.updateWorldMatrix(true, false);
  inverseMotionWorld.copy(motionRoot.matrixWorld).invert();
  for (let index = 0; index < rig.deformCount; index += 1) {
    if (rig.sourceParents[index] >= 0) continue;
    const externalParent = skeleton.bones[index].parent;
    if (!externalParent || externalParent === motionRoot) {
      externalParentRotations[index * 4 + 3] = 1;
      externalParentScales[index * 3] = 1;
      externalParentScales[index * 3 + 1] = 1;
      externalParentScales[index * 3 + 2] = 1;
      continue;
    }
    externalParent.updateWorldMatrix(true, false);
    externalMatrix.multiplyMatrices(inverseMotionWorld, externalParent.matrixWorld);
    externalMatrix.decompose(externalPosition, externalRotation, externalScale);
    externalParentTranslations.set([externalPosition.x, externalPosition.y, externalPosition.z], index * 3);
    externalParentRotations.set([externalRotation.x, externalRotation.y, externalRotation.z, externalRotation.w], index * 4);
    externalParentScales.set([externalScale.x, externalScale.y, externalScale.z], index * 3);
  }

  function apply(pose: PoseBuffer) {
    evaluateWorldPose(rig, pose, world);
    const rootRotationOffset = rig.motionRootIndex * 4;
    const rootTranslationOffset = rig.motionRootIndex * 3;
    const rootQx = world.rotations[rootRotationOffset];
    const rootQy = world.rotations[rootRotationOffset + 1];
    const rootQz = world.rotations[rootRotationOffset + 2];
    const rootQw = world.rotations[rootRotationOffset + 3];
    inverseRootRotation[0] = -rootQx;
    inverseRootRotation[1] = -rootQy;
    inverseRootRotation[2] = -rootQz;
    inverseRootRotation[3] = rootQw;
    const rootScaleX = world.scales[rootTranslationOffset];
    const rootScaleY = world.scales[rootTranslationOffset + 1];
    const rootScaleZ = world.scales[rootTranslationOffset + 2];
    motionRoot.position.set(
      world.translations[rootTranslationOffset],
      world.translations[rootTranslationOffset + 1],
      world.translations[rootTranslationOffset + 2],
    );
    motionRoot.quaternion.set(rootQx, rootQy, rootQz, rootQw);
    motionRoot.scale.set(rootScaleX, rootScaleY, rootScaleZ);

    for (let index = 0; index < rig.deformCount; index += 1) {
      const rotationOffset = index * 4;
      const translationOffset = index * 3;
      multiplyQuaternionAt(
        inverseRootRotation,
        world.rotations,
        rotationOffset,
        characterRotations,
        rotationOffset,
      );
      scratchVector[0] = world.translations[translationOffset] - world.translations[rootTranslationOffset];
      scratchVector[1] = world.translations[translationOffset + 1] - world.translations[rootTranslationOffset + 1];
      scratchVector[2] = world.translations[translationOffset + 2] - world.translations[rootTranslationOffset + 2];
      rotateVector(scratchVector, inverseRootRotation, scratchVector);
      characterTranslations[translationOffset] = scratchVector[0] / rootScaleX;
      characterTranslations[translationOffset + 1] = scratchVector[1] / rootScaleY;
      characterTranslations[translationOffset + 2] = scratchVector[2] / rootScaleZ;
      characterScales[translationOffset] = world.scales[translationOffset] / rootScaleX;
      characterScales[translationOffset + 1] = world.scales[translationOffset + 1] / rootScaleY;
      characterScales[translationOffset + 2] = world.scales[translationOffset + 2] / rootScaleZ;
    }

    for (let index = 0; index < rig.deformCount; index += 1) {
      const bone = skeleton.bones[index];
      const parentIndex = rig.sourceParents[index];
      const rotationOffset = index * 4;
      const translationOffset = index * 3;
      if (parentIndex < 0) {
        const externalRotationOffset = index * 4;
        scratchQuaternion[0] = -externalParentRotations[externalRotationOffset];
        scratchQuaternion[1] = -externalParentRotations[externalRotationOffset + 1];
        scratchQuaternion[2] = -externalParentRotations[externalRotationOffset + 2];
        scratchQuaternion[3] = externalParentRotations[externalRotationOffset + 3];
        multiplyQuaternionAt(
          scratchQuaternion,
          characterRotations,
          rotationOffset,
          scratchQuaternion,
          0,
        );
        scratchVector[0] = characterTranslations[translationOffset] - externalParentTranslations[translationOffset];
        scratchVector[1] = characterTranslations[translationOffset + 1] - externalParentTranslations[translationOffset + 1];
        scratchVector[2] = characterTranslations[translationOffset + 2] - externalParentTranslations[translationOffset + 2];
        inverseRootRotation[0] = -externalParentRotations[externalRotationOffset];
        inverseRootRotation[1] = -externalParentRotations[externalRotationOffset + 1];
        inverseRootRotation[2] = -externalParentRotations[externalRotationOffset + 2];
        inverseRootRotation[3] = externalParentRotations[externalRotationOffset + 3];
        rotateVector(scratchVector, inverseRootRotation, scratchVector);
        bone.position.set(
          scratchVector[0] / externalParentScales[translationOffset],
          scratchVector[1] / externalParentScales[translationOffset + 1],
          scratchVector[2] / externalParentScales[translationOffset + 2],
        );
        bone.quaternion.set(
          scratchQuaternion[0],
          scratchQuaternion[1],
          scratchQuaternion[2],
          scratchQuaternion[3],
        );
        bone.scale.set(
          characterScales[translationOffset] / externalParentScales[translationOffset],
          characterScales[translationOffset + 1] / externalParentScales[translationOffset + 1],
          characterScales[translationOffset + 2] / externalParentScales[translationOffset + 2],
        );
        continue;
      }
      const parentRotationOffset = parentIndex * 4;
      const parentTranslationOffset = parentIndex * 3;
      scratchQuaternion[0] = -characterRotations[parentRotationOffset];
      scratchQuaternion[1] = -characterRotations[parentRotationOffset + 1];
      scratchQuaternion[2] = -characterRotations[parentRotationOffset + 2];
      scratchQuaternion[3] = characterRotations[parentRotationOffset + 3];
      multiplyQuaternionAt(
        scratchQuaternion,
        characterRotations,
        rotationOffset,
        scratchQuaternion,
        0,
      );
      scratchVector[0] = characterTranslations[translationOffset] - characterTranslations[parentTranslationOffset];
      scratchVector[1] = characterTranslations[translationOffset + 1] - characterTranslations[parentTranslationOffset + 1];
      scratchVector[2] = characterTranslations[translationOffset + 2] - characterTranslations[parentTranslationOffset + 2];
      const inverseParent = inverseRootRotation;
      inverseParent[0] = -characterRotations[parentRotationOffset];
      inverseParent[1] = -characterRotations[parentRotationOffset + 1];
      inverseParent[2] = -characterRotations[parentRotationOffset + 2];
      inverseParent[3] = characterRotations[parentRotationOffset + 3];
      rotateVector(scratchVector, inverseParent, scratchVector);
      bone.position.set(
        scratchVector[0] / characterScales[parentTranslationOffset],
        scratchVector[1] / characterScales[parentTranslationOffset + 1],
        scratchVector[2] / characterScales[parentTranslationOffset + 2],
      );
      bone.quaternion.set(scratchQuaternion[0], scratchQuaternion[1], scratchQuaternion[2], scratchQuaternion[3]);
      bone.scale.set(
        characterScales[translationOffset] / characterScales[parentTranslationOffset],
        characterScales[translationOffset + 1] / characterScales[parentTranslationOffset + 1],
        characterScales[translationOffset + 2] / characterScales[parentTranslationOffset + 2],
      );
    }
    motionRoot.updateMatrixWorld(true);
  }

  return { skeleton, rig, motionRoot, world, apply };
}

export function createThreeHumanoidMotionController(
  options: ThreeHumanoidMotionControllerOptions,
): ThreeHumanoidMotionController {
  const skeleton = options.skeleton ?? findFirstSkeleton(options.root);
  const compilation = compileThreeHumanoidRig(skeleton, {
    ...options,
    coordinateRoot: options.motionRoot ?? options.root,
  });
  const binding = createThreePoseBinding({
    skeleton,
    rig: compilation.rig,
    motionRoot: options.motionRoot ?? options.root,
  });
  const controller = createHumanoidMotionController({
    rig: compilation.rig,
    ...(options.pose ? { pose: options.pose } : {}),
    ...(options.memory ? { memory: options.memory } : {}),
    ...(options.byteOffset === undefined ? {} : { byteOffset: options.byteOffset }),
    ...(options.motor ? { motor: options.motor } : {}),
    ...(options.motorOptions ? { motorOptions: options.motorOptions } : {}),
    ...(options.heightField ? { heightField: options.heightField } : {}),
    ...(options.ground ? { ground: options.ground } : {}),
    ...(options.locomotion ? { locomotion: options.locomotion } : {}),
    ...(options.maxStretch ? { maxStretch: options.maxStretch } : {}),
    ...(options.jointLimits === undefined ? {} : { jointLimits: options.jointLimits }),
  });

  const facade: ThreeHumanoidMotionController = {
    rig: compilation.rig,
    source: compilation.source,
    document: compilation.document,
    binding,
    mappingDiagnostics: compilation.diagnostics,
    motor: controller.motor,
    state: controller.state,
    move(velocity) {
      controller.move(velocity);
      return facade.state;
    },
    setLocomotionIntent(intent) {
      controller.setLocomotionIntent(intent);
      return facade.state;
    },
    update(deltaSeconds) {
      const state = controller.update(deltaSeconds);
      binding.apply(state.pose);
      return state;
    },
    updateFromPhysics(sample) {
      const state = controller.updateFromPhysics(sample);
      binding.apply(state.pose);
      return state;
    },
    teleport(position) {
      controller.teleport(position);
      return facade.state;
    },
    setFacing(facing) {
      controller.setFacing(facing);
      return facade.state;
    },
    setAimTarget(target, weight) {
      controller.setAimTarget(target, weight);
      return facade.state;
    },
    setHandTargets(left, right, weight) {
      controller.setHandTargets(left, right, weight);
      return facade.state;
    },
    setBasePose(basePose) {
      controller.setBasePose(basePose);
      return facade.state;
    },
    setAction(actionId, actionPhase) {
      controller.setAction(actionId, actionPhase);
      return facade.state;
    },
    setActionPose(intent) {
      controller.setActionPose(intent);
      return facade.state;
    },
    punch(intent) {
      controller.punch(intent);
      return facade.state;
    },
    setActionPhase(actionPhase) {
      controller.setActionPhase(actionPhase);
      return facade.state;
    },
    requestRootMotion(delta) {
      controller.requestRootMotion(delta);
      return facade.state;
    },
    recoil(amount) {
      controller.recoil(amount);
      return facade.state;
    },
    reset() {
      const state = controller.reset();
      binding.apply(state.pose);
      return state;
    },
  };
  binding.apply(controller.state.pose);
  return facade;
}

function findFirstSkeleton(root: Object3D) {
  const match: { skeleton?: Skeleton } = {};
  root.traverse((object) => {
    if (!match.skeleton && isSkinnedMesh(object)) match.skeleton = object.skeleton;
  });
  if (!match.skeleton) throw new Error("Three humanoid controller could not find a SkinnedMesh under root");
  return match.skeleton;
}

function resolveSiblingOrdinal(bone: Bone, indexByBone: ReadonlyMap<Bone, number>) {
  if (!bone.parent) return 0;
  let ordinal = 0;
  for (const child of bone.parent.children) {
    if (!isBone(child) || !indexByBone.has(child)) continue;
    if (child === bone) return ordinal;
    ordinal += 1;
  }
  return ordinal;
}

function resolveHierarchyPath(bone: Bone, indexByBone: ReadonlyMap<Bone, number>) {
  const names: string[] = [];
  let cursor: Object3D | null = bone;
  while (cursor && isBone(cursor) && indexByBone.has(cursor)) {
    const index = requireBoneIndex(indexByBone, cursor);
    names.push(cursor.name || `bone-${index}`);
    cursor = cursor.parent;
  }
  names.reverse();
  return names.join("/");
}

function countBoneChildren(bone: Bone, indexByBone: ReadonlyMap<Bone, number>) {
  let count = 0;
  for (const child of bone.children) if (isBone(child) && indexByBone.has(child)) count += 1;
  return count;
}

function isBone(object: Object3D): object is Bone {
  return Reflect.get(object, "isBone") === true;
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return Reflect.get(object, "isSkinnedMesh") === true && Reflect.get(object, "skeleton") instanceof Skeleton;
}

function requireBoneIndex(indexByBone: ReadonlyMap<Bone, number>, bone: Bone) {
  const index = indexByBone.get(bone);
  if (index === undefined) throw new Error("Three skeleton hierarchy contains an unindexed bone");
  return index;
}

function quantizeTransform(translation: MotionVec3, rotation: MotionQuaternion, scale: MotionVec3) {
  return [...translation, ...rotation, ...scale].map((value) => Math.round(value * 100_000));
}

function fingerprint(values: readonly unknown[]): RigFingerprint {
  let hash = 2_166_136_261;
  const text = values.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return { algorithm: "fnv1a32", value: hash.toString(16).padStart(8, "0") };
}

function multiplyQuaternionAt(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  bOffset: number,
  out: Float32Array,
  outOffset: number,
) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[bOffset];
  const by = b[bOffset + 1];
  const bz = b[bOffset + 2];
  const bw = b[bOffset + 3];
  out[outOffset] = aw * bx + ax * bw + ay * bz - az * by;
  out[outOffset + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[outOffset + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[outOffset + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

function rotateVector(vector: Float32Array, quaternion: ArrayLike<number>, out: Float32Array) {
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  const qx = quaternion[0];
  const qy = quaternion[1];
  const qz = quaternion[2];
  const qw = quaternion[3];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
}
