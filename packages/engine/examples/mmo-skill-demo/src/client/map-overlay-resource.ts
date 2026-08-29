import { getGatherableMaterialById } from "../shared/materials.ts";
import { type ResourceEntity } from "../shared-contracts.ts";
import type { WorldGatherableNodeSpec } from "../data/world-gatherables.ts";
import { labelize, zoneLabel, type MapNodeTooltipInfo } from "./map-overlay-data.ts";

export type ResourceMarkerSource =
  | Pick<ResourceEntity, "id" | "kind" | "x" | "y" | "skillId" | "materialId" | "zoneId" | "hp" | "maxHp" | "depleted">
  | WorldGatherableNodeSpec;

export function materialTierForResource(resource: ResourceMarkerSource) {
  if ("tier" in resource) return resource.tier;
  return resource.materialId ? getGatherableMaterialById(resource.materialId)?.tier ?? 1 : 1;
}

export function resourceSkillId(resource: ResourceMarkerSource) {
  if (resource.skillId) return resource.skillId;
  if (resource.kind === "tree") return "lumberjacking";
  if (resource.kind === "ore") return "mining";
  return resource.kind;
}

export function materialForResourceMarker(resource: ResourceMarkerSource) {
  if (typeof resource.materialId === "number") return getGatherableMaterialById(resource.materialId);
  return undefined;
}

export function mapNodeTooltipInfoForResource(resource: ResourceMarkerSource): MapNodeTooltipInfo {
  const material = materialForResourceMarker(resource);
  const tier = material?.tier ?? materialTierForResource(resource);
  const skillId = material?.skillId ?? resourceSkillId(resource);
  const title = material?.name ?? ("materialName" in resource ? resource.materialName : labelize(resource.kind ?? resource.id));
  const lines = [
    `${labelize(skillId)} | Tier ${tier}`,
    material ? `Req Lv ${material.requiredLevel} | ${material.gatherTimeSeconds.toFixed(1)}s collect` : `Node ${labelize(resource.kind ?? "resource")}`
  ];
  if ("authoredZoneId" in resource) lines.push(zoneLabel(resource.authoredZoneId));
  else lines.push(`${zoneLabel(resource.zoneId)} | ${resource.depleted ? "Depleted" : `HP ${resource.hp}/${resource.maxHp}`}`);
  return { title, lines };
}

export function gatherableMarkerColor(resource: ResourceMarkerSource) {
  const tier = materialTierForResource(resource);
  if (tier >= 5) return "#f5f3e8";
  if (tier === 4) return "#c978ff";
  if (tier === 3) return "#f4d36b";
  if (tier === 2) return "#6de2ff";
  const skillId = resourceSkillId(resource);
  if (skillId === "mining" || skillId === "quarrying" || skillId === "gemology") return "#d9dbe5";
  if (skillId === "fishing" || skillId === "dredging") return "#6de2ff";
  return "#7ed66d";
}

export function gatherableMarkerRadius(resource: ResourceMarkerSource, regional = false) {
  const tier = materialTierForResource(resource);
  return (regional ? 2.4 : 3.2) + tier * (regional ? 0.25 : 0.35);
}
