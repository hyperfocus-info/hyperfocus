import type { CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import type { TutorialDefinition, TutorialStep } from '@hyperfocus/ui/tutorial';
import { combatBindingLabel } from '../fight-hud/control-hint';

export function tutorialDefinition(options: { kind: string; definition: CombatProject3D; mappings: readonly { action: string; bindings: readonly string[] }[]; controller?: boolean; branch?: string }): TutorialDefinition | undefined {
  const player = options.definition.fighters.find(fighter => fighter.control === 'player');
  const bindingFor = (action: string) => options.mappings.find(mapping => mapping.action === (action.startsWith('move-') ? action : player?.actionPrefix + action))?.bindings.find(binding => binding.startsWith('Gamepad') === !!options.controller);
  const key = (action: string) => {
    const binding = bindingFor(action);
    return binding ? combatBindingLabel(binding) : `${action} (unbound)`;
  };
  const recovery = [...new Set(['jump', 'tech'].flatMap(action => bindingFor(action) ? [key(action)] : []))].join(' or ') || 'Jump (unbound; open Controls to assign a button)';
  const movement = options.controller ? 'Left stick' : ['move-up', 'move-left', 'move-down', 'move-right'].map(key).join(' / ');
  const neutral = options.controller ? 'Let go of the left stick' : 'Release the movement keys';
  const sideAim = options.definition.config.directionMode === 'forward-back' ? 'Aim toward the opponent' : 'Aim sideways';
  const labels: Record<string, string> = { move: 'Move', jump: 'Jump', hit: 'Strike', guard: 'Defend', launch: 'Launch', chase: 'Chase', follow: 'Follow up', parry: 'Parry', tech: 'Recover', steer: 'Steer', pickup: 'Pick up', use: 'Use', throw: 'Throw', break: 'Break' };
  const step = (id: string, instruction: string, input: string, timing: string, success: string): TutorialStep => ({ id, label: labels[id]!, instruction, input, timing, success });
  const lesson = (title: string, objective: string, steps: TutorialStep[], completion: string) => ({ id: options.kind, title, objective, steps, completion });
  switch (options.kind) {
    case 'movement': return lesson('Move, then jump', 'Create space and leave the ground.', [
      step('move', 'Move away from your starting point', movement, 'Move freely. There is no time limit.', 'Travel two metres from where you started.'),
      step('jump', 'Jump off the ground', key('jump'), 'Release the button between jumps. Hold to jump higher.', 'Your fighter rises off the ground after a jump input.'),
    ], 'Movement complete');
    case 'first-hit': return lesson('Land your first hit', 'Get close enough for one deliberate strike.', [
      step('hit', 'Approach, then press Strike once', `${movement} toward them, then ${key('jab')}`, 'There is no time limit. If you miss, move closer and wait for your attack to finish.', 'Your strike connects and the opponent loses health.'),
    ], 'First hit connected');
    case 'guard': return lesson('Defend one hit', 'Face the opponent and block the incoming swing.', [
      step('guard', 'Hold Guard before the swing arrives', key('guard'), 'Keep holding through contact. Blocking reduces damage; a fresh press just before contact can parry it.', 'The incoming hit is blocked or parried. A block can still cost a little health.'),
    ], 'Defense confirmed');
    case 'combo-lesson': return lesson('Launch → chase → follow up', 'Land three hits before the opponent can recover.', [
      step('launch', 'Launch the opponent', `${neutral}, then press ${key('heavy')}`, 'Move close, stop moving, then attack once. Wait for your attack to finish.', 'Your hit lifts the opponent off the ground.'),
      step('chase', 'Chase and strike', `${movement} toward them + ${key('dash')}, then ${key('jab')}`, 'Move as your attack finishes. Hit again before the opponent recovers.', 'Move toward the airborne opponent and land another hit.'),
      step('follow', options.branch === 'cashout' ? 'Finish toward the surface' : options.branch === 'side' ? 'Follow the sideways drift' : 'Stay with the airborne opponent',
        options.branch === 'cashout' ? `${key('jab')} again, then toward + ${key('heavy')}` : options.branch === 'side' ? `${sideAim} + ${key('jab')} or ${key('heavy')}` : `${neutral}, press ${key('jump')}, then aim + ${key('jab')}`,
        options.branch === 'cashout' ? 'Press Strike again in the highlighted window, then Heavy in the next window.' : 'Follow their movement. Hit before they recover; the timing bar shows how long you have.',
        'Land a follow-up that matches the actual launch direction.'),
    ], 'Combo complete');
    case 'parry-drill': return lesson('Parry the heavy', 'A fresh guard press turns the incoming hit back.', [
      step('parry', 'Release, then press Guard', key('guard'), 'Press just before the swing reaches you. Use the highlighted timing window.', 'Your timed guard turns the hit back. Holding Guard alone does not count.'),
    ], 'Parry confirmed');
    case 'tech-drill': return lesson('Recover at impact', 'Time a fresh press as your launched fighter meets a surface.', [
      step('tech', 'Tap at floor or wall contact', recovery, 'Press just before you touch the surface. Release between attempts; repeated presses delay your recovery.', 'You recover at the surface instead of bouncing away.'),
    ], 'Tech confirmed');
    case 'di-drill': return lesson('Steer your launch', 'Change the direction you travel after a hit.', [
      step('steer', 'Tilt during the impact pause', movement, 'Let the launcher hit, then steer while the hit briefly freezes the action. Use the live timing cue.', 'Your direction changes where the hit sends you.'),
    ], 'Launch steering confirmed');
    case 'arena-lesson': return lesson('Use the arena', 'Pick up a tool, use it, throw it, then break a surface.', [
      step('pickup', 'Pick up an outlined tool', key('interact'), 'Move within reach of the pickup prompt, then press once.', 'Your fighter owns a tool.'),
      step('use', 'Strike with the tool', `${key('jab')} or ${key('heavy')}`, 'Move within reach of a target; Strike and Heavy now use the held item.', 'A real use or contact spends the tool’s durability.'),
      step('throw', 'Throw the tool', key('interact'), 'Press again while holding a tool. Pick up another if yours broke.', 'The tool leaves your hand as a thrown object.'),
      step('break', 'Break a nearby surface', key('heavy'), 'Hit a cracked panel or wooden prop. Repeat until it breaks.', 'Your impact removes a destructible surface.'),
    ], 'Arena lesson complete');
  }
}
