import { hypot } from '../../../math/simulation.ts';
import { initialRandomDefense, sampleRandomDefense, validateRandomDefense, type PracticeRandomDefense } from './random-defense.ts';
import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatEvent, CombatInput, CombatSnapshot } from '../../../combat/state.ts';
import { combatLessonHint, initialCombatLesson, observeCombatLesson, validateCombatLesson, type CombatLesson } from './lesson.ts';
import type { CombatAiAction3D, CombatAiBody3D } from '../combat-ai.ts';
import type { GameplayPresentation3D } from '../gameplay-contracts.ts';
import { readCombatPracticeState3D } from './snapshot.ts';

const presets = ['neutral', 'outward', 'sideways', 'tech', 'escape', 'guard', 'parry-drill', 'tech-drill', 'di-drill', 'arena-lesson', 'combo-lesson', 'random'] as const;
const presentationPresets = ['parry-drill', 'tech-drill', 'combo-lesson', ...presets.filter(choice => !['parry-drill', 'tech-drill', 'combo-lesson'].includes(choice))] as const;
type Preset = typeof presets[number];
const labels: Record<Preset, string> = { neutral: 'Neutral', outward: 'Steer outward', sideways: 'Steer sideways', tech: 'Attempt tech', escape: 'Use escape', guard: 'Hold guard', 'parry-drill': 'Learn parry', 'tech-drill': 'Learn tech', 'di-drill': 'Steer your launch', 'arena-lesson': 'Learn arena tools', 'combo-lesson': 'Learn combos', random: 'Random defense' };

