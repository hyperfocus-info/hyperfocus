import { hypot } from '../../../math/simulation.ts';
import type { CombatEvent, CombatFighterState } from '../../../combat/state.ts';
import type { CombatAiAction3D } from '../combat-ai.ts';

type Move = { moveId: string; hits: number; damage: number; whiffs: number; blocked: number; parried: number };
type Drought = { fighter: string; startFrame: number; endFrame: number; frames: number; reasons: Record<string, number>; open: boolean };
type Actor = { frame: number; serial: number; move: string; contact: boolean; start: number; reasons: Record<string, number>; x: number; z: number; stuck: number };
/** Bounded observational summaries. They never feed the tactical policy. */
export function createCombatAiInsights() {
  const moves: Move[] = [], droughts: Drought[] = [], actors = new Map<string, Actor>();
  let droppedDroughts = 0, droppedMoves = 0;
  function move(id: string) {
    let row = moves.find(row => row.moveId === id);
    if (!row) { if (moves.length === 16) { moves.shift();droppedMoves++; }row = { moveId: id, hits: 0, damage: 0, whiffs: 0, blocked: 0, parried: 0 };moves.push(row); }
    return row;
  }
  function drought(fighter: string, actor: Actor, endFrame: number, open: boolean): Drought { return { fighter, startFrame: actor.start, endFrame, frames: endFrame - actor.start, reasons: { ...actor.reasons }, open }; }
  return {
    clear() { moves.length = droughts.length = 0;actors.clear();droppedDroughts = droppedMoves = 0; },
    observe(frame: number, self: CombatFighterState, target: CombatFighterState, action: CombatAiAction3D, attackMove?: string) {
      let actor = actors.get(self.id);
      if (!actor) { if (actors.size === 16) actors.delete(actors.keys().next().value!);actor = { frame, serial: self.attackSerial, move: attackMove ?? '', contact: self.hitTargets.length > 0, start: frame, reasons: {}, x: self.position.x, z: self.position.z, stuck: 0 };actors.set(self.id, actor); }
      const elapsed = Math.max(0, frame - actor.frame);
      if (actor.move && (self.attackSerial !== actor.serial || !self.moveId)) {
        if (!actor.contact) move(actor.move).whiffs++;
        actor.move = '';actor.contact = false;
      }
      if (attackMove && self.attackSerial !== actor.serial) {
        if (frame - actor.start >= 180) { if (droughts.length === 32) { droughts.shift();droppedDroughts++; }droughts.push(drought(self.id, actor, frame, false)); }
        actor.start = frame;actor.reasons = {};actor.move = attackMove;actor.contact = false;
      }
      actor.contact ||= self.hitTargets.length > 0;actor.serial = self.attackSerial;
      const moving = hypot(action.direction.x, action.direction.z) > .1;
      actor.stuck = moving && hypot(self.position.x - actor.x, self.position.z - actor.z) < .01 ? actor.stuck + elapsed : 0;
      const reason = self.health <= 0 || target.health <= 0 ? 'round-resolved' : self.stunFrames ? 'in-hit-or-block-recovery' : self.moveId ? 'committed-attack-or-recovery'
        : action.input.guard ? 'defending-observed-threat' : self.stamina < 20 ? 'low-stamina' : action.jump ? 'traversal'
          : actor.stuck >= 30 ? 'movement-not-progressing' : action.dash || action.sprint ? 'closing-distance'
            : moving ? 'positioning' : hypot(target.position.x - self.position.x, target.position.z - self.position.z) > 3 ? 'outside-attack-range' : 'waiting-for-opening';
      if (elapsed) actor.reasons[reason] = (actor.reasons[reason] ?? 0) + elapsed;
      actor.frame = frame;actor.x = self.position.x;actor.z = self.position.z;
    },
    resolve(event: CombatEvent, fighterId: string) {
      if (event.attackerId !== fighterId || !['hit', 'block', 'parry', 'guard-break'].includes(event.kind)) return;
      const actor = actors.get(fighterId);if (actor) actor.contact = true;
      // Physical contact (including an already defeated fighter) is not damaging success.
      if ((event.kind === 'hit' || event.kind === 'guard-break') && event.damage <= 0) return;
      const row = move(event.moveId || (event.defenseReason === 'grapple-not-teched' ? 'grab' : 'interaction'));
      if (event.kind === 'hit' || event.kind === 'guard-break') { row.hits++;row.damage += event.damage; }
      else if (event.kind === 'block') row.blocked++;else row.parried++;
    },
    report() {
      return { droppedMoves, worked: moves.filter(row => row.hits).map(({ moveId, hits, damage }) => ({ moveId, hits, damage })),
        struggled: moves.filter(row => row.whiffs || row.blocked || row.parried).map(({ moveId, whiffs, blocked, parried }) => ({ moveId, whiffs, blocked, parried })),
        attackDroughts: [...droughts.map(row => ({ ...row, reasons: { ...row.reasons } })), ...[...actors].filter(([, actor]) => actor.frame - actor.start >= 180).map(([id, actor]) => drought(id, actor, actor.frame, true))], droppedDroughts };
    },
  };
}
