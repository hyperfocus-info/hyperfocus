import type { RewardItem } from "./model.ts";

/** One starter per equipment/style slot. Human identity choices remain freely available. */
export const starterCosmetics: Readonly<Record<string, string>> = {
  top: 'gi', bottom: 'straight', shoes: 'boots', 'top-color': 'teal', 'bottom-color': 'navy', 'shoes-color': 'navy', 'belt-color': 'gold',
  'intro-pose': 'salute', 'victory-pose': 'fists-up', 'movement-style': 'classic', 'hit-style': 'classic', particles: 'classic', card: 'classic', 'recovery-style': 'stand-up',
};
export function canEquipRewardOption(slot: string, option: string, collection: readonly RewardItem[]) {
  return !Object.hasOwn(starterCosmetics, slot) || starterCosmetics[slot] === option || collection.some(item => item.slot === slot && item.option === option);
}
/** Free, duplicate and owned options cannot consume a cosmetic purchase. */
export function availableRewardItems(items: readonly RewardItem[], collection: readonly RewardItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.slot}:${item.option}`;
    if (seen.has(key) || canEquipRewardOption(item.slot, item.option, collection)) return false;
    seen.add(key);return true;
  });
}