/** Practice changes the defender's inputs, never its combat permissions or resources. */
export function createCombatPractice3D({ config, nearSurface }: { config: CombatConfig; nearSurface?: (fighterId: string) => boolean }) {
  let preset: Preset = 'neutral';
  let lesson = initialCombatLesson();
  let random = initialRandomDefense();
  function validate(value: unknown): { preset: Preset; lesson?: CombatLesson; random?: PracticeRandomDefense } {
    if (value === undefined) return { preset: 'neutral' };
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'preset' && key !== 'lesson' && key !== 'random') || !('preset' in value) || !presets.some(preset => preset === value.preset)) throw new Error('Invalid combat practice preset.');
    return readCombatPracticeState3D({ preset: value.preset, ...('random' in value ? { random: validateRandomDefense(value.random) } : {}), ...('lesson' in value ? { lesson: validateCombatLesson(value.lesson) } : {}) });
  }
  return {
    capture() { return { preset, ...(['random','combo-lesson'].includes(preset) ? { random: { ...random } } : {}), ...(preset === 'combo-lesson' ? { lesson: { ...lesson } } : {}) }; }, validate,
    restore(value: unknown) { const saved = validate(value);preset = saved.preset;lesson = saved.lesson ?? initialCombatLesson();random = saved.random ?? initialRandomDefense(); },
    reset() { preset = 'neutral';lesson = initialCombatLesson();random = initialRandomDefense(); },
    resetRound() { lesson = { ...initialCombatLesson(), learned: lesson.learned };sampleRandomDefense(random);random.serial = -1;random.touching = false; },
    observe(before: CombatSnapshot, events: readonly CombatEvent[], inputs: readonly CombatInput[], playerId: string, grounded: ReadonlySet<string>) { if (preset === 'combo-lesson') observeCombatLesson(lesson, before, events, inputs, playerId, grounded, config, nearSurface?.(before.fighters.find(fighter => fighter.id !== playerId)?.id ?? '') ?? false);if (['random','combo-lesson'].includes(preset) && events.some(event => event.kind === 'hit' && event.attackerId === playerId)) sampleRandomDefense(random); },
    select(actions: ReadonlySet<string>) { let changed = false;for (const choice of presets) if (actions.has(`practice:${choice}`) && preset !== choice) { preset = choice;lesson = initialCombatLesson();random = initialRandomDefense();changed = true; }return changed; },
    repeat(state: CombatSnapshot) { return preset.endsWith('-drill') && state.frame >= 240; },
    presentation(base: GameplayPresentation3D): GameplayPresentation3D {
      const hint = preset === 'parry-drill' ? 'Release guard, then press guard as the heavy swing reaches you. White hands: parry. Yellow: early. Red: late. Repeats automatically.' : preset === 'tech-drill' ? 'Let the launcher hit. Tap jump / tech as your body meets the floor or wall. White contact ring: tech. Yellow: early. Red: late. Repeats automatically.' : 'Chase outward steering; redirect sideways steering; cash out before a tech surface. Reset restores both fighters.';
      return { ...base, objective: 'Practice', hint: preset === 'di-drill' ? `Let the launcher hit. Tilt your stick during impact${config.lateInfluenceFrames ? ` or the first ${config.lateInfluenceFrames} resumed frames` : ''}. Partial tilt gives partial influence; keyboard directions give full influence. Compare launch angles. Repeats automatically.` : preset === 'combo-lesson' ? combatLessonHint(lesson) : preset === 'random' ? 'Read the body lean and trail: steering changes on impacts, and the defender may tech a surface. Reset gives a new defense; saves replay the same choices.' : hint,
        actions: [...presentationPresets.map(choice => ({ action: `practice:${choice}`, label: labels[choice], disabled: choice === preset })), { action: 'practice:reset', label: 'Reset fighters' }, { action: 'match:menu', label: 'Main menu' }] };
    },
    decide(input: { state: CombatSnapshot; fighterId: string; targetId: string; body: CombatAiBody3D; collision: boolean }): CombatAiAction3D {
      const self = input.state.fighters.find(fighter => fighter.id === input.fighterId)!;
      const target = input.state.fighters.find(fighter => fighter.id === input.targetId)!;
      const dx = self.position.x - target.position.x, dz = self.position.z - target.position.z, length = hypot(dx, dz) || 1;
      const away = { x: dx / length, y: 0, z: dz / length };
      if (preset.endsWith('-drill')) {
        // Keep both authored hurt volumes clear instead of pushing against an
        // unreachable fixed spacing (the demo uses a larger radius than the preset).
        const spacing = config.hurtRadius * 2 + .15;
        const approach = length > spacing && input.state.frame < 110;
        const ready = input.state.frame >= 60 && input.state.frame < 120 && !self.moveId && self.stunFrames === 0 && self.attackSerial === 0;
        return { direction: approach ? { x: -away.x, y: 0, z: -away.z } : { x: 0, y: 0, z: 0 }, jump: false, dash: false, sprint: false,
          input: { fighterId: self.id, direction: { x: 0, y: 0, z: 0 }, pressed: ready && length <= spacing + .15 ? ['heavy'] : [] } };
      }
      const randomized = preset === 'random' || preset === 'combo-lesson';
      if (randomized && random.serial !== target.attackSerial) { random.serial = target.attackSerial;sampleRandomDefense(random); }
      const side = randomized ? random.choice === 2 ? 1 : random.choice === 3 ? -1 : 0 : 0;
      const direction = preset === 'outward' || randomized && random.choice === 1 ? away : randomized && random.choice === 4 ? { x: -away.x, y: 0, z: -away.z }  : preset === 'sideways' || side ? { x: -away.z * (side || 1), y: 0, z: away.x * (side || 1) } : { x: 0, y: 0, z: 0 };
      const attemptTech = randomized && random.tech && input.collision && !random.touching;random.touching = input.collision;
      const escape = config.moves.find(move => move.armoredEscape);
      // Use the same collision-frame button window available to players. A guessed
      // floor height arms too early on some arcs and triggers the mash lockout.
      return { direction: { x: 0, y: 0, z: 0 }, jump: false, dash: false, sprint: false,
        input: { fighterId: self.id, direction, guard: preset === 'guard', tech: (preset === 'tech' && input.collision || attemptTech) && self.stunKind === 'hit',
          pressed: preset === 'escape' && self.stunKind === 'hit' && self.escapeCharges > 0 && escape ? [...escape.command] : [] } };
    },
  };
}
