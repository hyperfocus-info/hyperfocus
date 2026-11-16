import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { combatBindingLabel } from '../control-hint.ts';
import { createArenaLessonGuidance } from './arena-lesson.ts';

/** Session-local coaching retains the observed result across automatic drill resets. */
export function createPracticeGuidance() {
  let preset = '', outcome = '';
  const arena = createArenaLessonGuidance();
  return {
    text(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D; mappings: readonly { action: string; bindings: readonly string[] }[]; controller?: boolean }) {
      const combat = options.snapshot.combat, learning = combat?.practice;
      const next = combat?.match?.phase === 'practice' ? learning?.preset ?? '' : '';
      if (next !== preset) { preset = next;outcome = ''; }
      const player = options.definition.fighters.find(fighter => fighter.control === 'player');
      const bindingLabel = (name: string) => {
        const binding = options.mappings.find(mapping => mapping.action === `${player?.actionPrefix}${name}`)?.bindings.find(value => value.startsWith('Gamepad') === Boolean(options.controller));
        return binding ? combatBindingLabel(binding) : undefined;
      };
      const key = (name: string) => bindingLabel(name) ?? `${name} (unbound)`;
      const arenaText = arena.text({ snapshot: options.snapshot, definition: options.definition, keys: { interact: key('interact'), jab: key('jab'), heavy: key('heavy'), reset: key('reset') } });
      if (arenaText) return arenaText;
      if (!['neutral', 'parry-drill', 'tech-drill', 'di-drill', 'combo-lesson'].includes(preset)) return '';
      const weapon = combat?.interactions?.weapons.find(item => item.owner === player?.entityId);
      if (preset === 'di-drill') return `Launch steering: let the dummy's launcher hit you. Tilt during the impact pause${options.definition.config.lateInfluenceFrames ? ` or the first ${options.definition.config.lateInfluenceFrames} resumed frames` : ''}.\nA small stick tilt gives small influence; full tilt gives more. Keyboard directions use full influence. Compare your launch path across attempts.\nRepeats automatically · ${key('reset')} retry`;
      if (weapon && (preset === 'neutral' || preset === 'combo-lesson')) return `Weapon held: ${key('jab')} and ${key('heavy')} now use the item, not your unarmed moves.\nHeavy spends more durability; contact wears it further. ${key('interact')} throws toward the opponent.\n${preset === 'combo-lesson' ? 'Throw the item before practicing the unarmed launcher.' : 'Try both attacks and watch the item shorten or break. Pause → Controls for movement and defense.'}`;
      if (preset === 'neutral') {
        const movement = options.controller ? 'Left stick' : ['move-up', 'move-left', 'move-down', 'move-right'].map(action => {
          const binding = options.mappings.find(mapping => mapping.action === action)?.bindings.find(value => !value.startsWith('Gamepad'));
          return binding ? combatBindingLabel(binding) : `${action} (unbound)`;
        }).join('/');
        return `Start here: ${movement} to move. Get close, then ${key('jab')} to strike.\nRelease direction, then ${key('heavy')} to launch. Let your attack recover before acting again.\nHold ${key('guard')} to guard. Pause → Learn a technique for parry, tech and combo lessons.`;
      }
      const feedback = combat?.defenseFeedback.find(feedback => feedback.id === player?.entityId);
      const sample = feedback?.lastAttempt;
      const kind = preset === 'parry-drill' ? 'parry' : 'tech';
      const contact = (kind === 'parry' ? feedback?.hitAt : feedback?.bounceAt) ?? -1000;
      const press = (kind === 'parry' ? feedback?.guardAt : feedback?.techAt) ?? -1000;
      const precise = sample?.kind === kind && (Math.max(sample.inputFrame, sample.impactFrame ?? -1000) >= contact
        || sample.timing === 'unavailable' && sample.inputFrame >= press);
      if (precise && preset !== 'combo-lesson') {
        outcome = sample.timing === 'success' ? `On time — ${kind === 'parry' ? 'parried the swing; the attacker recoiled.' : 'teched the contact; your held direction chose recovery.'}`
          : sample.timing === 'early' ? `Early — wait closer to ${kind === 'parry' ? 'the swing' : 'floor or wall contact'}, then release and press again.`
          : sample.timing === 'late' ? `Late — press just before ${kind === 'parry' ? 'the swing reaches you' : 'floor or wall contact'} next time.`
          : `Unavailable — ${kind === 'parry' ? 'finish your attack or hitstun; guard must be intact.' : 'wait for a hitstun collision and let the tech lockout finish.'}`;
      } else if (preset !== 'combo-lesson' && contact >= 0 && press <= contact) {
        const action = kind === 'parry' ? 'Guard' : 'Tech';
        const impact = kind === 'parry' ? 'the hit' : 'floor or wall contact';
        outcome = press < 0 ? `No ${action.toLowerCase()} press recorded before ${impact}. Try pressing closer to contact.`
          : `${action} press was ${contact - press} frames before ${impact}. Try pressing closer to contact.`;
      }
      if (preset === 'parry-drill') return `Parry: release ${key('guard')}, then press as the Heavy reaches you.\n${outcome ? `Last attempt: ${outcome}` : 'White hands: on time. Yellow: early. Red: late.'}\nRepeats automatically · ${key('reset')} retry`;
      if (preset === 'tech-drill') {
        const buttons = [...new Set(['tech', 'jump', 'dash'].map(bindingLabel).filter(label => label !== undefined))];
        const action = buttons.length ? `Tap ${buttons.join(' or ')} at floor / wall contact` : 'Bind Tech, Jump or Dash in Game settings';
        return `Tech: let Heavy launch you. ${action}; hold a direction to recover.\n${outcome ? `Last attempt: ${outcome}` : 'White contact ring: on time. Yellow: early. Red: late.'}\nRepeats automatically · ${key('reset')} retry`;
      }
      const lesson = learning?.lesson;
      if (lesson?.retry) return `Combo dropped or defended. ${key('reset')} retries with a new defense.`;
      if (lesson?.stage === 3) return `Response learned: ${lesson.branch}. ${[1, 2, 4].filter(bit => lesson.learned & bit).length} / 3 routes. ${key('reset')} tries a new defense.`;
      if (lesson?.stage === 2) return lesson.branch === 'cashout' ? `3 / 3 · Surface close: after a first Strike, press ${key('jab')} again during recovery, then toward + ${key('heavy')} during the second Strike's recovery. Read drift; a tech can end the conversion.`
        : lesson.branch === 'side' ? `3 / 3 · Sideways drift: aim sideways + ${key('jab')} / ${key('heavy')} to redirect.`
        : `3 / 3 · Open air: release direction, then press ${key('jump')} to jump upward. Then aim an attack while both fighters are airborne.`;
      return lesson?.stage === 1 ? `2 / 3 · After recovery, ${key('dash')} toward the airborne opponent, then ${key('jab')}. Read their drift. ${key('reset')} retries.`
        : `1 / 3 · Get close, release direction, then ${key('heavy')} to launch. Let recovery finish.`;
    },
  };
}
