import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRewardService } from './service.ts';
import { applyRewardCommand, newRewardState } from '../../src/rewards/model.ts';
import { createTouchOfDeathRecoverySlot } from '../../src/presentation/wardrobe.ts';

test('social progress is capped per account/day across partners, idempotent after restart, and never counts as a win', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tod-social-')), databasePath = join(root, 'rewards.sqlite');let time = 86400000;
  let service = createRewardService({ databasePath, now: () => time });
  try {
    const first = { receiptId: 'social:first', userIds: ['a', 'b'] };
    await Promise.all([service.awardSocial(first), service.awardSocial(first)]);
    expect(service.read({ userId: 'a' })).toMatchObject({ coins: 25, matches: 0, wins: 0, socialCoins: 25 });
    service.close();service = createRewardService({ databasePath, now: () => time });await service.awardSocial(first);
    for (let index = 0; index < 6; index++) await service.awardSocial({ receiptId: `social:pair-${index}`, userIds: ['a', `partner-${index}`] });
    expect(service.read({ userId: 'a' })).toMatchObject({ coins: 100, socialCoins: 100, matches: 0 });
    await expect(service.awardSocial({ ...first, userIds: ['a', 'other'] })).rejects.toThrow('conflicts');
    time += 86400000;await service.awardSocial(first);expect(service.read({ userId: 'a' }).coins).toBe(100);
    await service.awardSocial({ receiptId: 'social:tomorrow', userIds: ['a', 'b'] });expect(service.read({ userId: 'a' })).toMatchObject({ coins: 125, socialDay: 2, socialCoins: 25 });
  } finally { service.close();rmSync(root, { recursive: true, force: true }); }
});

test('a chosen cosmetic is saved and purchased once across authority restart and request retry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tod-target-')), databasePath = join(root, 'rewards.sqlite');
  const options = { databasePath, catalog: { version: 1 as const, actors: [], slots: [createTouchOfDeathRecoverySlot()] } };
  let service = createRewardService(options);
  try {
    for (let i = 0; i < 5; i++) await service.awardMatch({ matchId: `earned-${i}`, userIds: ['a', 'b'], winnerId: 'a' });
    service.command({ userId: 'a', command: { type: 'reward-command', requestId: 'pin', action: 'target', target: 'item:recovery-style:kip-up' } });
    service.close();service = createRewardService(options);expect(service.read({ userId: 'a' }).target).toBe('item:recovery-style:kip-up');
    const command = { type: 'reward-command', requestId: 'unlock', action: 'unlock' };
    const bought = service.command({ userId: 'a', command });expect(bought.coins).toBe(200);expect(bought.collection).toHaveLength(1);
    service.close();service = createRewardService(options);expect(service.command({ userId: 'a', command })).toEqual(bought);
    expect(() => service.command({ userId: 'a', command: { ...command, requestId: 'again' } })).toThrow('already own');
  } finally { service.close();rmSync(root, { recursive: true, force: true }); }
});

test('daily and random draws survive retries/restart without double grants or debits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tod-reward-')), databasePath = join(root, 'rewards.sqlite');let now = 86400000, draws = 0;
  const options = { databasePath, now: () => now, random: () => { draws++;return .99; } };
  let service = createRewardService(options);
  try {
    const command = { type: 'reward-command', requestId: 'daily', action: 'daily' };
    expect(service.command({ userId: 'a', command }).coins).toBe(50);
    expect(service.command({ userId: 'a', command }).coins).toBe(50);expect(draws).toBe(1);
    service.close();service = createRewardService(options);
    expect(service.command({ userId: 'a', command }).coins).toBe(50);
    expect(() => service.command({ userId: 'a', command: { ...command, requestId: 'again' } })).toThrow('already claimed');
    service.command({ userId: 'a', command: { ...command, action: 'next', requestId: 'next' } });
    const wheel = { ...command, action: 'wheel', requestId: 'spin' };
    expect(service.command({ userId: 'a', command: wheel }).coins).toBe(300);
    expect(service.command({ userId: 'a', command: wheel }).coins).toBe(300);
    expect(() => service.command({ userId: 'a', command: { ...wheel, action: 'next' } })).toThrow('already used');
    now += 86400000;
    expect(service.command({ userId: 'a', command: { ...command, requestId: 'day2' } }).streak).toBe(2);
    now += 172800000;
    expect(service.command({ userId: 'a', command: { ...command, requestId: 'day4' } }).streak).toBe(1);
    await service.awardMatch({ matchId: 'match', userIds: ['a', 'b'], winnerId: 'a' });
    await service.awardMatch({ matchId: 'match', userIds: ['a', 'b'], winnerId: 'a' });
    expect(service.read({ userId: 'a' }).matches).toBe(1);expect(service.read({ userId: 'b' }).coins).toBe(40);
    expect(service.command({ userId: 'a', command }).matches).toBe(1);
    expect(service.command({ userId: 'a', command }).coins).toBe(service.read({ userId: 'a' }).coins);
    await expect(service.awardMatch({ matchId: 'match', userIds: ['a', 'b'], winnerId: 'b' })).rejects.toThrow('conflicts');
  } finally { service.close();rmSync(root, { recursive: true, force: true }); }
});

test('boxes use uncollected cosmetics, never debit an exhausted pool; achievements require play', () => {
  const items = [{ slot: 'top', option: 'red', label: 'Red top' }], command = { type: 'reward-command' as const, requestId: 'box', action: 'box' as const };
  const state = { ...newRewardState(), coins: 200, stage: 3 };
  const next = applyRewardCommand({ state, command, day: 0, random: 0, items });
  expect(next.collection).toEqual(items);expect(next.coins).toBe(100);expect(state.coins).toBe(200);
  expect(() => applyRewardCommand({ state: next, command, day: 0, random: 0, items })).toThrow('every available');
  expect(() => applyRewardCommand({ state, command: { ...command, action: 'achievement', achievement: 'first-win' }, day: 0, random: 0, items })).toThrow('not ready');
});
