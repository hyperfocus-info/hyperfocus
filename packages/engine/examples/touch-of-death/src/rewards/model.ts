import { z } from 'zod';
import { availableRewardItems } from "./inventory.ts";
import { cosmeticTargetProgress, cosmeticTargets } from "./targets.ts";
export { starterCosmetics, canEquipRewardOption, availableRewardItems } from "./inventory.ts";

const id = z.string().min(1).max(128);
export const socialReward = { coins: 25, intervalMs: 300000, dailyLimit: 100, idleGraceMs: 15000 } as const;
/** Additive, host-authored room status. It cannot grant coins or change persisted balances. */
export const socialProgressSchema = z.object({ type: z.literal('social-activity'),
  elapsedMs: z.number().int().min(0).max(socialReward.intervalMs),
  status: z.enum(['active', 'idle', 'waiting', 'saving', 'capped']),
}).strict();
export const rewardAchievements = [
  { id: 'first-match', label: 'Finish your first set', goal: 1, field: 'matches', coins: 100 },
  { id: 'five-matches', label: 'Finish five sets', goal: 5, field: 'matches', coins: 200 },
  { id: 'first-win', label: 'Win a set', goal: 1, field: 'wins', coins: 100 },
  { id: 'three-days', label: 'Claim the daily bonus on three days', goal: 3, field: 'days', coins: 150 },
  { id: 'three-lessons', label: 'Learn three techniques', goal: 3, field: 'tutorialLessons', coins: 100 },
  { id: 'eight-lessons', label: 'Complete eight different lessons', goal: 8, field: 'tutorialLessons', coins: 200 },
  { id: 'twenty-five-matches', label: 'Regular · finish 25 sets', goal: 25, field: 'matches', coins: 250 },
  { id: 'hundred-matches', label: 'Contender · finish 100 sets', goal: 100, field: 'matches', coins: 500 },
  { id: 'five-hundred-matches', label: 'Veteran · finish 500 sets', goal: 500, field: 'matches', coins: 1000 },
  { id: 'thousand-matches', label: 'Arena mainstay · finish 1,000 sets', goal: 1000, field: 'matches', coins: 2000 },
  { id: 'ten-wins', label: 'Find your footing · win 10 sets', goal: 10, field: 'wins', coins: 200 },
  { id: 'fifty-wins', label: 'Challenger · win 50 sets', goal: 50, field: 'wins', coins: 500 },
  { id: 'two-fifty-wins', label: 'Proven · win 250 sets', goal: 250, field: 'wins', coins: 1000 },
  { id: 'five-hundred-wins', label: 'Established · win 500 sets', goal: 500, field: 'wins', coins: 2000 },
  { id: 'seven-days', label: 'Claim the daily bonus on seven days', goal: 7, field: 'days', coins: 200 },
  { id: 'thirty-days', label: 'Claim the daily bonus on 30 days', goal: 30, field: 'days', coins: 500 },
  { id: 'hundred-days', label: 'Claim the daily bonus on 100 days', goal: 100, field: 'days', coins: 1000 },
] as const;
type AchievementId = typeof rewardAchievements[number]['id'];
const achievementIds: [AchievementId, ...AchievementId[]] = [rewardAchievements[0].id, ...rewardAchievements.slice(1).map(item => item.id)];
export const rewardCommandSchema = z.object({ type: z.literal('reward-command'), requestId: id,
  action: z.enum(['read', 'daily', 'wheel', 'box', 'next', 'achievement', 'target', 'unlock', 'unlock-piece']), achievement: z.enum(achievementIds).optional(),
  target: z.string().min(1).max(300).nullable().optional(),
}).strict();
export type RewardCommand = z.infer<typeof rewardCommandSchema>;
export const rewardItemSchema = z.object({ slot: id, option: id, label: z.string().min(1).max(160), rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']).optional() }).strict();
export type RewardItem = z.infer<typeof rewardItemSchema>;
export const rewardStateSchema = z.object({ version: z.literal(1), coins: z.number().int().nonnegative().max(1000000000),
  stage: z.number().int().min(0).max(4), lastDay: z.number().int().min(-1), streak: z.number().int().nonnegative(),
  days: z.number().int().nonnegative(), matches: z.number().int().nonnegative(), wins: z.number().int().nonnegative(),
  wheelDay: z.number().int().min(-1), achievements: z.array(id).max(rewardAchievements.length), collection: z.array(rewardItemSchema).max(512),
  tutorialLessons: z.array(id).max(256).default([]),
  target: z.string().min(1).max(300).nullable().default(null),
  socialDay: z.number().int().min(-1).default(-1), socialCoins: z.number().int().nonnegative().max(socialReward.dailyLimit).default(0),
  lastReward: z.string().max(240),
}).strict();
export type RewardState = z.infer<typeof rewardStateSchema>;
export const rewardResponseSchema = z.object({ type: z.literal('reward-result'), requestId: id,
  state: rewardStateSchema.optional(), error: z.string().max(240), day: z.number().int().nonnegative(), retryable: z.boolean().optional(),
}).strict();
export function rewardAchievementProgress(state: RewardState, achievement: typeof rewardAchievements[number]) {
  const value = state[achievement.field];return Array.isArray(value) ? new Set(value).size : value;
}
export function newRewardState(): RewardState {
  return { version: 1, coins: 0, stage: 0, lastDay: -1, streak: 0, days: 0, matches: 0, wins: 0, wheelDay: -1, achievements: [], collection: [], tutorialLessons: [], target: null, socialDay: -1, socialCoins: 0, lastReward: '' };
}
/** Host-observed participation only; never changes wins, set counts or rating. */
export function awardSocialReward(state: RewardState, day: number) {
  if (!Number.isSafeInteger(day) || day < 0) throw Error('Invalid social reward day.');
  const current = rewardStateSchema.parse(state), earned = current.socialDay === day ? current.socialCoins : 0;
  if (current.socialDay > day) throw Error('Social reward clock moved backwards.');
  const coins = Math.min(socialReward.coins, socialReward.dailyLimit - earned);
  return rewardStateSchema.parse({ ...current, coins: current.coins + coins, socialDay: day, socialCoins: earned + coins,
    lastReward: coins ? `Social play: +${coins} coins · ${earned + coins}/${socialReward.dailyLimit} earned today.` : `Today's social coins are complete (${socialReward.dailyLimit}/${socialReward.dailyLimit}). Your progress is saved.` });
}
/** Host time/randomness online; local saves deliberately stay separate from account rewards. */
export function applyRewardCommand(options: { state: RewardState; command: RewardCommand; day: number; random: number; items: readonly RewardItem[] }): RewardState {
  const next = rewardStateSchema.parse(options.state), command = rewardCommandSchema.parse(options.command);
  if (!Number.isSafeInteger(options.day) || options.day < 0 || !Number.isFinite(options.random) || options.random < 0 || options.random >= 1) throw Error('Invalid reward clock or random draw.');
  if (command.action === 'read') return next;
  if (command.action === 'next') { if (next.stage < 4) next.stage++;return next; }
  if (command.action === 'target' || command.action === 'unlock' || command.action === 'unlock-piece') {
    if (command.action === 'target' && command.target === null) { next.target = null;next.lastReward = 'Style goal cleared. Your coins and collection are kept.';return next; }
    const target = cosmeticTargets(options.items).find(item => item.id === (command.action === 'target' ? command.target : next.target));
    if (!target) throw Error('Choose a style from the current collection.');
    const progress = cosmeticTargetProgress(target, next.collection);
    if (progress.owned) throw Error('You already own this style. Ready to equip.');
    if (command.action === 'target') { next.target = target.id;next.lastReward = `Goal saved: ${target.label}. No coins spent.`; }
    else {
      const piece = command.action === 'unlock-piece';
      if (piece && target.kind !== 'look') throw Error('Choose a coordinated look before unlocking its next piece.');
      const cost = piece ? progress.cost / progress.remaining.length : progress.cost, earned = piece ? progress.remaining.slice(0, 1) : progress.remaining;
      if (next.coins < cost) throw Error(`${target.label} needs ${cost} coins. Keep playing toward your goal.`);
      if (next.collection.length + earned.length > 512) throw Error('Collection limit reached. No coins spent.');
      next.coins -= cost;next.collection.push(...earned.map(item => rewardItemSchema.parse(item)));
      next.lastReward = `Unlocked ${piece ? earned[0]!.label : target.label}. Yours to equip. ${cost} coins spent.`;
    }
    return rewardStateSchema.parse(next);
  }
  if (command.action === 'daily') {
    if (options.day <= next.lastDay) throw Error('Daily reward already claimed. Come back after midnight UTC.');
    next.streak = next.lastDay === options.day - 1 ? next.streak + 1 : 1;next.days++;next.lastDay = options.day;
    const coins = 50 + Math.min(next.streak - 1, 6) * 10;next.coins += coins;next.lastReward = `Day ${next.streak}: +${coins} coins.`;
  } else if (command.action === 'wheel') {
    if (options.day <= next.wheelDay) throw Error('Today’s free spin is used. Come back after midnight UTC.');
    const coins = options.random < .5 ? 25 : options.random < .8 ? 50 : options.random < .95 ? 100 : 250;
    next.wheelDay = options.day;next.coins += coins;next.lastReward = `Wheel: +${coins} coins.`;
  } else if (command.action === 'box') {
    if (next.coins < 100) throw Error('A cosmetic box costs 100 coins.');
    const available = availableRewardItems(options.items, next.collection);
    if (!available.length) throw Error('You have collected every available cosmetic unlock. No coins spent.');
    const item = rewardItemSchema.parse(available[Math.floor(options.random * available.length)]);
    if (next.collection.length >= 512) throw Error('Collection limit reached. No coins spent.');
    next.coins -= 100;next.collection.push(item);next.lastReward = `Unlocked ${item.label}. Ready to equip.`;
  } else {
    const achievement = rewardAchievements.find(value => value.id === command.achievement);
    if (!achievement || next.achievements.includes(achievement.id) || rewardAchievementProgress(next, achievement) < achievement.goal) throw Error('This achievement is not ready to claim.');
    next.achievements.push(achievement.id);next.coins += achievement.coins;next.lastReward = `${achievement.label}: +${achievement.coins} coins.`;
  }
  return rewardStateSchema.parse(next);
}
export function awardRewardMatch(state: RewardState, won: boolean): RewardState {
  return rewardStateSchema.parse({ ...state, matches: state.matches + 1, wins: state.wins + Number(won), coins: state.coins + 40 + (won ? 20 : 0), lastReward: `Set complete: +${won ? 60 : 40} coins.` });
}

/** Four first clears earn a 100-coin cosmetic box; repeats never farm currency. */
export const tutorialLessonCoins = 25;
export function awardTutorialLesson(options: { state: RewardState; lessonId: string; source: 'player' | 'demonstration' | 'replay' }) {
  const state = rewardStateSchema.parse(options.state), lessonId = id.parse(options.lessonId);
  if (options.source !== 'player' || state.tutorialLessons.includes(lessonId)) return { state, coins: 0, firstClear: false };
  const next = rewardStateSchema.parse({ ...state, coins: state.coins + tutorialLessonCoins,
    tutorialLessons: [...state.tutorialLessons, lessonId], lastReward: `Lesson complete: +${tutorialLessonCoins} coins. First clear saved.` });
  return { state: next, coins: tutorialLessonCoins, firstClear: true };
}
