import { expect, test } from 'bun:test';
import { applyRewardCommand, availableRewardItems, awardTutorialLesson, canEquipRewardOption, newRewardState, rewardAchievements, rewardStateSchema, tutorialLessonCoins } from './model.ts';

test('legacy reward saves retain balances and unlocks with no completed tutorials', () => {
  const collection = [{ slot: 'recovery-style', option: 'kip-up', label: 'Kip up' }];
  const state = rewardStateSchema.parse({ version: 1, coins: 240, stage: 0, lastDay: -1, streak: 0, days: 0, matches: 0, wins: 0,
    wheelDay: -1, achievements: [], collection, lastReward: '' });
  expect(state.coins).toBe(240);
  expect(state.collection).toEqual(collection);
  expect(state.tutorialLessons).toEqual([]);
  expect(state.socialDay).toBe(-1);expect(state.socialCoins).toBe(0);
});

test('first clear grants once, while demonstrations and replays never grant currency', () => {
  const original = newRewardState();
  for (const source of ['demonstration', 'replay'] as const) {
    expect(awardTutorialLesson({ state: original, lessonId: 'movement', source })).toEqual({ state: original, coins: 0, firstClear: false });
  }
  const first = awardTutorialLesson({ state: original, lessonId: 'movement', source: 'player' });
  expect(first.coins).toBe(tutorialLessonCoins);
  expect(first.firstClear).toBe(true);
  expect(first.state.tutorialLessons).toEqual(['movement']);
  expect(original).toEqual(newRewardState());
  const replayed = awardTutorialLesson({ state: rewardStateSchema.parse(JSON.parse(JSON.stringify(first.state))), lessonId: 'movement', source: 'player' });
  expect(replayed).toEqual({ state: first.state, coins: 0, firstClear: false });
});

test('four first clears fund an existing cosmetic box and claimed lessons survive purchases', () => {
  let state = newRewardState();
  const lessons = ['movement', 'combo-lesson', 'di-drill', 'arena-lesson'];
  for (const lessonId of lessons) state = awardTutorialLesson({ state, lessonId, source: 'player' }).state;
  expect(state.coins).toBe(100);
  state = applyRewardCommand({ state, command: { type: 'reward-command', requestId: 'box', action: 'box' }, day: 1, random: 0,
    items: [{ slot: 'recovery-style', option: 'kip-up', label: 'Kip up' }] });
  expect(state.coins).toBe(0);
  expect(state.collection[0]?.option).toBe('kip-up');
  expect(state.tutorialLessons).toEqual(lessons);
  expect(awardTutorialLesson({ state, lessonId: 'movement', source: 'player' }).coins).toBe(0);
});

test('earned milestones can be claimed before optional daily discovery', () => {
  const state = { ...newRewardState(), matches: 1 };
  const command = { type: 'reward-command' as const, requestId: 'earned', action: 'achievement' as const, achievement: 'first-match' as const };
  const next = applyRewardCommand({ state, command, day: 1, random: 0, items: [] });
  expect(next.coins).toBe(100);expect(next.stage).toBe(0);expect(next.lastDay).toBe(-1);
  expect(() => applyRewardCommand({ state: next, command, day: 1, random: 0, items: [] })).toThrow('not ready');
});

test('invalid lesson IDs and overflow leave the original reward state intact', () => {
  const state = { ...newRewardState(), coins: 1000000000 };
  expect(() => awardTutorialLesson({ state, lessonId: 'movement', source: 'player' })).toThrow();
  expect(() => awardTutorialLesson({ state: newRewardState(), lessonId: '', source: 'player' })).toThrow();
  expect(state.tutorialLessons).toEqual([]);
  expect(state.coins).toBe(1000000000);
});

test('boxes exclude starter, identity, duplicate and owned options and never debit exhaustion', () => {
  const items = [
    { slot: 'top', option: 'gi', label: 'Gi' }, { slot: 'hair', option: 'violet', label: 'Violet' },
    { slot: 'top', option: 'vest', label: 'Vest' }, { slot: 'top-color', option: 'moss', label: 'Moss' },
    { slot: 'top-color', option: 'moss', label: 'Duplicate Moss' },
  ];
  const before = { ...newRewardState(), stage: 2, coins: 200, collection: [items[2]!] };
  expect(availableRewardItems(items, before.collection)).toEqual([items[3]!]);
  const command = { type: 'reward-command' as const, requestId: 'unique', action: 'box' as const };
  const next = applyRewardCommand({ state: before, command, day: 1, random: .999, items });
  expect(next.coins).toBe(100);expect(next.collection).toEqual([items[2]!, items[3]!]);
  expect(canEquipRewardOption('top-color', 'moss', next.collection)).toBe(true);
  expect(canEquipRewardOption('top-color', 'clay', next.collection)).toBe(false);
  expect(() => applyRewardCommand({ state: next, command, day: 1, random: 0, items })).toThrow('No coins spent');
  expect(next.coins).toBe(100);expect(before.coins).toBe(200);
});

test('long-term milestones survive reload and each grant remains claimable only once', () => {
  let state = { ...newRewardState(), stage: 3, matches: 1000, wins: 500, days: 100, tutorialLessons: Array.from({ length: 8 }, (_, index) => `lesson-${index}`) };
  for (const achievement of rewardAchievements) {
    const command = { type: 'reward-command' as const, requestId: achievement.id, action: 'achievement' as const, achievement: achievement.id };
    state = applyRewardCommand({ state: rewardStateSchema.parse(JSON.parse(JSON.stringify(state))), command, day: 101, random: 0, items: [] });
    expect(() => applyRewardCommand({ state, command, day: 101, random: 0, items: [] })).toThrow('not ready');
  }
  expect(state.achievements).toHaveLength(rewardAchievements.length);
  expect(state.coins).toBe(rewardAchievements.reduce((sum, achievement) => sum + achievement.coins, 0));
  const duplicated = { ...newRewardState(), stage: 3, tutorialLessons: ['movement', 'movement', 'movement'] };
  expect(() => applyRewardCommand({ state: duplicated, command: { type: 'reward-command', requestId: 'duplicate', action: 'achievement', achievement: 'three-lessons' }, day: 1, random: 0, items: [] })).toThrow('not ready');
});
