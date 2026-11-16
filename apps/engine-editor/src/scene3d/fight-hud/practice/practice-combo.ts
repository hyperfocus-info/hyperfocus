import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { inspectCombatInput } from '@hyperfocus/engine/combat';

const reasons = {
  'buffer-expired': 'Input expired before it could execute.',
  'outside-cancel-window': 'Waiting: outside the follow-up window.',
  'hit-not-confirmed': 'Waiting: this follow-up needs a confirmed hit.',
  'insufficient-stamina': 'Waiting: insufficient stamina.',
  stunned: 'Waiting: finish stun first.',
  'landing-recovery': 'Waiting: finish landing recovery.',
  'parry-followup-required': 'Waiting: this move needs a successful parry.',
  'escape-spent': 'Armored escape has no remaining charge.',
  'command-unmatched': 'No authored move matches this input and direction.',
  defeated: 'Cannot attack while defeated.',
  ready: 'Buffered input is eligible for the next simulation step.',
};

/** Read-only, bounded evidence from committed simulation moves and contacts. */
export function createPracticeComboEvidence() {
  let frame = -1, preset = '', serial = -1, moveId = '', finished = false, contacted = false, pending = '';
  const entries: string[] = [];
  function add(line: string) { if (entries[0] !== line) { entries.unshift(line);entries.length = Math.min(entries.length, 8); } }
  function clear() { frame = -1;preset = '';serial = -1;moveId = '';finished = contacted = false;pending = '';entries.length = 0; }
  return {
    clear,
    observe(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D; localFighterId?: string }) {
      const { snapshot, definition } = options, combat = snapshot.combat;
      if (!combat || combat.match?.phase !== 'practice') { clear();return ''; }
      const nextPreset = combat.practice?.preset ?? '';
      if (combat.state.frame < frame || nextPreset !== preset) clear();
      preset = nextPreset;frame = combat.state.frame;
      const id = options.localFighterId ?? definition.fighters.find(row => row.control === 'player')?.entityId;
      const fighter = combat.state.fighters.find(row => row.id === id);
      if (!fighter) return '';
      if (serial !== fighter.attackSerial || moveId && fighter.moveId !== moveId) {
        if (moveId && finished && !contacted) add(`F${frame}: Attack missed · ${moveId} finished without a recorded contact.`);
        const began = serial >= 0 && fighter.attackSerial !== serial;
        serial = fighter.attackSerial;moveId = fighter.moveId;finished = contacted = false;
        if (moveId) add(`F${frame}: ${began ? 'Started' : 'Observed'} ${moveId}${began ? '.' : ` at move frame ${fighter.moveFrame}.`}`);
      }
      const move = definition.config.moves.find(row => row.id === fighter.moveId);
      if (move) {
        contacted ||= fighter.hitTargets.length > 0 || fighter.hitConfirmed;
        const recovery = fighter.hitConfirmed ? move.hitRecoveryFrames ?? move.recoveryFrames : move.recoveryFrames;
        finished = fighter.health > 0 && fighter.stunFrames === 0 && fighter.moveFrame >= move.startupFrames + move.activeFrames + recovery;
      }
      const input = inspectCombatInput({ config: definition.config, fighter, frame });
      const signature = input ? `${input.pressedFrame}:${input.key}:${input.reason}` : '';
      if (input && signature !== pending) add(`F${frame}: ${input.key}${input.moveId ? ` → ${input.moveId}` : ''} · ${reasons[input.reason]} Pressed F${input.pressedFrame}.`);
      pending = signature;
      return entries.join('\n');
    },
  };
}
