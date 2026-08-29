import type { CollisionKernel } from "@hyperfocus/engine";
import type { NpcEntity } from "./shared-contracts.ts";
import { clamp } from "./shared-replication-projection.ts";
import { bodyRadius, canOccupy } from "./shared-world-physics.ts";
import { mmoSkillDemoMap } from "./shared-world-runtime.ts";

export function moveNpcBy(kernel: CollisionKernel, npc: NpcEntity, dx: number, dy: number, ignoreTerrain = false) {
  const nextX = npc.x + dx;
  const nextY = npc.y + dy;
  if (ignoreTerrain || canOccupy(kernel, nextX, npc.y, bodyRadius(npc))) npc.x = clamp(nextX, bodyRadius(npc), mmoSkillDemoMap.pixelWidth - bodyRadius(npc));
  if (ignoreTerrain || canOccupy(kernel, npc.x, nextY, bodyRadius(npc))) npc.y = clamp(nextY, bodyRadius(npc), mmoSkillDemoMap.pixelHeight - bodyRadius(npc));
}

export function npcSpeedScale(npc: NpcEntity) {
  return (npc.slowMs ?? 0) > 0 ? 0.8 : 1;
}

export function moveNpcToward(
  kernel: CollisionKernel,
  npc: NpcEntity,
  target: Pick<NpcEntity, "x" | "y">,
  speed: number,
  dt: number,
  ignoreTerrain = false
) {
  const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, move.x * scaled * dt, move.y * scaled * dt, ignoreTerrain);
}
