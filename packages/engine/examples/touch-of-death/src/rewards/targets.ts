import type { RewardItem } from "./model.ts";
import { availableRewardItems } from "./inventory.ts";

/** Coordinated native garments and poses, independent of the player's face, hair and skin. */
export const signatureLooks = [
  { id: 'yard-shift', label: 'Yard shift', description: 'Reinforced shoulders, work boots and warm service markings. A grounded salute.',
    selections: { top: 'jacket', bottom: 'straight', shoes: 'boots', 'top-color': 'clay', 'bottom-color': 'navy', 'shoes-color': 'navy', 'belt-color': 'gold', 'intro-pose': 'salute', 'victory-pose': 'salute', particles: 'classic', card: 'sunrise' } },
  { id: 'night-courier', label: 'Night courier', description: 'Asymmetric courier cut, wide trousers and court trainers. A quiet bow after the fight.',
    selections: { top: 'signature', bottom: 'wide', shoes: 'trainers', 'top-color': 'navy', 'bottom-color': 'slate', 'shoes-color': 'cream', 'belt-color': 'clay', 'intro-pose': 'fists-up', 'victory-pose': 'bow', particles: 'ribbons', card: 'night' } },
  { id: 'relay-contender', label: 'Relay contender', description: 'Folded telemetry coat and ivory cloth. Mounted arena sensors pulse as you move.',
    selections: { top: 'relay', bottom: 'straight', shoes: 'boots', 'top-color': 'cream', 'bottom-color': 'navy', 'shoes-color': 'navy', 'belt-color': 'cobalt', 'intro-pose': 'bow', 'victory-pose': 'fists-up', particles: 'relay', card: 'night' } },
] as const;

export const chosenStyleCost = 300;
export const lookPieceCost = 200;
export function itemTargetId(item: Pick<RewardItem, 'slot' | 'option'>) { return `item:${item.slot}:${item.option}`; }

/** Catalog data owns what can be sold. Missing look components hide the entire look. */
export function cosmeticTargets(items: readonly RewardItem[]) {
  const singles = availableRewardItems(items, []).map(item => ({ id: itemTargetId(item), label: item.label, description: 'Choose this exact style. No random draw.', kind: 'item' as const, items: [item], selections: { [item.slot]: item.option } }));
  const looks = signatureLooks.flatMap(look => {
    const parts = Object.entries(look.selections).map(([slot, option]) => items.find(item => item.slot === slot && item.option === option));
    if (parts.some(item => !item)) return [];
    const complete = parts.filter((item): item is RewardItem => item !== undefined);
    return [{ id: `look:${look.id}`, label: look.label, description: look.description, kind: 'look' as const, items: complete, selections: { ...look.selections } }];
  });
  return [...looks, ...singles];
}
export function cosmeticTargetProgress(target: ReturnType<typeof cosmeticTargets>[number], collection: readonly RewardItem[]) {
  const remaining = availableRewardItems(target.items, collection);
  return { remaining, cost: remaining.length * (target.kind === 'look' ? lookPieceCost : collection.length === 0 ? 100 : chosenStyleCost), owned: remaining.length === 0 };
}
