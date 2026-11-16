import { createSaveProfileStore, type AtomicSaveStorage } from '@hyperfocus/engine/save';
import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import type { createCombatConnection } from '../network/connection.ts';
import { applyRewardCommand, awardRewardMatch, awardTutorialLesson as applyTutorialLesson, canEquipRewardOption, newRewardState, rewardStateSchema, type RewardCommand } from '@hyperfocus/touch-of-death/rewards/model';
import { createRewardsPanel } from './panel.ts';
import { createMasteryJournal } from './mastery';
import { createSocialProgress } from './social-progress';
import { resultRewardSummary } from './result.ts';

export function createStandaloneRewards(options: { canvas: HTMLCanvasElement; projectId: string; storage: AtomicSaveStorage; catalog: AppearanceCatalog3D; network(): ReturnType<typeof createCombatConnection> | undefined; equip(slot: string, option: string): Promise<void>; equipLook?(selections: Record<string, string>): Promise<void>; previewTarget?(target: string): void; practiceLesson?(id: string): void; clearInput(): void }) {
  const store = createSaveProfileStore(options.storage, `${options.projectId}:rewards`, { limits: { maxSlots: 1, maxBytes: 262144 } });
  const items = options.catalog.slots.flatMap(slot => slot.options.map(item => ({ slot: slot.id, option: item.id, label: `${slot.label}: ${item.label}`, ...(item.rarity ? { rarity: item.rarity } : {}) })));
  let local = newRewardState(), state = local, ready = false, busy = false, error = '', day = Math.floor(Date.now() / 86400000);
  let identity = '', generation = 0, visible = false, disposed = false, previousPhase = '', startedLocal = false;
  let retry: RewardCommand | undefined, lane = Promise.resolve();
  let receipt = '', savedReceipt = false, resultGeneration = 0;
  let rewardUpdate: ReturnType<typeof createCombatConnection>['rewardUpdate'];
  let localAttempt: { requestId: string; state: ReturnType<typeof newRewardState> } | undefined;
  const pendingLessons = new Set<string>();
  const mastery = createMasteryJournal(options.storage, options.projectId);
  const socialProgress = createSocialProgress(options.canvas.parentElement!);
  const panel = createRewardsPanel({ canvas: options.canvas, items, mastery: () => mastery.state, practiceLesson: options.practiceLesson, clearInput: options.clearInput, open: () => { void action('read'); },
    color: item => options.catalog.slots.find(slot => slot.id === item.slot)?.options.find(option => option.id === item.option)?.colors?.[0]?.baseColor,
    action: (kind, achievement, target) => { void action(kind, achievement, target); },
    equip: (slot, option) => { void equip(slot, option); },
    equipLook: selections => { void equip(undefined, undefined, selections); }, previewTarget: options.previewTarget,
    viewFighter: () => options.canvas.parentElement?.querySelector<HTMLButtonElement>('[data-wardrobe-open]')?.click(),
  });
  function serial<T>(run: () => Promise<T>) { const result = lane.then(run, run);lane = result.then(() => {}, () => {});return result; }
  async function load() { const raw = (await store.loadSlot('local', 'rewards'))?.data;local = raw ? rewardStateSchema.parse(raw) : newRewardState();ready = true; }
  async function saveTutorialLessons() {
    let next = localAttempt?.state ?? local;
    const grants = new Map<string, number>();
    for (const lessonId of pendingLessons) {
      const award = applyTutorialLesson({ state: next, lessonId, source: 'player' });
      next = award.state;grants.set(lessonId, award.coins);
    }
    if (!pendingLessons.size) return grants;
    await store.saveSlot('local', 'rewards', next);
    local = next;if (localAttempt) localAttempt.state = next;
    pendingLessons.clear();if (!options.network()?.active) { state = local;error = ''; }
    return grants;
  }
  async function awardTutorialLesson(input: { lessonId: string; source: 'player' | 'demonstration' | 'replay' }) {
    return serial(async () => {
      const unchanged = () => ({ coins: 0, balance: local.coins, firstClear: false, saved: true, error: '' });
      if (disposed) return { ...unchanged(), saved: false, error: 'Rewards closed before saving.' };
      if (input.source !== 'player' || options.network()?.active) return unchanged();
      try {
        // Validate before retaining a retry, so malformed evidence cannot block later rewards.
        const award = applyTutorialLesson({ state: localAttempt?.state ?? local, ...input });
        if (!award.firstClear) return unchanged();
        pendingLessons.add(input.lessonId);
        if (!ready) await load();
        if (disposed) return { ...unchanged(), saved: false, error: 'Rewards closed before saving.' };
        const coins = (await saveTutorialLessons()).get(input.lessonId) ?? 0;
        return { coins, balance: local.coins, firstClear: coins > 0, saved: true, error: '' };
      } catch (cause) {
        const message = `Could not save lesson coins${cause instanceof Error ? `: ${cause.message}` : '.'} Open Rewards and choose Refresh / retry.`;
        if (!options.network()?.active) error = message;
        return { ...unchanged(), saved: false, error: message };
      }
    });
  }
  async function action(kind: RewardCommand['action'], achievement?: RewardCommand['achievement'], target?: string | null) {
    if (busy || disposed) return;
    if (retry && kind !== 'read') { error = 'Use Refresh / retry to resolve the previous reward before another action.';return; }
    const attempt = generation, network = options.network(), online = !!network?.active;
    busy = true;error = '';
    const command = kind === 'read' && retry ? retry : { type: 'reward-command' as const, requestId: crypto.randomUUID(), action: kind, ...(achievement ? { achievement } : {}), ...(target !== undefined ? { target } : {}) };
    if (command.action !== 'read') retry = command;
    await serial(async () => {
      try {
        if (attempt !== generation || disposed) return;
        if (online) { const result = await network!.reward(command);if (!result.state) throw Error('Host did not return rewards.');if (attempt === generation) { state = result.state;day = result.day; } }
        else {
          if (!ready) await load();
          await saveTutorialLessons();
          if (localAttempt?.requestId !== command.requestId) {
            try { localAttempt = { requestId: command.requestId, state: applyRewardCommand({ state: local, command, day: Math.floor(Date.now() / 86400000), random: crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296, items }) }; }
            catch (cause) { if (cause instanceof Error) Object.assign(cause, { definitive: true });throw cause; }
          }
          const next = localAttempt.state;
          if (command.action !== 'read') await store.saveSlot('local', 'rewards', next);
          local = next;localAttempt = undefined;if (attempt === generation) state = local;
        }
        if (attempt === generation) retry = undefined;
      } catch (cause) { if (attempt === generation) { error = cause instanceof Error ? cause.message : 'Could not load or save rewards. Retry.';if (cause && typeof cause === 'object' && 'definitive' in cause && cause.definitive === true) retry = undefined; } }
      finally { if (attempt === generation) busy = false; }
    });
  }
  async function equip(slot?: string, option?: string, selections?: Record<string, string>) {
    if (busy || disposed) return;const attempt = generation;busy = true;error = '';
    try {
      if (selections) { if (!options.equipLook) throw Error('Open Your fighter to equip this look.');await options.equipLook(selections); }
      else if (slot && option) await options.equip(slot, option);
      if (attempt === generation) state = { ...state, lastReward: 'Saved to your device fighter. Use saved fighter online to publish it.' };
    }
    catch (cause) { if (attempt === generation) error = cause instanceof Error ? cause.message : 'Could not equip. Retry.'; }
    finally { if (attempt === generation) busy = false; }
  }
  void serial(async () => { try { await load();if (!options.network()?.active) state = local; } catch { error = 'Could not load your cosmetic unlocks. Open Rewards and retry.'; } });
  return {
    get resultStatus() { return savedReceipt ? resultRewardSummary({ receipt, state, items }) : receipt; },
    target(id: string) { void action('target', undefined, id);panel.show(); },
    awardTutorialLesson,
    recordMastery: mastery.record,
    canEquip(slot: string, option: string) { const network = options.network();return canEquipRewardOption(slot, option, network?.active ? identity === network.state.playerId ? state.collection : [] : local.collection); },
    get focused() { return panel.focused; },
    render(input: { visible: boolean; replay: boolean; phase?: string; winner?: string }) {
      const network = options.network(), nextIdentity = network?.active ? network.state.playerId || 'connecting' : 'local';
      if (nextIdentity !== identity) { identity = nextIdentity;generation++;busy = false;retry = undefined;error = '';state = nextIdentity === 'local' ? local : newRewardState();if (network?.active) void action('read'); }
      if (network?.active && network.rewardUpdate && network.rewardUpdate !== rewardUpdate) {
        rewardUpdate = network.rewardUpdate;day = rewardUpdate.day;error = rewardUpdate.error;
        if (rewardUpdate.state) state = rewardUpdate.state;
        if (rewardUpdate.requestId === 'social-progress') panel.notice(rewardUpdate.error || rewardUpdate.state?.lastReward || '');
      }
      socialProgress.render({ visible: !!network?.active && network.state.role === 'fighter' && ['combat-relay', 'tod-training'].includes(network.state.roomType) && !input.visible, activity: network?.socialProgress, state, day });
      if (!network?.active && !input.replay) {
        if (input.phase === 'fighting' && previousPhase !== 'fighting') { startedLocal = true;receipt = '';savedReceipt = false;resultGeneration++; }
        if (input.phase === 'match-result' && previousPhase !== 'match-result' && startedLocal) {
          startedLocal = false;const won = input.winner === 'player', result = resultGeneration;receipt = 'Saving set rewards…';savedReceipt = false;
          void serial(async () => { try { if (!ready) await load();const next = awardRewardMatch(localAttempt?.state ?? local, won);await store.saveSlot('local', 'rewards', next);local = next;if (localAttempt) localAttempt.state = next;if (identity === 'local') { state = local;if (result === resultGeneration) { receipt = `Set complete: +${won ? 60 : 40} device coins.`;savedReceipt = true; } } } catch { if (identity === 'local') { error = 'Could not save set rewards. Check device storage.';if (result === resultGeneration) receipt = error; } } });
        }
        if (input.phase === 'menu' || input.phase === 'practice') startedLocal = false;
      } else {
        startedLocal = false;
        const result = network?.active && !input.replay && input.phase === 'match-result';
        if (result && previousPhase !== 'match-result') void action('read');
        receipt = result ? busy ? 'Checking account rewards…' : error || 'Account progress' : '';savedReceipt = !!receipt && !busy && !error;
      }
      previousPhase = input.phase ?? '';visible = input.visible && !input.replay;
      panel.render({ visible, state, day: network?.active ? day : Math.floor(Date.now() / 86400000), busy, error, online: !!network?.active });
    },
    dispose() { disposed = true;generation++;socialProgress.dispose();panel.dispose(); },
  };
}

export type TutorialLessonRewardResult = Awaited<ReturnType<ReturnType<typeof createStandaloneRewards>['awardTutorialLesson']>>;
