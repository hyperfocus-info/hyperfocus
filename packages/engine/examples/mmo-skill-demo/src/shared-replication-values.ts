import type { MmoSkillDemoAction } from "./shared-contracts.ts";

export function u16Ms(value: number) {
  return Math.max(0, Math.min(65535, Math.floor(Number.isFinite(value) ? value : 0)));
}

export function validAction(action: unknown): MmoSkillDemoAction {
  return action === "attack" ||
    action === "mine" ||
    action === "woodcut" ||
    action === "lmb" ||
    action === "rmb" ||
    action === "space" ||
    action === "q" ||
    action === "e" ||
    action === "r" ||
    action === "interact" ||
    action === "travel" ||
    action === "bank" ||
    action === "trade" ||
    action === "use-item" ||
    action === "config" ||
    action === "dev"
    ? action
    : "idle";
}
