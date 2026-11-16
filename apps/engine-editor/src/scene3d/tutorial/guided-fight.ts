import type { GameplayPresentation3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

export const guidedPhases = ['sound', 'welcome', 'movement', 'first-hit', 'guard', 'opening', 'defense', 'arena', 'spar', 'loss', 'review', 'final', 'complete'] as const;
export type GuidedPhase = typeof guidedPhases[number];
type Review = { active: boolean; available: boolean; takeover: boolean; frame: number };
const lessons: Partial<Record<GuidedPhase, string>> = { movement: 'neutral', 'first-hit': 'neutral', guard: 'parry-drill', opening: 'combo-lesson', defense: 'di-drill', arena: 'arena-lesson' };
const copy: Record<GuidedPhase, [string, string]> = {
  sound: ['Sound check', 'Set a comfortable volume. You can change sound and controls from Pause at any time.'],
  welcome: ['First fight', 'Learn at your own pace. Every phase and the whole guide can be skipped. Try movement, an opening, defense and the city; then fight real AI.'],
  movement: ['Make space yours', 'Move and jump. Experiment with Drive, wall runs and changing direction. Pause opens your current control bindings.'],
  'first-hit': ['Land your first hit', 'Approach the opponent and press Strike once. A contact, not a button press, completes this step.'],
  guard: ['Defend one hit', 'Face the opponent and hold Guard before the swing arrives. Blocking reduces damage; a well-timed fresh press parries it.'],
  opening: ['Turn one hit into another', 'Land a launcher, chase and try a follow-up. The Practice guidance below explains your equipped attacks. No fixed combo route is required.'],
  defense: ['Influence the next hit', 'The dummy attacks normally. Steer during impact; try a small stick tilt and then a full tilt. The steering readout shows your actual influence.'],
  arena: ['Use what is here', 'Pick up an outlined tool, swing it, throw it, then break a surface. Follow the arena lesson below. Damage changes your next decision.'],
  spar: ['Your first opponent · AI 1', 'A forgiving opponent still follows the real rules. Play the set, or skip ahead whenever you want.'],
  loss: ['A tougher opponent · AI 5', 'Try to win. If you lose, we will inspect the actual exchange and try again. Losing here is useful; the game will not secretly force it.'],
  review: ['Change one decision', 'Review the final exchange, then retry it with live control. Compare your attempt with what happened. Return to the result when you are ready.'],
  final: ['Put it together · AI 3', 'A full match with normal rules. Use whatever caught your interest: movement, tools, defense or a devastating opening.'],
  complete: ['Keep exploring', 'The guide is complete. Replay it from the main menu, explore Practice, or take another match. A loss can always become another attempt.'],
};

/** Presentation-owned coaching observes ordinary simulation; it never awards hits or changes combat rules. */
export function createGuidedFight(options: { firstTime: boolean; playerId: string; opponentId: string; command(actions: string[]): void; sound(): void; acknowledge(): void; leaveReview(): void }) {
  let phase: GuidedPhase | undefined = options.firstTime ? 'sound' : undefined;
  let origin: readonly number[] | undefined, observed = false, retried = false, signature = '';
  let moved = false, jumped = false, rose = false, arenaSteps = 0, reviewAvailable = false, settings = false, successMs = 0;
  const command = (action: string) => { options.command([action]);options.command([]); };
  function enter(next: GuidedPhase) {
    phase = next;origin = undefined;observed = false;retried = false;moved = jumped = rose = false;arenaSteps = 0;settings = false;successMs = 0;
    if (next === 'loss') reviewAvailable = false;
    if (lessons[next]) { options.leaveReview();command('match:quit');command('match:practice');command(`practice:${lessons[next]}`); }
    if (next === 'spar' || next === 'loss' || next === 'final') {
      options.leaveReview();command('match:quit');
      for (let index = 0; index < 8; index++) command('match:easier');
      for (let index = 1; index < (next === 'spar' ? 1 : next === 'loss' ? 5 : 3); index++) command('match:harder');
      command('match:start');
    }
  }
  function advance() { if (phase) enter(phase === 'loss' && !reviewAvailable ? 'final' : guidedPhases[Math.min(guidedPhases.length - 1, guidedPhases.indexOf(phase) + 1)]!); }
  return {
    get state() { return { active: phase !== undefined, phase, observed, retried }; },
    handle(actions: Set<string>) {
      const action = phase && (actions.has('match:quit') || actions.has('match:menu')) ? 'guide:skip-all' : [...actions].find(value => value.startsWith('guide:'));if (!action) return false;
      actions.clear();
      if (phase && (action === 'guide:settings' || action === 'guide:back')) { settings = action === 'guide:settings';return 'menu' as const; }
      if (action === 'guide:start') enter('welcome');
      else if (action === 'guide:retry' && phase) enter(phase);
      else if (action === 'guide:sound') options.sound();
      else if (action === 'guide:skip-all' || action === 'guide:finish') { options.acknowledge();options.leaveReview();phase = undefined;command('match:quit'); }
      else if (action === 'guide:skip' || action === 'guide:next' && (phase === 'sound' || phase === 'welcome' || observed)) { if (phase === 'sound') options.acknowledge();advance(); }
      return true;
    },
    observe(snapshot: GameplaySnapshot3D, review?: Review, clock?: { deltaMs: number; suspended: boolean }) {
      if (!phase) return;
      if (clock?.suspended) return;
      // Completion belongs to observed player actions; pauses, demonstrations and
      // background tabs cannot consume the success acknowledgement.
      if (observed && clock) {
        successMs += Math.min(100, Math.max(0, clock.deltaMs));
        if (successMs >= 1600 && !['sound', 'welcome', 'complete'].includes(phase)) { advance();return; }
      }
      const combat = snapshot.combat;
      const position = snapshot.entities.find(entity => entity.id === options.playerId)?.position;
      if (position && !origin) origin = [...position];
      if (phase === 'movement' && position && origin) {
        moved ||= Math.hypot(position[0] - origin[0]!, position[2] - origin[2]!) > 2;
        jumped ||= (combat?.motion.find(row => row.id === options.playerId)?.jumpHold ?? 0) > 0;
        rose ||= jumped && position[1] > origin[1]! + .2;observed ||= moved && rose;
      }
      if (phase === 'first-hit') observed ||= !!combat?.exchange?.some(event => event.attackerId === options.playerId && event.targetId === options.opponentId && event.kind === 'hit');
      if (phase === 'guard') observed ||= !!combat?.exchange?.some(event => event.targetId === options.playerId && (event.kind === 'block' || event.kind === 'parry'));
      if (phase === 'opening') observed ||= combat?.practice.preset === 'combo-lesson' && combat.practice.lesson?.stage === 3;
      if (phase === 'defense') {
        const influence = combat?.influence.find(row => row.id === options.playerId);
        observed ||= !!influence && Math.hypot(influence.direction.x, influence.direction.z) > .1 && Math.hypot(influence.applied.x - influence.base.x, influence.applied.y - influence.base.y, influence.applied.z - influence.base.z) > 0;
      }
      if (phase === 'arena') {
        for (const event of combat?.interactions?.trace ?? []) if (event.actor === options.playerId) {
          if (event.kind === 'weapon-picked-up') arenaSteps |= 1;
          if (['weapon-wear', 'weapon-shortened', 'weapon-broken'].includes(event.kind)) arenaSteps |= 2;
          if (event.kind === 'weapon-thrown') arenaSteps |= 4;
        }
        for (const event of combat?.environment?.trace ?? []) if (event.actor === options.playerId && event.cause === 'impact' && event.kind === 'removed') arenaSteps |= 8;
        observed ||= arenaSteps === 15;
      }
      if (phase === 'spar' && combat?.match?.phase === 'match-result') observed = true;
      if (phase === 'loss' && combat?.match?.phase === 'match-result') {
        reviewAvailable = !!review?.available;if (reviewAvailable) enter('review');
        else observed = true;
      }
      if (phase === 'review') { retried ||= !!review?.active && review.takeover && review.frame > 0;observed ||= retried && !review?.active; }
      if (phase === 'final' && combat?.match?.phase === 'match-result') enter('complete');
    },
    present(base: GameplayPresentation3D | undefined, paused: boolean): GameplayPresentation3D | undefined {
      if (!base) return base;
      if (!phase) return !paused && (base.layout === 'menu' && base.actions?.some(action => action.action === 'match:start') || base.layout === 'result' && base.actions?.some(action => action.action === 'match:replay')) ? { ...base, actions: [...(base.actions ?? []), { action: 'guide:start', label: 'Guided first fight' }] } : base;
      const [title, body] = copy[phase];
      const controls = [{ action: 'guide:skip', label: 'Skip this phase' }, { action: 'guide:skip-all', label: 'Leave guide' }];
      if (phase === 'sound' || phase === 'welcome' || phase === 'complete') return { layout: 'menu', title, overlay: { title, body }, actions: phase === 'sound' ? [{ action: 'guide:sound', label: 'Adjust sound' }, { action: 'guide:next', label: 'Continue' }, { action: 'guide:skip-all', label: 'Skip guide' }] : phase === 'complete' ? [{ action: 'guide:finish', label: 'Back to main menu' }] : [{ action: 'guide:next', label: 'Begin' }, ...controls] };
      if (paused) return { ...base, actions: settings ? [...(base.actions ?? []).filter(action => action.action.startsWith('practice:')), { action: 'guide:back', label: 'Back to guide' }] : [
        ...(base.actions ?? []).filter(action => action.action === 'pause'), ...(observed ? [{ action: 'guide:next', label: 'Next phase' }] : []), controls[0]!,
        { action: 'guide:settings', label: 'Guide settings' }, controls[1]!,
      ] };
      // The guide owns continuation. Generic rematch/practice actions can leave
      // its phase behind and overflow the result menu's bounded composition.
      if (base.layout === 'result') return { ...base, actions: [
        ...(observed ? [{ action: 'guide:next', label: 'Next phase' }] : []),
        ...(phase === 'review' ? (base.actions ?? []).filter(action => action.action.startsWith('review:')) : [{ action: 'guide:retry', label: 'Play this phase again' }]),
        ...(!observed ? [controls[0]!] : []), controls[1]!,
      ] };
      if (phase === 'review' && base.layout === 'menu') return { ...base, actions: [
        ...(base.actions ?? []).filter(action => action.action.startsWith('review:') && action.action !== 'review:save'), ...controls,
      ] };
      if (base.layout !== 'fight') return { ...base, actions: [...(base.actions ?? []), ...controls] };
      return base;
    },
    prompt() { return phase && !['sound', 'welcome', 'complete'].includes(phase) ? { phase, title: copy[phase][0], body: copy[phase][1], observed } : undefined; },
    changed() { const next = String(phase);const changed = signature !== next;signature = next;return changed; },
  };
}
