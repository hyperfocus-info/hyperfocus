import type { CombatProject3D, createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { createTutorialEvidence } from './evidence';

type Game = ReturnType<typeof createGameplay3D>;
/** Reversible practice demonstration. All hits come from normal inputs and physics. */
export function createTutorialDemonstration(options: { game: Game; definition: CombatProject3D; clear(): void }) {
  const { game, definition } = options, player = definition.fighters.find(fighter => fighter.control === 'player')!;
  let saved: ReturnType<Game['checkpoint']> | undefined, start: ReturnType<Game['checkpoint']> | undefined;
  let kind = '', ticks = 0, launched = false, chaseFrame = -1, linkedSerial = -1, priorFrame = -1, paused = false, done = false, successful = false, collisionFrame = -1;
  let lastInput: { actions: string[]; direction: 'neutral' | 'toward' | 'away' | 'sideways'; frame: number } | undefined;
  let evidence = createTutorialEvidence();
  function rewind() { start?.restore();ticks = 0;launched = false;chaseFrame = linkedSerial = priorFrame = -1;done = successful = paused = false;lastInput = undefined;evidence = createTutorialEvidence();options.clear(); }
  return {
    get state() { return { active: !!saved, paused, done, successful, ticks, kind, lastInput }; },
    open(next: string) {
      if (saved || !['combo-lesson', 'parry-drill', 'tech-drill', 'di-drill', 'movement', 'first-hit', 'guard', 'arena-lesson'].includes(next)) return;
      saved = game.checkpoint();kind = next;
      game.step(['practice:reset']);game.step([]);
      const snapshot = game.snapshot();
      // A repeatable example uses a declared defense seed; the player's exact
      // checkpoint (including lesson, arena and RNG) is restored on return.
      if (snapshot.combat?.practice.random) { snapshot.combat.practice.random.seed = 7;game.restore(snapshot); }
      start = game.checkpoint();collisionFrame = -1;
      if (kind === 'tech-drill') for (let step = 0; step < 240; step++) {
        game.step([]);const contact = game.snapshot().combat?.defenseFeedback.find(row => row.id === player.entityId)?.bounceAt ?? -1;
        if (contact >= 0) { collisionFrame = contact;break; }
      }
      rewind();
    },
    toggle() { if (saved) { paused = !paused;options.clear(); } },
    replay() { if (saved) rewind(); },
    step() {
      if (!saved || paused || done) return;
      const snapshot = game.snapshot(), combat = snapshot.combat;if (!combat) return;
      const self = combat.state.fighters.find(fighter => fighter.id === player.entityId)!, other = combat.state.fighters.find(fighter => fighter.id !== player.entityId)!;
      const frame = combat.state.frame, fresh = frame !== priorFrame;priorFrame = frame;
      const dx = other.position.x - self.position.x, dz = other.position.z - self.position.z, distance = Math.hypot(dx, dz) || 1;
      const toward = { x: dx / distance, y: 0, z: dz / distance }, neutral = { x: 0, y: 0, z: 0 };
      let direction = neutral;const actions: string[] = [];
      const press = (name: string) => { if (fresh) actions.push(player.actionPrefix + name); };
      if (kind === 'arena-lesson') {
        const completed = evidence.observe({ snapshot, definition, kind }).completed;
        const held = combat.interactions?.weapons.find(item => item.owner === self.id);
        if (held) {
          if (!completed.includes('use') && !self.moveId && ticks % 2 === 0) press('jab');
          else if (completed.includes('use') && !self.moveId) press('interact');
        } else if (!completed.includes('throw')) {
          const tool = combat.interactions?.weapons.filter(item => !item.owner && !item.projectileOwner && item.active !== false && item.durability > 0 && Math.abs(item.position.y - self.position.y) < 2.5)
            .sort((a, b) => Math.hypot(a.position.x - self.position.x, a.position.z - self.position.z) - Math.hypot(b.position.x - self.position.x, b.position.z - self.position.z))[0];
          if (tool) {
            const dx = tool.position.x - self.position.x, dz = tool.position.z - self.position.z, reach = Math.hypot(dx, dz);
            direction = reach > .001 ? { x: dx / reach, y: 0, z: dz / reach } : neutral;
            if (reach < 1.2 && ticks % 20 === 0) press('interact');
            if (reach < .5) direction = neutral;
          }
        }
      }
      if (kind === 'movement') {
        direction = { x: -toward.x, y: 0, z: -toward.z };
        if (ticks >= 50 && ticks < 70) actions.push(player.actionPrefix + 'jump');
      }
      if (kind === 'first-hit') {
        if (distance > definition.config.hurtRadius * 2 + .15) direction = toward;
        else if (!self.moveId && ticks % 2 === 0) press('jab');
      }
      if (kind === 'guard') actions.push(player.actionPrefix + 'guard');
      if (kind === 'combo-lesson') {
        const lesson = combat.practice.lesson, move = definition.config.moves.find(move => move.id === self.moveId);
        // A missed or defended launcher is another real attempt, never a grant of progress.
        if (launched && !self.moveId && !lesson?.stage && self.attackSerial > 0) { launched = false;chaseFrame = linkedSerial = -1; }
        if (!launched) {
          if (distance > definition.config.hurtRadius * 2 + .15) direction = toward;
          else if (!self.moveId && fresh) { press('heavy');launched = true; }
        } else {
          const heavy = definition.config.moves.find(move => move.id === 'heavy')!;
          const recover = heavy.startupFrames + heavy.activeFrames + (self.hitConfirmed ? heavy.hitRecoveryFrames ?? heavy.recoveryFrames : heavy.recoveryFrames);
          const chase = self.moveId !== 'heavy' || self.moveFrame >= recover;
          if (chase) {
            direction = toward;
            if (chaseFrame < 0 && fresh) { press('dash');chaseFrame = frame; }
            const follow = (lesson?.stage ?? 0) >= 2, upward = follow && lesson?.branch === 'upward';
            if (upward && !self.wasAirborne) {
              // A forward chase can already be airborne. If it was grounded,
              // buffer a neutral jump near recovery and wait for actual takeoff.
              direction = neutral;
              const recovery = move ? move.startupFrames + move.activeFrames + (self.hitConfirmed ? move.hitRecoveryFrames ?? move.recoveryFrames : move.recoveryFrames) - self.moveFrame : 0;
              if (recovery <= 5) actions.push(player.actionPrefix + 'jump');
            } else if (frame > chaseFrame) {
              if (upward && (combat.motion.find(row => row.id === self.id)?.jumpIntent ?? 0) > 0) actions.push(player.actionPrefix + 'jump');
              const attack = follow && lesson?.branch === 'cashout' && (!move || move.stringOnly) ? 'heavy' : 'jab';
              const aim = () => { if (follow && lesson?.branch === 'side' && definition.config.directionMode !== 'forward-back') direction = { x: -toward.z, y: 0, z: toward.x }; };
              if (!self.moveId && fresh) { aim();press(attack); }
              if (move && self.hitConfirmed && linkedSerial !== self.attackSerial) {
                const link = move.cancels.find(cancel => cancel.moveId.includes(attack) && self.moveFrame >= cancel.fromFrame && self.moveFrame <= cancel.toFrame);
                if (link && fresh) { aim();press(attack);linkedSerial = self.attackSerial; }
              }
            }
          }
        }
      }
      if (kind === 'parry-drill') {
        const move = definition.config.moves.find(move => move.id === other.moveId);
        if (move && other.moveFrame >= move.startupFrames - 1 && other.moveFrame < move.startupFrames + move.activeFrames) actions.push(player.actionPrefix + 'guard');
      }
      if (kind === 'di-drill' && combat.influence.some(row => row.id === self.id)) direction = { x: -toward.z, y: 0, z: toward.x };
      if (kind === 'tech-drill' && self.stunKind === 'hit') {
        // A dry run observes the actual collision, then playback uses an ordinary
        // press in its real window. Physics and combat permissions stay unchanged.
        if (frame === collisionFrame - 1) press('jump');
      }
      const along = direction.x * toward.x + direction.z * toward.z;
      if (actions.length) lastInput = { actions: [...actions], direction: Math.hypot(direction.x, direction.z) === 0 ? 'neutral' : Math.abs(along) < .5 ? 'sideways' : along < 0 ? 'away' : 'toward', frame };
      game.step(actions, undefined, direction);ticks++;
      const completed = evidence.observe({ snapshot: game.snapshot(), definition, kind }).completed;
      successful ||= kind === 'arena-lesson' ? ['pickup', 'use', 'throw'].every(step => completed.includes(step)) : completed.length === (kind === 'combo-lesson' ? 3 : kind === 'movement' ? 2 : 1);
      if (successful || ticks >= 600) { done = true;paused = true; }
    },
    close() { if (!saved) return;saved.restore();game.drainAudio();saved = undefined;start = undefined;paused = done = false;options.clear(); },
  };
}
