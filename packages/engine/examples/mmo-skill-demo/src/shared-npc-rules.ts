import { PEACE_NPC_ROLES } from "./shared-content-catalog.ts";
import type { NpcEntity } from "./shared-contracts.ts";

export function isPeaceNpc(npc: NpcEntity) {
  return PEACE_NPC_ROLES.has(npc.role);
}
