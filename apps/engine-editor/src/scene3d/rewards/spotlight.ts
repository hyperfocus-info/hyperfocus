import type { RewardItem } from '@hyperfocus/touch-of-death/rewards/model';

/** A persisted item is the reward: animation never delays equipping or invents a draw. */
export function createRewardSpotlight(options: { parent: HTMLElement; color?(item: RewardItem): readonly number[] | undefined; equip(slot: string, option: string): void; preview?(item: RewardItem): void }) {
  const host = options.parent;
  host.innerHTML = `<section class="tod-unlock" hidden aria-label="Latest cosmetic unlock"><div data-unlock-swatch aria-hidden="true"></div><p class="tod-eyebrow" data-unlock-kind>Latest unlock</p><h3 data-unlock-name></h3><p data-unlock-rarity></p><button type="button" data-unlock-equip></button><button type="button" data-unlock-preview>View on your fighter</button></section>`;
  const section = host.querySelector<HTMLElement>('section')!, name = host.querySelector<HTMLElement>('[data-unlock-name]')!;
  const swatch = host.querySelector<HTMLElement>('[data-unlock-swatch]')!, rarity = host.querySelector<HTMLElement>('[data-unlock-rarity]')!;
  const button = host.querySelector<HTMLButtonElement>('button')!, kind = host.querySelector<HTMLElement>('[data-unlock-kind]')!;
  const preview = host.querySelector<HTMLButtonElement>('[data-unlock-preview]')!;preview.hidden = !options.preview;preview.onclick = () => { if (item) options.preview?.(item); };
  let item: RewardItem | undefined, key = '';
  button.onclick = () => { if (item) options.equip(item.slot, item.option); };
  return {
    render(input: { item?: RewardItem; busy: boolean; error: string; fresh: boolean }) {
      item = input.item;section.hidden = !item;if (!item) { key = '';return; }
      const next = `${item.slot}:${item.option}`;
      if (next !== key) {
        key = next;section.dataset.fresh = String(input.fresh);kind.textContent = input.fresh ? 'New style · yours to keep' : 'Latest unlock';
        name.textContent = item.label;rarity.textContent = `${item.rarity ? item.rarity[0]!.toUpperCase() + item.rarity.slice(1) : 'Collected'} · cosmetic only`;
        const color = options.color?.(item);swatch.hidden = !color;
        if (color) swatch.style.backgroundColor = `rgb(${color.slice(0, 3).map(value => Math.round(value * 255)).join(',')})`;
        button.textContent = `Equip ${item.label}`;button.dataset.rewardFocus = `spotlight:${key}`;
      }
      button.disabled = input.busy || !!input.error;preview.disabled = input.busy;
    },
  };
}
