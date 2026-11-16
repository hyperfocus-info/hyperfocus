import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Optional Practice reference uses the host's current keyboard/controller labels. */
export function practiceMoveRoleLines(options: { strike: string; heavy: string }) {
  return [
    `Unarmed ${options.strike}: neutral damage filler; forward approach; back retreat. Direction uses forward/back halves; release the stick for neutral.`,
    `Unarmed ${options.heavy}: neutral launcher; back armored kick; forward damage finish. Heavy breaks ordinary armor.`,
    `During a dash, ${options.strike}: forward jolt / back retreating jab. With Drive: forward gazelle / back retreating hook.`,
    `During a dash, ${options.heavy}: forward liver punch / back armored return punch. With Drive: forward dive (hold ${options.heavy} to accelerate) / back jump (re-press Drive for wheel kick).`,
    `Release the stick during a dash: ${options.strike} stopping straight / ${options.heavy} uppercut. With Drive: double body blow / rising knee. Weapons keep these roles as thrusts or swings.`,
  ];
}

export function createPracticeInputHistory() {
  let previous = '', lastFrame = -1, lastTick = -1, wasActive = false;
  const entries: Array<{ frame: number; input: string; hitstop: boolean }> = [];
  return {
    clear() { entries.length = 0; previous = ''; lastFrame = -1; lastTick = -1; wasActive = false; },
    record(options: { active: boolean; frame: number; tick: number; actions: Iterable<string>; hitstop: boolean; direction?: { x: number; y: number; z: number } }) {
      if (!options.active || !wasActive || options.frame < lastFrame || options.tick < lastTick) { entries.length = 0; previous = ''; }
      wasActive = options.active; lastFrame = options.frame; lastTick = options.tick;
      if (!options.active) return;
      const buttons = [...options.actions].filter(action => !action.startsWith('practice:') && !action.startsWith('match:') && action !== 'reduced-motion' && action !== 'pause').sort().join(' + ') || 'neutral';
      const direction = options.direction;
      const input = buttons + (direction ? ` | stick ${Math.round(Math.min(1, Math.hypot(direction.x, direction.y, direction.z)) * 100)}% (${direction.x.toFixed(2)}, ${direction.z.toFixed(2)} world)` : '');
      if (input !== previous) { entries.unshift({ frame: options.frame, input, hitstop: options.hitstop });entries.length = Math.min(entries.length, 12);previous = input; }
    },
    entries() { return entries.map(entry => ({ ...entry })); },
  };
}

export function practiceFrameLines(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D }) {
  return (options.snapshot.combat?.state.fighters ?? []).map(fighter => {
    const binding = options.definition.fighters.find(item => item.entityId === fighter.id);
    const name = binding?.control === 'player' ? 'You' : 'Dummy';
    const move = options.definition.config.moves.find(item => item.id === fighter.moveId);
    let state = fighter.health <= 0 ? 'KO · reset when ready' : fighter.stunFrames ? `${fighter.stunKind === 'block' ? 'Block' : 'Hit'} stun ${fighter.stunFrames}f` : 'Ready';
    if (move && !fighter.stunFrames && fighter.health > 0) {
      const recovery = fighter.hitConfirmed ? move.hitRecoveryFrames ?? move.recoveryFrames : move.recoveryFrames;
      const start = move.startupFrames, end = start + move.activeFrames, total = end + recovery;
      state = `${move.id} · ${fighter.moveFrame < start ? `Startup ${start - fighter.moveFrame}f` : fighter.moveFrame < end ? `Active ${end - fighter.moveFrame}f` : `Recovery ${Math.max(0, total - fighter.moveFrame)}f`} · ${start}/${move.activeFrames}/${recovery}${fighter.hitConfirmed ? ' · hit confirmed' : ''}`;
    }
    return `${name}: ${state}${fighter.guardBrokenFrames ? ` · guard ${fighter.guardBrokenFrames}f` : ''}`;
  });
}
