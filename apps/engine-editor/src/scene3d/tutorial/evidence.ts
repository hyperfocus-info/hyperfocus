import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { inspectCombatInput } from '@hyperfocus/engine/combat';
import type { TutorialFeedback, TutorialTiming } from '@hyperfocus/ui/tutorial';

/** Translate committed simulation evidence into a correction, never a guessed score. */
export function createTutorialEvidence() {
  let origin: readonly number[] | undefined, moved = false, jumpPressed = false, jumped = false, lastSerial = -1, lastMove = '', contact = false, dropped = false;
  let feedback: TutorialFeedback | undefined, lastStage = 0, arenaFrame = -1, needsTool = false;
  const arena = new Set<string>(), arenaEvents = new Set<string>();
  return {
    observe(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D; kind: string }) {
      const combat = options.snapshot.combat, id = options.definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      const player = combat?.state.fighters.find(fighter => fighter.id === id), target = combat?.state.fighters.find(fighter => fighter.id !== id);
      const completed: string[] = [], timingActions: string[] = [];let timing: TutorialTiming | undefined, failed = false, recovered = false;
      if (!combat || !player || !target) return { completed, timing, timingActions, feedback, dropped: false, failed, recovered };
      const frame = combat.state.frame, kind = options.kind;
      const result = (message: string, correction: string) => { feedback = { id: `${frame}:${message}`, message, correction }; };
      if (kind === 'movement') {
        origin ??= [player.position.x, player.position.y, player.position.z];
        moved ||= Math.hypot(player.position.x - origin[0]!, player.position.z - origin[2]!) > 2;
        jumpPressed ||= (combat.motion.find(row => row.id === id)?.jumpHold ?? 0) > 0;
        jumped ||= jumpPressed && player.position.y > origin[1]! + .2;
        if (moved) completed.push('move');if (jumped) completed.push('jump');
      }
      if (kind === 'first-hit') {
        if (combat.exchange?.some(event => event.attackerId === id && event.targetId === target.id && event.kind === 'hit')) completed.push('hit');
        if (lastMove && !player.moveId && !contact) result('Your strike missed', 'Move closer, face the opponent, then press Strike once after recovering.');
        if (lastSerial !== player.attackSerial) { lastSerial = player.attackSerial;contact = false; }
        contact ||= player.hitConfirmed || player.hitTargets.length > 0;lastMove = player.moveId;
      }
      if (kind === 'guard') {
        if (combat.exchange?.some(event => event.targetId === id && (event.kind === 'block' || event.kind === 'parry'))) completed.push('guard');
        else if (combat.exchange?.some(event => event.targetId === id && event.kind === 'hit')) result('The swing reached you', 'Face the opponent and hold Guard before the next swing. Keep holding through contact.');
      }
      if (kind === 'arena-lesson') {
        for (const event of combat.interactions?.trace ?? []) if (event.actor === id) {
          if (event.kind === 'weapon-picked-up') arena.add('pickup');
          if (['weapon-wear', 'weapon-shortened', 'weapon-broken'].includes(event.kind)) arena.add('use');
          if (event.kind === 'weapon-thrown') arena.add('throw');
          // Trace survives many display frames and rolls over at its capacity.
          // Process each event once, retaining order for events on the same tick.
          if (event.frame < arenaFrame) continue;
          if (event.frame > arenaFrame) { arenaFrame = event.frame;arenaEvents.clear(); }
          const eventId = `${event.kind}:${event.target}:${event.value}`;
          if (arenaEvents.has(eventId)) continue;
          arenaEvents.add(eventId);
          if (event.kind === 'weapon-broken' && !arena.has('throw')) { needsTool = true;recovered = false; }
          if (needsTool && ['weapon-picked-up', 'weapon-thrown'].includes(event.kind)) {
            needsTool = false;recovered = true;
            if (event.kind === 'weapon-picked-up') result('Replacement tool ready', 'Your progress is kept. Throw this tool, then break a nearby surface.');
          }
          if (event.kind === 'weapon-thrown') result('Throw confirmed', 'Continue with Heavy against a cracked panel or wooden prop until it breaks.');
        }
        if (combat.environment?.trace.some(event => event.actor === id && event.kind === 'removed' && event.cause === 'impact')) arena.add('break');
        completed.push(...arena);
        if (needsTool && !arena.has('throw')) {
          failed = true;result('The tool broke before the throw', 'A fresh attempt starts automatically. Use the tool once, then throw it.');
        }
      }
      if (kind === 'di-drill') {
        const influence = combat.influence.find(row => row.id === id);
        if (influence) {
          const magnitude = Math.hypot(influence.direction.x, influence.direction.z);
          if (magnitude > .1 && Math.hypot(influence.applied.x - influence.base.x, influence.applied.y - influence.base.y, influence.applied.z - influence.base.z) > 0) completed.push('steer');
          timing = { label: 'Steering window', value: influence.remaining, total: Math.max(1, options.definition.config.lateInfluenceFrames ?? 1), cue: combat.hitstop.remaining ? 'Steer now • impact pause' : `${influence.remaining} resumed frames remain` };
        }
      }
      if (kind === 'parry-drill' || kind === 'tech-drill') {
        const desired = kind === 'parry-drill' ? 'parry' : 'tech', defense = combat.defenseFeedback.find(row => row.id === id), attempt = defense?.lastAttempt;
        if (attempt?.kind === desired) {
          if (attempt.timing === 'success') completed.push(desired);
          else if (attempt.timing === 'early') result('Too early', `Release, then press closer to ${desired === 'parry' ? 'the incoming hit' : 'surface contact'}.`);
          else if (attempt.timing === 'late') result('Too late', `Press just before ${desired === 'parry' ? 'the swing reaches you' : 'floor or wall contact'} next time.`);
          else result('Action unavailable', desired === 'parry' ? 'Finish your attack or stun and let your guard recover.' : 'Release between attempts. Wait for a hitstun collision and let the tech lockout end.');
        }
        if (desired === 'parry') {
          const move = options.definition.config.moves.find(move => move.id === target.moveId);
          if (move) { timingActions.push('guard');timing = { label: 'Opponent’s attack', value: target.moveFrame, total: move.startupFrames + move.activeFrames, window: { start: Math.max(0, move.startupFrames - options.definition.config.parryFrames + 1), end: move.startupFrames }, cue: target.moveFrame < move.startupFrames - options.definition.config.parryFrames + 1 ? 'Wait • the swing is winding up' : target.moveFrame <= move.startupFrames ? 'Fresh press as the swing reaches you' : 'Swing active • release for the next attempt' }; }
        } else if (player.stunKind === 'hit') { timingActions.push('jump', 'tech');timing = { label: 'Recovery cue', value: 0, total: 1, cue: 'Tap just before floor or wall contact. The next attempt starts automatically.' }; }
        const impact = desired === 'parry' ? defense?.hitAt : defense?.bounceAt;
        if (!attempt && impact !== undefined && impact >= 0) result('No timed press recorded', `Release, then tap ${desired === 'parry' ? 'Guard as the swing reaches you' : 'Jump just before surface contact'}.`);
      }
      const lesson = combat.practice.lesson;
      const justDropped = kind === 'combo-lesson' && !!lesson?.retry && !dropped;dropped = !!lesson?.retry;
      if (kind === 'combo-lesson') {
        completed.push(...['launch', 'chase', 'follow'].slice(0, lesson?.stage ?? 0));
        recovered = (lesson?.stage ?? 0) > lastStage && !lesson?.retry;lastStage = lesson?.stage ?? 0;
        const held = combat.interactions?.weapons.some(item => item.owner === id);
        if (held) result('Your tool replaces the unarmed attacks', 'Throw or put down the held tool before trying the launcher.');
        if (lastMove && player.attackSerial !== lastSerial && !contact || lastMove && !player.moveId && !contact) { failed = true;result('Your attack missed', 'A fresh attempt starts automatically. Move closer and face the opponent before striking.'); }
        if (lastSerial !== player.attackSerial || lastMove !== player.moveId) { lastSerial = player.attackSerial;lastMove = player.moveId;contact = false; }
        contact ||= player.hitConfirmed || player.hitTargets.length > 0;
        const pending = inspectCombatInput({ config: options.definition.config, fighter: player, frame });
        if (pending?.reason === 'buffer-expired') result('Pressed before the move could act', 'Wait for recovery or the highlighted follow-up window, release, then press again.');
        if (pending?.reason === 'insufficient-stamina') result('Not enough stamina', 'Let stamina refill before starting this sequence.');
        if (pending?.reason === 'command-unmatched') result('No move matched that input', 'Use the displayed direction and a fresh attack press.');
        if (justDropped) { failed = true;result(player.stunFrames ? 'Your attempt was interrupted' : 'The opponent recovered before your follow-up', 'A fresh attempt starts automatically. Chase as recovery ends, then strike before they recover.'); }
        if (recovered) {
          failed = false;
          result(lastStage === 1 ? 'Launcher connected' : lastStage === 2 ? 'Chase connected' : 'Follow-up connected', lastStage === 1 ? 'Let recovery finish, then chase and strike before the opponent recovers.' : lesson?.branch === 'upward' ? 'Release direction and jump if grounded, then aim a strike while both fighters are airborne.' : lesson?.branch === 'cashout' ? 'Link a second Strike, then aim Heavy toward the surface.' : 'Follow the sideways drift and aim your next strike.');
        }
        const move = options.definition.config.moves.find(move => move.id === player.moveId);
        const follow = lastStage >= 2, jump = follow && lesson?.branch === 'upward' && !player.wasAirborne;
        const aim = lesson?.branch === 'side' ? options.definition.config.directionMode === 'forward-back' ? 'Aim toward the opponent' : 'Aim sideways' : lesson?.branch === 'cashout' ? 'Aim toward the surface' : 'Aim at the airborne opponent';
        if (move) {
          const total = move.startupFrames + move.activeFrames + (player.hitConfirmed ? move.hitRecoveryFrames ?? move.recoveryFrames : move.recoveryFrames);
          const action = follow && lesson?.branch === 'cashout' && move.stringOnly ? 'heavy' : 'jab';
          const direction = lesson?.branch === 'side' ? options.definition.config.directionMode === 'forward-back' ? 'toward' : 'side' : action === 'heavy' ? 'toward' : move.direction;
          const cancel = follow && !jump ? move.cancels.find(window => {
            const next = options.definition.config.moves.find(next => next.id === window.moveId);
            return (!window.hitOnly || player.hitConfirmed) && next && !next.weaponAttack && !next.drive && next.command.at(-1) === action && (next.airborne === undefined || next.airborne === player.wasAirborne) && next.direction === direction;
          }) : undefined;
          if (cancel) timingActions.push(...(options.definition.config.moves.find(next => next.id === cancel.moveId)?.command ?? []));
          if (jump) timingActions.push('jump');
          const remaining = Math.max(0, total - player.moveFrame);
          const followCue = cancel && (player.moveFrame < cancel.fromFrame ? `Follow-up opens in ${cancel.fromFrame - player.moveFrame} frame${cancel.fromFrame - player.moveFrame === 1 ? '' : 's'}`
            : player.moveFrame <= cancel.toFrame ? `${aim} + ${action === 'heavy' ? 'Heavy' : 'Strike'} • follow-up window open` : 'Follow-up window closed');
          timing = { label: 'Your attack timing', value: player.moveFrame, total, ...(cancel ? { window: { start: cancel.fromFrame, end: cancel.toFrame } } : {}), cue: jump ? `${remaining} frames until recovery ends • release direction, then Jump` : followCue || `${remaining} frames until recovery ends` };
        } else if (lastStage > 0) {
          timingActions.push(...(jump ? ['jump'] : follow ? [lesson?.branch === 'cashout' ? 'heavy' : 'jab'] : ['dash', 'jab']));
          timing = { label: 'Time before the opponent recovers', value: target.stunFrames, total: Math.max(1, target.stunFrames, 90), cue: jump ? 'Release direction + Jump now, then aim a strike while airborne' : follow ? `${aim} and connect before this runs out` : 'Act now • chase and connect before this runs out' };
        }
      }
      return { completed, timing, timingActions, feedback, dropped: justDropped, failed, recovered };
    },
  };
}
