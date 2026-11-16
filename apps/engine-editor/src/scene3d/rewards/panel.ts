import { availableRewardItems, rewardAchievementProgress, rewardAchievements, type RewardCommand, type RewardItem, type RewardState } from '@hyperfocus/touch-of-death/rewards/model';
import { masteryLessons } from './mastery';
import { itemTargetId } from '@hyperfocus/touch-of-death/rewards/targets';
import { rewardStyles } from './styles.ts';
import { attachGameModal } from '@hyperfocus/ui/game-menu';
import { createGameSections } from '@hyperfocus/ui/game-menu';
import { gameMenuStyles } from '../game-menu/theme';
import { createRewardSpotlight } from './spotlight';
import { createRewardGoal } from './goal';

export function createRewardsPanel(options: { canvas: HTMLCanvasElement; items?: readonly RewardItem[]; color?(item: RewardItem): readonly number[] | undefined; action(action: RewardCommand['action'], achievement?: RewardCommand['achievement'], target?: string | null): void; equip(slot: string, option: string): void; equipLook?(selections: Record<string, string>): void; previewTarget?(target: string): void; viewFighter?(): void; mastery?(): { clears: Record<string, number>; error: string }; practiceLesson?(id: string): void; open(): void; clearInput(): void }) {
  const host = document.createElement('div');host.className = 'hf-rewards';
  host.innerHTML = `<button type="button" data-rewards-open>Rewards</button><dialog aria-label="Your rewards"></dialog>`;
  const prior = host.querySelector('dialog')!;
  prior.innerHTML = `<header class="tod-reward-header"><h2>Your rewards</h2><p data-scope></p></header>
    <div class="tod-reward-layout"><section class="tod-reward-hero" aria-label="Your progress">
      <div data-unlock-host></div><div data-goal-host></div><div data-reward-intro><p class="tod-eyebrow">Earned in the arena</p><h3 class="tod-reward-heading">Make it yours.</h3></div><p class="tod-eyebrow">Coin balance</p><strong data-balance></strong>
      <div data-receipt><div data-particles aria-hidden="true"></div><p role="status" aria-live="polite"></p></div>
      <p data-sets></p><label class="tod-progress-label"><span data-progress-label>Next cosmetic unlock</span> <span data-progress-value></span><progress data-progress max="100" value="0"></progress></label>
      <p class="tod-reward-explanation" data-unlock-path></p><p class="tod-reward-explanation" data-earning-rules></p>
      <details class="tod-goal-summary"><summary>Your next milestones</summary><ul data-goals></ul></details><p data-mastery></p>
    </section><div class="tod-reward-activities">
      <button type="button" data-action="read">Refresh / retry</button>
      <section data-practice-mastery><h3>Your technique journal</h3><p>Successful player attempts, saved on this device. Examples never count. Repeat a technique or take it into a real set; collection completion does not end your practice.</p><div data-practice-records></div><p data-practice-record-error role="status"></p></section><section data-daily><h3>Daily bonus</h3><p data-streak></p><button type="button" data-action="daily">Claim daily bonus</button></section>
      <section data-wheel><h3>Daily wheel</h3><p>One free spin per UTC day.</p><p>25 coins: 50% · 50: 30% · 100: 15% · 250: 5%.</p><button type="button" data-action="wheel">Spin free wheel</button></section>
      <section data-box><h3>Cosmetic collection</h3><p>Every box adds an uncollected style. Equal chances, no duplicates. Starter gear and identity choices are free.</p><p data-remaining></p><button type="button" data-action="box">Open box · 100 coins</button><p data-empty>Your unlocked styles appear here, ready to equip.</p><ul data-collection></ul><button type="button" data-view-fighter>View your fighter</button></section>
      <section data-achievements><h3>Your next milestones</h3><div data-achievement-list></div><details class="tod-all-milestones"><summary>All milestones</summary><div data-other-achievements></div></details></section>
    </div></div><footer class="tod-reward-footer"><button type="button" data-close>Back to game menu</button><p data-help>Earn in the arena. Make it yours.</p></footer>`;
  const style = document.createElement('style');style.textContent = rewardStyles + gameMenuStyles;
  host.append(style);options.canvas.parentElement?.append(host);
  const notice = document.createElement('p');notice.className = 'tod-social-reward-notice';notice.setAttribute('role', 'status');notice.hidden = true;options.canvas.parentElement?.append(notice);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const query = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = query<HTMLDialogElement>('dialog'), launcher = query<HTMLButtonElement>('[data-rewards-open]');
  const spotlight = createRewardSpotlight({ parent: query('[data-unlock-host]'), color: options.color, equip: options.equip, preview: options.previewTarget ? item => { close();options.previewTarget?.(itemTargetId(item)); } : undefined });
  const goal = createRewardGoal({ parent: query('[data-goal-host]'), items: options.items ?? [], action: (kind, target) => options.action(kind, undefined, target), equip: options.equipLook, preview: options.previewTarget ? target => { close();options.previewTarget?.(target); } : undefined });
  const categories = createGameSections({ parent: query('.tod-reward-activities'), label: 'Reward activities', sections: [
    { id: 'achievements', label: 'Milestones', content: query('[data-achievements]') }, { id: 'box', label: 'Collection', content: query('[data-box]') },
    { id: 'mastery', label: 'Mastery', content: query('[data-practice-mastery]') }, { id: 'daily', label: 'Daily', content: query('[data-daily]') }, { id: 'wheel', label: 'Wheel', content: query('[data-wheel]') },
  ] });
  const modal = attachGameModal({ dialog, onClose: options.clearInput });
  let particleTimer: ReturnType<typeof setTimeout> | undefined;
  function clearParticles() { clearTimeout(particleTimer);particleTimer = undefined;query('[data-particles]').replaceChildren(); }
  function targets() { return [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.disabled && !button.closest('[hidden],details:not([open])')); }
  function close() { clearParticles();modal.close();options.clearInput(); }
  launcher.onclick = () => { options.clearInput();categories.select((lastInput?.state.coins ?? 0) >= 100 ? 'box' : 'achievements');modal.open(targets().find(button => button.dataset.rewardFocus?.startsWith('achievement:')) ?? categories.element.querySelector<HTMLButtonElement>('[aria-selected=true]')!);options.open(); };
  query('[data-close]').onclick = close;
  const viewFighter = query<HTMLButtonElement>('[data-view-fighter]');viewFighter.hidden = !options.viewFighter;
  viewFighter.onclick = () => { close();options.viewFighter?.(); };
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();const buttons = targets(), index = buttons.findIndex(button => button === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  });
  for (const action of ['read', 'daily', 'wheel', 'box'] as const) {
    const button = query<HTMLButtonElement>(`[data-action=${action}]`);button.dataset.rewardFocus = action;button.onclick = () => options.action(action);
  }
  let signature = '', previous: RewardState | undefined, pendingFocus: string | undefined;
  let lastInput: { visible: boolean; state: RewardState; day: number; busy: boolean; error: string; online: boolean } | undefined;
  return {
    notice(text: string) { clearTimeout(noticeTimer);notice.textContent = text;notice.hidden = !text;noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000); },
    show() { launcher.click(); },
    get focused() { return dialog.open; },
    render(input: { visible: boolean; state: RewardState; day: number; busy: boolean; error: string; online: boolean }) {
      host.hidden = !input.visible;if (!input.visible && dialog.open) close();
      if (!input.online) notice.hidden = true;
      if (lastInput && input.state === lastInput.state && input.visible === lastInput.visible && input.day === lastInput.day && input.busy === lastInput.busy && input.error === lastInput.error && input.online === lastInput.online) return;
      lastInput = input;
      const key = JSON.stringify(input);if (key === signature) return;signature = key;
      const { state, busy } = input;
      const available = availableRewardItems(options.items ?? [], state.collection);
      const pending = rewardAchievements.filter(item => !state.achievements.includes(item.id) && (!input.online || item.field !== 'tutorialLessons'));
      const focused = (document.activeElement instanceof HTMLElement ? document.activeElement.dataset.rewardFocus : undefined) ?? pendingFocus;
      if (busy && focused) pendingFocus = focused;
      const rewarded = previous && (state.coins > previous.coins || state.collection.length > previous.collection.length);
      spotlight.render({ item: state.collection.at(-1), busy, error: input.error, fresh: !!previous && state.collection.length > previous.collection.length });
      goal.render(input);
      query('[data-progress]').parentElement!.hidden = !!state.target;
      query('[data-unlock-path]').hidden = !!state.target;
      query('[data-reward-intro]').hidden = !!state.collection.length || !!options.items?.length;
      previous = { ...state };
      query('[data-scope]').textContent = input.online ? 'Account rewards · saved by this host' : 'Device rewards · separate from online';
      query('[data-earning-rules]').textContent = input.online ? `Quick Play and winner-stays: 40 coins per set, 60 for a win. Private sets and shared training: 25 coins per five active minutes together, up to 100 per UTC day. ${state.socialDay === input.day ? state.socialCoins : 0}/100 social coins earned today. Partial minutes survive resets with the same partner in this room; leaving ends partial time. Saved coins stay. Idling and spectating do not earn coins.` : 'Local AI sets: 40 coins per set, 60 for a win. First lesson clears: 25 coins. Cosmetic boxes cost 100 coins.';
      query('[data-balance]').textContent = state.coins.toLocaleString('en-US');
      query('[data-sets]').textContent = `${state.matches.toLocaleString('en-US')} sets completed · ${state.wins.toLocaleString('en-US')} wins`;
      query<HTMLProgressElement>('[data-progress]').value = available.length ? Math.min(state.coins, 100) : 100;
      query('[data-progress-label]').textContent = available.length ? 'Next cosmetic unlock' : 'Cosmetic collection complete';
      query('[data-progress-value]').textContent = available.length ? state.coins >= 100 ? 'Ready · 100 coins' : `${state.coins} / 100 coins` : 'All current unlocks are yours';
      query('[data-unlock-path]').textContent = !available.length ? 'Your collection is complete.' : state.coins >= 100 ? 'A new style is ready. Open Collection to make it yours.' : !state.achievements.includes('first-match') ? 'Your first set earns a 100-coin milestone. Claim it to unlock your first style, win or lose.' : `${Math.ceil((100 - state.coins) / 40)} completed set${Math.ceil((100 - state.coins) / 40) === 1 ? '' : 's'} to your next style. Wins and first lesson clears get you there sooner.`;
      query('[data-remaining]').textContent = available.length ? `${available.length} unlock${available.length === 1 ? '' : 's'} remaining. Includes ${available.slice(0, 3).map(item => item.label).join(', ')}${available.length > 3 ? ' and more' : ''}.` : 'All current unlocks are yours. Your coins are kept; no more boxes can be purchased.';
      const goals = query('[data-goals]');goals.replaceChildren();
      const nextGoals = pending.filter(item => rewardAchievementProgress(state, item) >= item.goal);
      for (const field of ['matches', 'tutorialLessons', 'days', 'wins']) {
        const item = pending.find(item => item.field === field);
        if (item && !nextGoals.includes(item)) nextGoals.push(item);
      }
      for (const item of nextGoals.slice(0, 3)) {
        const row = document.createElement('li'), progress = rewardAchievementProgress(state, item);
        row.textContent = `${item.label} · ${Math.min(progress, item.goal)} / ${item.goal} · +${item.coins} coins`;
        if (progress >= item.goal) { const claim = document.createElement('button');claim.type = 'button';claim.textContent = 'Claim';claim.setAttribute('aria-label', `Claim ${item.label}`);claim.dataset.rewardFocus = `goal:${item.id}`;claim.disabled = busy;claim.onclick = () => options.action('achievement', item.id);row.append(claim); }goals.append(row);
      }
      if (!pending.length) goals.textContent = 'All current milestones earned. Keep exploring routes, rivals and shared practice.';
      query('[data-mastery]').textContent = `${state.achievements.length} milestones earned${input.online ? '. Device lesson progress stays on this device.' : ` · ${new Set(state.tutorialLessons).size} different lessons cleared. Practice first clears earn 25 coins.`}`;
      query('[role=status]').textContent = input.error || (busy ? 'Saving…' : state.lastReward || 'Finish a set to earn coins. Wins earn a little more.');
      query('[data-streak]').textContent = `${state.streak} day streak · 50–110 coins. A missed day resets the streak, never your collection.`;
      for (const button of host.querySelectorAll<HTMLButtonElement>('[data-action]')) button.disabled = busy;
      const daily = query<HTMLButtonElement>('[data-action=daily]'), wheel = query<HTMLButtonElement>('[data-action=wheel]');
      daily.disabled = busy || state.lastDay >= input.day;daily.textContent = state.lastDay >= input.day ? 'Daily bonus claimed · back tomorrow' : 'Claim daily bonus';
      wheel.disabled = busy || state.wheelDay >= input.day;wheel.textContent = state.wheelDay >= input.day ? 'Free spin used · back tomorrow' : 'Spin free wheel';
      query<HTMLButtonElement>('[data-action=box]').disabled = busy || state.coins < 100 || !available.length;
      query('[data-action=box]').textContent = available.length ? 'Open box · 100 coins' : 'All current styles unlocked';
      query('[data-action=read]').hidden = !input.error;
      categories.available(['daily', 'wheel', 'box', 'achievements', ...(options.mastery ? ['mastery'] : [])]);
      const records = query('[data-practice-records]');records.replaceChildren();
      const mastery = options.mastery?.();query('[data-practice-record-error]').textContent = mastery?.error ?? '';
      for (const lesson of masteryLessons) {
        const row = document.createElement('p'), count = mastery?.clears[lesson.id] ?? 0;row.textContent = `${lesson.label}: ${count} successful clear${count === 1 ? '' : 's'}${count >= 20 ? ' · Twenty-clear milestone earned' : count >= 5 ? ' · Five-clear milestone earned' : ''}.`;
        const practice = document.createElement('button');practice.type = 'button';practice.textContent = `Practice ${lesson.label.toLowerCase()}`;practice.disabled = input.online || !options.practiceLesson;practice.title = input.online ? 'Leave the online room to start a local lesson.' : 'First clears earn coins; repeat clears build your journal.';practice.onclick = () => { close();options.practiceLesson?.(lesson.id); };records.append(row, practice);
      }
      query('[data-empty]').hidden = state.collection.length > 0;
      const achievements = query('[data-achievement-list]');achievements.replaceChildren();
      const otherAchievements = query('[data-other-achievements]');otherAchievements.replaceChildren();
      for (const item of rewardAchievements) {
        if (input.online && item.field === 'tutorialLessons') continue;
        const button = document.createElement('button');button.type = 'button';
        const claimed = state.achievements.includes(item.id);button.dataset.rewardFocus = `achievement:${item.id}`;button.textContent = `${!claimed && rewardAchievementProgress(state, item) >= item.goal ? 'Claim · ' : ''}${item.label} · ${claimed ? 'Claimed' : `+${item.coins} coins`}`;
        const row = document.createElement('div'), progress = document.createElement('progress');progress.max = item.goal;progress.value = Math.min(rewardAchievementProgress(state, item), item.goal);progress.setAttribute('aria-label', `${item.label}: ${progress.value} of ${item.goal}`);
        const count = document.createElement('small');count.textContent = `${progress.value} / ${item.goal}${claimed ? ' · Complete' : progress.value >= item.goal ? ' · Ready to claim' : ''}`;
        button.disabled = busy || claimed || rewardAchievementProgress(state, item) < item.goal;button.onclick = () => options.action('achievement', item.id);row.append(button, count, progress);(nextGoals.includes(item) ? achievements : otherAchievements).append(row);
      }
      const collection = query('[data-collection]');collection.replaceChildren();
      for (const item of state.collection) { const li = document.createElement('li'), button = document.createElement('button');button.type = 'button';button.dataset.rewardFocus = `equip:${item.slot}:${item.option}`;button.textContent = `Equip ${item.label}${item.rarity ? ` · ${item.rarity[0]!.toUpperCase()}${item.rarity.slice(1)}` : ''}`;button.disabled = busy;button.onclick = () => options.equip(item.slot, item.option);li.append(button);collection.append(li); }
      if (focused && dialog.open && !busy) {
        const replacement = targets().find(button => button.dataset.rewardFocus === focused);
        (replacement ?? categories.element.querySelector<HTMLButtonElement>('[aria-selected=true]') ?? query('[data-close]')).focus({ preventScroll: true });
        pendingFocus = undefined;
      }
      if (rewarded && dialog.open && !input.error && !busy && options.canvas.parentElement?.dataset.reducedMotion !== 'true' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        clearParticles();
        for (let index = 0; index < 18; index++) {
          const spark = document.createElement('i');spark.style.setProperty('--x', `${(index % 9 - 4) * 49}px`);spark.style.setProperty('--y', `${-36 - index % 5 * 18}px`);spark.style.setProperty('--spin', `${index * 37}deg`);spark.style.setProperty('--delay', `${index % 3 * 40}ms`);query('[data-particles]').append(spark);
        }
        particleTimer = setTimeout(clearParticles, 1100);
      }
    },
    dispose() { goal.dispose();clearTimeout(noticeTimer);notice.remove();clearParticles();categories.dispose();modal.dispose();host.remove(); },
  };
}
