import { THREE } from "./boot-and-dom.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const cachedGeometry = runtimeCallback("contentUi", "cachedGeometry");
const cachedLineBasicMaterial = runtimeCallback("contentUi", "cachedLineBasicMaterial");
import { telemetry } from "./telemetry-core.ts";
import type * as Three from "three";

export function getDamageWedgeGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:indicator:damageWedge", () => {
    const shape = new THREE.Shape();
    const inner = 1.05;
    const outer = 4.6;
    const half = 0.34;
    shape.moveTo(Math.cos(-half) * inner, Math.sin(-half) * inner);
    shape.lineTo(Math.cos(-half) * outer, Math.sin(-half) * outer);
    shape.lineTo(outer, 0);
    shape.lineTo(Math.cos(half) * outer, Math.sin(half) * outer);
    shape.lineTo(Math.cos(half) * inner, Math.sin(half) * inner);
    shape.lineTo(Math.cos(-half) * inner, Math.sin(-half) * inner);
    return new THREE.ShapeGeometry(shape);
  });
}

export function getLineEffectMaterial(colorValue: Three.ColorRepresentation, opacity: number): Three.LineBasicMaterial {
  return cachedLineBasicMaterial(`material:lineEffect:${String(colorValue)}:${opacity}`, () => {
    telemetry.materialCreates += 1;
    const material = new THREE.LineBasicMaterial({
      color: colorValue,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    material.userData = { opacityBase: opacity };
    return material;
  });
}
