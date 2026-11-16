import { rewardAchievements, rewardAchievementProgress, type RewardItem, type RewardState } from '@hyperfocus/touch-of-death/rewards/model';
import { cosmeticTargetProgress, cosmeticTargets } from '@hyperfocus/touch-of-death/rewards/targets';

/** A saved receipt stays separate from unclaimed milestones and the next purchase. */
export function resultRewardSummary(options: { receipt: string; state: RewardState; items: readonly RewardItem[] }) {
  const { receipt, state, items } = options;
  if (!receipt) return '';
  const lines = [receipt, `${state.coins} coins saved.`];
  const ready = rewardAchievements.find(item => !state.achievements.includes(item.id) && rewardAchievementProgress(state, item) >= item.goal);
  if (ready) lines.push(`Ready to claim: ${ready.label} · +${ready.coins} coins. Open Rewards.`);
  const target = cosmeticTargets(items).find(item => item.id === state.target);
  if (target) {
    const progress = cosmeticTargetProgress(target, state.collection);
    const cost = target.kind === 'look' && progress.remaining.length ? progress.cost / progress.remaining.length : progress.cost;
    lines.push(progress.owned ? `${target.label} is yours to equip.` : `${target.label}${target.kind === 'look' ? ' · next piece' : ''}: ${Math.min(state.coins, cost)} / ${cost} coins.`);
  }
  return lines.join('\n');
}
