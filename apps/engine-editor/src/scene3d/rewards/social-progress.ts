import { socialReward, socialProgressSchema, type RewardState } from '@hyperfocus/touch-of-death/rewards/model';

/** A readout of host observations; local elapsed time never promises a grant. */
export function createSocialProgress(parent: HTMLElement) {
  const element = document.createElement('aside');element.className = 'tod-social-progress';element.hidden = true;element.setAttribute('aria-label', 'Playing together');
  const label = document.createElement('strong'), progress = document.createElement('progress'), detail = document.createElement('span');
  progress.max = socialReward.intervalMs;progress.setAttribute('aria-label', 'Active time toward 25 social coins');
  element.append(label, progress, detail);parent.append(element);
  const write = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  return {
    render(input: { visible: boolean; activity?: ReturnType<typeof socialProgressSchema.parse>; state: RewardState; day: number }) {
      element.hidden = !input.visible;if (!input.visible) return;
      const earned = input.state.socialDay === input.day ? input.state.socialCoins : 0, capped = earned >= socialReward.dailyLimit;
      const elapsed = input.activity?.elapsedMs ?? 0, seconds = Math.floor(elapsed / 1000);
      progress.value = capped ? progress.max : elapsed;
      write(label, capped ? 'Together today: 100 coins saved' : `Together: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 5:00`);
      const status = capped ? 'capped' : input.activity?.status ?? 'waiting';
      const messages = {
        active: `Building toward +25 coins each. ${earned}/100 saved today.`,
        idle: 'Paused while explaining or resting. Both players resume varied inputs to continue.',
        waiting: 'Waiting for both fighters. Earn +25 coins per five active minutes together.',
        saving: 'Saving this interval. The host will confirm your coins.',
        capped: 'Daily social coins complete. Keep practicing; your cosmetics are saved.',
      };
      write(detail, messages[status]);element.dataset.status = status;
      element.title = 'Partial time stays through resets in this room with the same partner. Leaving the room ends partial progress. Coins already earned are saved.';
    },
    dispose() { element.remove(); },
  };
}
