import type { Material3D } from "./contracts.ts";

/** Validate and write one material's renderer-neutral float record. */
export function writePackedMaterial3D(data: Float32Array, offset: number, material: Material3D): void {
  data[offset] = finiteAt(material.baseColor, 0, 1, "baseColor");
  data[offset + 1] = finiteAt(material.baseColor, 1, 1, "baseColor");
  data[offset + 2] = finiteAt(material.baseColor, 2, 1, "baseColor");
  data[offset + 3] = unitInterval(finiteAt(material.baseColor, 3, 1, "baseColor"), "baseColor[3]");
  data[offset + 4] = finiteAt(material.emissive, 0, 0, "emissive");
  data[offset + 5] = finiteAt(material.emissive, 1, 0, "emissive");
  data[offset + 6] = finiteAt(material.emissive, 2, 0, "emissive");
  data[offset + 7] = unitInterval(material.metallic ?? 0, "metallic");
  data[offset + 8] = unitInterval(material.roughness ?? 1, "roughness");
  data[offset + 9] = unitInterval(material.alphaCutoff ?? 0.5, "alphaCutoff");
  data[offset + 10] = finiteAt(material.uvOffset, 0, 0, "uvOffset");
  data[offset + 11] = finiteAt(material.uvOffset, 1, 0, "uvOffset");
  data[offset + 12] = finiteAt(material.uvScale, 0, 1, "uvScale");
  data[offset + 13] = finiteAt(material.uvScale, 1, 1, "uvScale");
  data[offset + 14] = finite(material.uvRotation ?? 0, "uvRotation");
  data[offset + 15] = integerRange(material.toon?.bands ?? 3, 2, 8, "toon.bands");
  data[offset + 16] = color(material.toon?.shadowColor, 0, 0.22, "toon.shadowColor");
  data[offset + 17] = color(material.toon?.shadowColor, 1, 0.25, "toon.shadowColor");
  data[offset + 18] = color(material.toon?.shadowColor, 2, 0.38, "toon.shadowColor");
  data[offset + 19] = color(material.toon?.rimColor, 0, 1, "toon.rimColor");
  data[offset + 20] = color(material.toon?.rimColor, 1, 1, "toon.rimColor");
  data[offset + 21] = color(material.toon?.rimColor, 2, 1, "toon.rimColor");
  data[offset + 22] = unitInterval(material.toon?.rimStrength ?? 0.28, "toon.rimStrength");
  data[offset + 23] = range(material.toon?.outlineWidth ?? 0.012, 0, 0.2, "toon.outlineWidth");
  data[offset + 24] = color(material.toon?.outlineColor, 0, 0.025, "toon.outlineColor");
  data[offset + 25] = color(material.toon?.outlineColor, 1, 0.03, "toon.outlineColor");
  data[offset + 26] = color(material.toon?.outlineColor, 2, 0.055, "toon.outlineColor");
  data[offset + 27] = color(material.toon?.outlineColor, 3, 1, "toon.outlineColor");
}

function finiteAt(values: ArrayLike<number> | undefined, index: number, fallback: number, label: string) { return finite(values?.[index] ?? fallback, `${label}[${index}]`); }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite; received ${value}.`); return value; }
function color(values: ArrayLike<number> | undefined, index: number, fallback: number, label: string) { return unitInterval(finiteAt(values, index, fallback, label), `${label}[${index}]`); }
function unitInterval(value: number, label: string) { return range(value, 0, 1, label); }
function range(value: number, min: number, max: number, label: string) { value = finite(value, label); if (value < min || value > max) throw new RangeError(`${label} must be from ${min} through ${max}; received ${value}.`); return value; }
function integerRange(value: number, min: number, max: number, label: string) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer from ${min} through ${max}; received ${value}.`); return value; }
