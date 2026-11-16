import type { CombatProject3D, GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';
import { practiceMoveRoleLines } from './practice/practice-model.ts';

type Mapping = { action: string; bindings: readonly string[] };
const padNames = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
export function combatBindingLabel(binding: string) {
  const pad = /Gamepad(?:\d+)?\.Button(\d+)/.exec(binding);
  return pad ? padNames[Number(pad[1])] ?? (Number(pad[1]) === 17 ? 'Touchpad' : `Button ${pad[1]}`) : binding.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Left Shift').replace('ShiftRight', 'Right Shift').replace('Arrow', 'Arrow ');
}
export function combatActionLabel(action: string) {
  if (action === 'match:start') return 'Menu confirm';
  const name = action.replace(/^.*:/, '');
  const labels: Record<string, string> = { jab: 'Strike', heavy: 'Heavy', guard: 'Guard / parry', drive: 'Drive', flurry: 'Flurry shortcut (optional)', jump: 'Jump / hold for height / tech', tech: 'Tech', escape: 'Armored escape', evade: 'Evade', dash: 'Step / hold sprint / air dash', lockon: 'Lock-on', followup: 'Parry follow-up: quick strike', sidestep: 'Parry follow-up: sidestep', feint: 'Feint / parry follow-up', evasive: 'Parry follow-up: evasive strike', reset: 'Reset fighters', pause: 'Pause', interact: 'Grab / pick up / throw', 'move-left': 'Move left', 'move-right': 'Move right', 'move-up': 'Move forward', 'move-down': 'Move backward' };
  return labels[name] ?? name.replaceAll('-', ' ').replace(/^./, letter => letter.toUpperCase());
}
export function combatControlPresentation(options: { presentation?: GameplayPresentation3D; definition?: CombatProject3D; mappings: readonly Mapping[]; controller: boolean; practice?: boolean }) {
  const { presentation, definition } = options;
  const player = definition?.fighters.find(fighter => fighter.control === 'player');
  if (!presentation || !player || !definition || presentation.layout !== 'fight') return presentation;
  const key = (action: string) => {
    const bindings = options.mappings.find(mapping => mapping.action === action)?.bindings ?? [];
    const binding = bindings.find(value => value.startsWith('Gamepad') === options.controller);
    if (!binding) return 'unbound';
    return combatBindingLabel(binding);
  };
  const action = (name: string) => key(player.actionPrefix + name);
  const tech = action('tech') === 'unbound' ? action('jump') : action('tech');
  const movement = options.controller ? 'Left stick' : ['move-up', 'move-left', 'move-down', 'move-right'].map(key).join('/');
  const hint = [
    ...(definition.interactions ? [`${action('interact')} grapple / pick up / throw; press during a grapple to tech. Held items replace Strike and Heavy; parry thrown items with a fresh guard press.`] : []),
    ...(definition.movement?.wallRunFrames ? [`Aim along a contacted wall to run briefly; ${action('jump')} at the wall jumps away. A successful wall run restores your air dash. Wall movement spends stamina.`] : []),
    `Guard covers ${definition.config.guardArcDegrees ?? 180} degrees in front. ${definition.config.guardTurnSpeed === undefined ? 'You can turn while guarding or in block stun.' : definition.config.guardTurnSpeed === 0 ? 'Guarding and block stun lock your facing.' : `Guarding and block stun limit turning to ${definition.config.guardTurnSpeed} degrees per second. Face the incoming strike.`}`,
    definition.movement?.separateJump
      ? `${movement} move / aim · ${action('jump')} jump in any direction; hold for a higher jump · ${action('dash')} tap: step / hold: sprint / airborne tap: air dash · jump during hitstun: tech`
      : `${movement} move / aim · ${action('jump')} ground tap: jump / hold ¼s: step + sprint / airborne ${definition?.movement?.airJumps ? 'neutral press: air jump / ' : ''}direction + press: instant dash / hitstun: tech`,
    `If sprint exhausts stamina, keep walking to recover; release ${action(definition.movement?.separateJump ? 'dash' : 'jump')} before sprinting again.`,
    `${action('jab')} Strike · ${action('heavy')} Heavy`,
    `${action('drive')} + ${action('jab')}: tracking flurry. Unarmed ${action('drive')} + ${action('heavy')}: neutral launcher; forward diving kick (hold Heavy for distance); back automatic backdash into multi-hit lunge; side redirect.`,
    `Unarmed back + ${action('heavy')}: armored forward kick. Heavy attacks break this armor.`,
    `Launch steering (DI): aim during the impact pause${definition.config.lateInfluenceFrames ? ` or up to ${definition.config.lateInfluenceFrames} frames after movement resumes` : ''}. Small stick tilt gives small influence; full tilt gives more. Keyboard directions use full influence.`,
    'Defense signals: a radial burst marks a parry; surface corner marks show a successful tech; gold facets show armor. The nearby label names the result. DI confirms a steered launch, not a guaranteed escape.',
    ...(definition.interactions ? ['White outlines identify usable items. Strike and Heavy use a held item; Heavy wears it faster and contact adds wear. Wood can split against metal, shortening its reach. Weapon chip can pass through guard or parry; parrying still disrupts the attack. Strike cracked structures to open routes; broken surfaces stay changed for the match.'] : []),
    `${action('drive')} tap: jump, even with direction or attacks (after recovery). Hold: Drive attacks.`,
    `${action('feint')} feint during Heavy windup; later presses stay committed. Landing briefly delays offense; guard stays available.`,
    `${action('guard')} guard / re-press parry · ${tech} tech · ${action('escape')} escape · ${action('evade')} evade`,
    `After parry: ${action('followup')} quick strike · ${action('sidestep')} sidestep · ${action('feint')} feint · ${action('evasive')} evasive strike`,
    `${action('lockon')} lock-on · ${key('pause')} pause${options.practice ? ` · ${action('reset')} reset${options.controller ? ' · Touchpad practice controls / press again to return to fight' : ''}` : ''}`,
    ...(definition?.movement?.wallSlideSpeed ? ['Hold toward a wall while falling to slide. Landing restores the air jump and air dash.'] : []),
    ...(options.practice ? practiceMoveRoleLines({ strike: action('jab'), heavy: action('heavy') }) : []),
    `Below each stamina bar: shield = guard integrity; diamond = armored escape ready. Parries repair guard. A broken shield rebuilds for ${(definition?.config.guardBreakFrames ?? 600) / 60}s; guard is unavailable until it finishes.`,
  ].join('\n');
  return { ...presentation, hint: options.practice && presentation.hint ? `${presentation.hint}\n${hint}` : hint };
}
