import { expect, test } from 'bun:test';
import { applyRewardCommand, newRewardState, rewardStateSchema, type RewardItem, type RewardState } from "./model.ts";
import { cosmeticTargetProgress, cosmeticTargets, signatureLooks } from "./targets.ts";
const items: RewardItem[] = [...new Map(signatureLooks.flatMap(look => Object.entries(look.selections).map(([slot, option]) => [`${slot}:${option}`, { slot, option, label: `${slot}: ${option}` }] as const))).values()];
const apply = (state: RewardState, action: 'target' | 'unlock' | 'unlock-piece' | 'box', target?: string | null) => applyRewardCommand({ state, command: { type: 'reward-command', requestId: 'test', action, target }, day: 0, random: 0, items });

test('the first individual style is a 100-coin choice; later choices retain their price', () => {
  const first = apply({ ...newRewardState(), coins: 100 }, 'target', 'item:top:relay');
  const bought = apply(first, 'unlock');expect(bought.coins).toBe(0);expect(bought.collection[0]?.option).toBe('relay');
  const second = apply({ ...bought, coins: 100 }, 'target', 'item:top:signature');
  expect(() => apply(second, 'unlock')).toThrow('300 coins');
  expect(() => apply({ ...first, coins: 99 }, 'unlock')).toThrow('100 coins');
});

test('a chosen look unlocks its main garment first without waiting for the whole look', () => {
  const pinned = apply({ ...newRewardState(), coins: 200 }, 'target', 'look:night-courier');
  const first = apply(pinned, 'unlock-piece');expect(first.coins).toBe(0);expect(first.target).toBe(pinned.target);
  expect(first.collection.map(item => [item.slot, item.option])).toEqual([['top', 'signature']]);
  expect(() => apply(first, 'unlock-piece')).toThrow('200 coins');
  const second = apply({ ...first, coins: 200 }, 'unlock-piece');expect(second.collection).toHaveLength(2);expect(second.collection[1]!.slot).toBe('bottom');
});

test('old saves migrate without a goal; pinning and switching preserve coins and ownership', () => {
  const { target: _target, ...old } = newRewardState();expect(rewardStateSchema.parse(old).target).toBeNull();
  const first = apply({ ...newRewardState(), coins: 180 }, 'target', 'look:yard-shift');
  expect(first.coins).toBe(180);expect(first.collection).toEqual([]);
  const switched = apply(first, 'target', 'item:top:relay');expect(switched.target).toBe('item:top:relay');expect(switched.coins).toBe(180);
  expect(apply(switched, 'target', null).target).toBeNull();expect(first.target).toBe('look:yard-shift');
});
test('a chosen style charges exactly once, cannot overspend, and never depends on a random draw', () => {
  const pinned = apply({ ...newRewardState(), coins: 299, collection: [{ slot: 'card', option: 'night', label: 'Night' }] }, 'target', 'item:top:relay');
  expect(() => apply(pinned, 'unlock')).toThrow('300 coins');expect(pinned.collection).toHaveLength(1);
  const bought = apply({ ...pinned, coins: 340 }, 'unlock');expect(bought.coins).toBe(40);expect(bought.collection.map(item => item.option)).toEqual(['night', 'relay']);
  expect(() => apply(bought, 'unlock')).toThrow('already own');expect(bought.coins).toBe(40);
  expect(() => apply(pinned, 'target', 'item:top:missing')).toThrow('current collection');
});
test('coordinated looks grant only missing pieces, with exact owned-piece discounts and catalog authority', () => {
  const target = cosmeticTargets(items).find(item => item.id === 'look:yard-shift')!;
  const initial = cosmeticTargetProgress(target, []);expect(initial.cost).toBe(800);
  const owned = [initial.remaining[0]!], price = cosmeticTargetProgress(target, owned).cost;expect(price).toBe(600);
  const pinned = apply({ ...newRewardState(), coins: price + 40, collection: owned }, 'target', target.id), bought = apply(pinned, 'unlock');
  expect(bought.coins).toBe(40);expect(new Set(bought.collection.map(item => `${item.slot}:${item.option}`)).size).toBe(bought.collection.length);
  expect(cosmeticTargetProgress(target, bought.collection).owned).toBe(true);
  expect(cosmeticTargets(items.filter(item => item.slot !== 'top')).some(item => item.kind === 'look')).toBe(false);
  expect(Object.keys(target.selections).some(slot => ['skin-color', 'hair', 'hair-color', 'face'].includes(slot))).toBe(false);
});
