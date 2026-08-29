import type { ThreeModuleLike } from "@hyperfocus/engine/render/3d";

export type ThreeNamespace = typeof import("three");

export function isCompleteThreeNamespace(value: object): value is ThreeNamespace {
  return "Vector2" in value
    && "Vector3" in value
    && "Quaternion" in value
    && "Raycaster" in value
    && "WebGLRenderer" in value
    && "AnimationMixer" in value;
}

export function isEngineThreeModule(value: object): value is ThreeModuleLike {
  return "WebGLRenderer" in value
    && typeof value.WebGLRenderer === "function"
    && "Scene" in value
    && typeof value.Scene === "function"
    && "Group" in value
    && typeof value.Group === "function"
    && "PerspectiveCamera" in value
    && typeof value.PerspectiveCamera === "function"
    && "OrthographicCamera" in value
    && typeof value.OrthographicCamera === "function"
    && "Color" in value
    && typeof value.Color === "function"
    && "Mesh" in value
    && typeof value.Mesh === "function"
    && "InstancedMesh" in value
    && typeof value.InstancedMesh === "function";
}

export function requireEngineThreeModule(value: ThreeNamespace): ThreeModuleLike {
  if (!isEngineThreeModule(value)) throw new Error("Three Arena requires the complete local Three.js renderer module.");
  return value;
}

export function requireCompleteThreeNamespace(value: object): ThreeNamespace {
  if (!isCompleteThreeNamespace(value)) {
    throw new Error("Three Arena requires the complete Three.js module.");
  }
  return value;
}
