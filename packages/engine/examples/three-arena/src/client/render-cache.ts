import type * as Three from "three";
import { THREE } from "./boot-and-dom.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const cachedGeometry = runtimeCallback("contentUi", "cachedGeometry");
const cachedMeshBasicMaterial = runtimeCallback("contentUi", "cachedMeshBasicMaterial");
import { telemetry } from "./telemetry-core.ts";
import type { EffectKind } from "./runtime-types.ts";

export function getBulletGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:bullet", () => new THREE.SphereGeometry(0.22, 12, 8));
}

export function getBulletTrailGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:bulletTrail", () => new THREE.CylinderGeometry(0.055, 0.2, 1.85, 8, 1, true));
}

export function getSparkGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:spark", () => new THREE.BoxGeometry(0.12, 0.045, 0.045));
}

export function getBulletMaterial(colorValue: Three.ColorRepresentation): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:bullet:${String(colorValue)}`, () => getEffectMaterial(new THREE.Color(colorValue), 1));
}

export function getTrailMaterial(colorValue: Three.ColorRepresentation): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:trail:${String(colorValue)}`, () => getEffectMaterial(new THREE.Color(colorValue), 0.42));
}

export function getSparkMaterial(color: Three.Color): Three.MeshBasicMaterial {
  return cachedMeshBasicMaterial(`material:spark:${color.getHexString()}`, () => getEffectMaterial(color, 0.92));
}

export function getEffectMaterial(color: Three.ColorRepresentation, opacity: number): Three.MeshBasicMaterial {
  telemetry.materialCreates += 1;
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  material.userData = { opacityBase: opacity };
  return material;
}

export function getEffectGeometry(kind: EffectKind): Three.BufferGeometry {
  return cachedGeometry(`geometry:effect:${kind}`, () => {
    const radius = kind === "muzzle" ? 0.28 : kind === "blast" ? 0.72 : 0.46;
    return new THREE.SphereGeometry(radius, kind === "muzzle" ? 10 : 14, kind === "muzzle" ? 8 : 10);
  });
}
