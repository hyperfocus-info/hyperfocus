import type { RewardItem, RewardState } from '@hyperfocus/touch-of-death/rewards/model';
import { cosmeticTargetProgress, cosmeticTargets } from '@hyperfocus/touch-of-death/rewards/targets';
import { createGameSelect, gameSelectStyles } from '@hyperfocus/ui/game-menu';

/** A chosen style uses the same saved balance and authoritative purchase path as random draws. */
export function createRewardGoal(options: {
  parent: HTMLElement; items: readonly RewardItem[];
  action(kind: 'target' | 'unlock' | 'unlock-piece', target?: string | null): void;
  preview?(target: string): void; equip?(selections: Record<string, string>): void;
}) {
  const targets = cosmeticTargets(options.items), host = document.createElement('section');host.className = 'tod-style-goal';
  host.setAttribute('aria-label', 'Your chosen style');
  host.innerHTML = `<p class="tod-eyebrow">Your next signature</p><h3 data-goal-title>Choose a style. Make it yours.</h3><p data-goal-description>Save a goal, then earn coins through sets and first lesson clears.</p>
    <label class="tod-progress-label" data-goal-meter><span data-goal-progress></span><progress max="1" value="0"></progress></label><p data-goal-path></p>
    <div class="tod-goal-actions"><button type="button" data-goal-piece>Unlock next piece · 200 coins</button><button type="button" data-goal-preview>Preview on your fighter</button><button type="button" data-goal-unlock></button><button type="button" data-goal-equip>Equip this look</button></div>
    <details data-goal-choose><summary>Choose your style goal</summary><label>Style goal<button type="button" data-goal-select></button></label><p>Your first individual style: 100 coins, chosen by you. Later exact styles: 300 coins. Coordinated looks: 200 per unowned piece. Owned pieces are never charged again.</p><button type="button" data-goal-pin>Set goal · no coins spent</button><button type="button" data-goal-clear>Clear goal</button></details>`;
  options.parent.append(host);
  const find = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const select = createGameSelect({ element: find<HTMLButtonElement>('[data-goal-select]'), ariaLabel: 'Style goal',
    options: targets.map(target => ({ value: target.id, label: target.label,
      tags: [target.kind === 'look' ? 'Coordinated looks' : 'Individual styles'] })) });
  const style = document.createElement('style');style.textContent = gameSelectStyles;host.append(style);
  let state: RewardState | undefined, blocked = false;
  const target = () => targets.find(target => target.id === state?.target);
  find('[data-goal-pin]').onclick = () => { if (!blocked) options.action('target', select.value); };
  find('[data-goal-clear]').onclick = () => { if (!blocked) options.action('target', null); };
  find('[data-goal-unlock]').onclick = () => { if (!blocked) options.action('unlock'); };
  find('[data-goal-piece]').onclick = () => { if (!blocked) options.action('unlock-piece'); };
  find('[data-goal-preview]').onclick = () => { const chosen = target();if (!blocked && chosen) options.preview?.(chosen.id); };
  find('[data-goal-equip]').onclick = () => { const chosen = target();if (!blocked && chosen && state && cosmeticTargetProgress(chosen, state.collection).owned) options.equip?.(chosen.selections); };
  return {
    dispose() { select.dispose();host.remove(); },
    render(input: { state: RewardState; busy: boolean; error: string; online?: boolean }) {
      const initial = state === undefined, changed = state?.target !== input.state.target;state = input.state;blocked = input.busy || !!input.error;
      const chosen = target(), progress = chosen && cosmeticTargetProgress(chosen, state.collection);
      const incremental = chosen?.kind === 'look' && progress && !progress.owned, nextCost = incremental ? 200 : progress?.cost ?? 0;
      host.hidden = !targets.length;
      if (changed && chosen) { select.value = chosen.id;find<HTMLDetailsElement>('[data-goal-choose]').open = false; }
      else if (initial && !chosen && !state.target) find<HTMLDetailsElement>('[data-goal-choose]').open = true;
      find('[data-goal-title]').textContent = chosen?.label ?? (state.target ? 'This style is unavailable' : state.collection.length ? 'Choose a style. Make it yours.' : 'Your first style. Your choice.');
      find('[data-goal-description]').textContent = chosen?.description ?? (state.target ? 'Choose another goal. Your coins and collection are kept.' : state.collection.length ? 'Save a goal, then earn coins through sets and first lesson clears.' : 'Pick any individual style for 100 coins. Your first set milestone pays for it, win or lose. Preview it before you choose.');
      find('[data-goal-meter]').hidden = !chosen;
      find('[data-goal-progress]').textContent = progress?.owned ? 'Complete · yours to keep' : `${state.coins} / ${nextCost} coins${incremental ? ' · next piece' : ''}`;
      const meter = find<HTMLProgressElement>('progress');meter.max = Math.max(1, nextCost);meter.value = progress?.owned ? meter.max : Math.min(state.coins, meter.max);
      const path = state.coins >= nextCost ? 'Ready to unlock.' : `${Math.ceil((nextCost - state.coins) / 40)} ${input.online ? 'Quick Play or winner-stays' : 'local AI'} sets at 40 coins each. Wins and milestones get you there sooner.`;
      find('[data-goal-path]').textContent = !progress ? 'Setting or changing a goal costs nothing.' : progress.owned ? 'Every piece is unlocked. Equip them together or mix your own outfit.' : incremental ? `Next: ${progress.remaining[0]!.label}. ${progress.remaining.length} pieces left in this look. ${path}` : path;
      for (const button of host.querySelectorAll<HTMLButtonElement>('button')) button.disabled = blocked;
      select.disabled = blocked;
      find<HTMLButtonElement>('[data-goal-pin]').disabled = blocked || !select.value;
      find('[data-goal-clear]').hidden = !state.target;
      find('[data-goal-preview]').hidden = !chosen || !options.preview;
      const piece = find<HTMLButtonElement>('[data-goal-piece]');piece.hidden = !incremental;piece.disabled = blocked || state.coins < 200;
      const unlock = find<HTMLButtonElement>('[data-goal-unlock]');unlock.hidden = !progress || progress.owned || !!incremental && progress.remaining.length === 1;unlock.disabled = blocked || !progress || state.coins < progress.cost;unlock.textContent = `${incremental ? 'Unlock complete look' : 'Unlock exactly this'} · ${progress?.cost ?? 0} coins`;
      const equip = find<HTMLButtonElement>('[data-goal-equip]');equip.hidden = !progress?.owned || !options.equip;equip.textContent = chosen?.kind === 'look' ? 'Equip complete look' : 'Equip this style';
    },
  };
}
