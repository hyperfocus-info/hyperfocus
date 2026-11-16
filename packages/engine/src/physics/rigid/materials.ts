import type { RigidBodyDefinition3D } from "../rigid-3d.ts";

export const RIGID_MATERIAL_PRESET_IDS_3D = ["character", "soil", "wood", "stone", "metal", "ice", "rubber"] as const;

export type RigidMaterialPresetId3D = typeof RIGID_MATERIAL_PRESET_IDS_3D[number];

export type RigidMaterial3D = { friction: number; restitution: number; linearDamping: number; angularDamping: number };

export const RIGID_MATERIAL_PRESETS_3D: Readonly<Record<RigidMaterialPresetId3D, Readonly<RigidMaterial3D>>> = {
  character: { friction: .72, restitution: .06, linearDamping: 1, angularDamping: 1 },
  soil: { friction: .9, restitution: .02, linearDamping: .8, angularDamping: .25 },
  wood: { friction: .65, restitution: .18, linearDamping: .35, angularDamping: .16 },
  stone: { friction: .75, restitution: .08, linearDamping: .2, angularDamping: .15 },
  metal: { friction: .45, restitution: .12, linearDamping: .12, angularDamping: .08 },
  ice: { friction: .03, restitution: .02, linearDamping: .01, angularDamping: .01 },
  rubber: { friction: .88, restitution: .72, linearDamping: .45, angularDamping: .2 },
};

/** Expands a semantic contact material into ordinary portable rigid-body coefficients. */
export function rigidMaterialPreset3D(id: RigidMaterialPresetId3D): RigidMaterial3D {
  const preset = RIGID_MATERIAL_PRESETS_3D[id];
  if (!preset) throw new Error(`Unsupported rigid material preset ${String(id)}; choose ${RIGID_MATERIAL_PRESET_IDS_3D.join(", ")}.`);
  return { ...preset };
}

/** Returns the semantic preset only when all authored contact coefficients match exactly. */
export function identifyRigidMaterialPreset3D(material: Pick<RigidBodyDefinition3D, "friction" | "restitution" | "linearDamping" | "angularDamping">): RigidMaterialPresetId3D | undefined {
  return RIGID_MATERIAL_PRESET_IDS_3D.find((id) => {
    const preset = RIGID_MATERIAL_PRESETS_3D[id];
    return material.friction === preset.friction && material.restitution === preset.restitution && material.linearDamping === preset.linearDamping && material.angularDamping === preset.angularDamping;
  });
}
