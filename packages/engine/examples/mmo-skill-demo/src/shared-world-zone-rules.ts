import type { ZoneId } from "./shared-contracts.ts";

export function isBazaarPressureZone(zoneId: ZoneId) {
  return zoneId === "bazaar" || zoneId === "canaan-desert" || zoneId === "void-rift";
}
