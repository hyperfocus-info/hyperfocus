import { hypot } from '../../../math/simulation.ts';
import { combatMoveDuration } from '../../../combat/combo/timing.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { CombatProject3D } from '../combat-declaration.ts';
import type { CombatAudioCue3D } from '../combat-audio-config.ts';
import type { CombatAudioEmitter } from './emitter.ts';
import { movementSurface } from './surface.ts';

export type AudioMotion = { id: string; dash: number; wallRunning?: boolean; wallSliding?: boolean; dashCueKind?: number; dashCue?: number };
export type AudioStep = { before: CombatSnapshot; after: CombatSnapshot; grounded: ReadonlySet<string>; motion: readonly AudioMotion[]; events?: readonly CombatEvent[] };

export function createCombatMovementAudio(options: { definition: CombatProject3D; runtime: Hyperfocus3DRuntime; emitter: CombatAudioEmitter; activeHazards: () => readonly string[] }) {
  const { definition, runtime, emitter } = options;
  const memories = new Map<string, { x: number; z: number; grounded: boolean; vy: number; distance: number; dash: number; motionCue: number; motionKind: number; sliding: boolean; alternate: boolean }>();
  const capture = () => [...memories].map(([id, memory]) => ({ id, ...memory }));
  return { capture,
    restore(saved: ReturnType<typeof capture>) { memories.clear();for (const { id, ...memory } of saved) memories.set(id, memory); },
    reset() { memories.clear(); },
    step(input: AudioStep) {
      for (const fighter of input.after.fighters) {
        const body = runtime.physics.body(fighter.id), previous = input.before.fighters.find(item => item.id === fighter.id);
        if (!body || !previous) continue;
        const motion = input.motion.find(item => item.id === fighter.id), grounded = input.grounded.has(fighter.id), dash = motion?.dash ?? 0;
        const motionCue = motion?.dashCue ?? 0, motionKind = motion?.dashCueKind ?? 0;
        let memory = memories.get(fighter.id);
        if (!memory) { memory = { x: body.x, z: body.z, grounded, vy: 0, distance: 0, dash: 0, motionCue: 0, motionKind: 0, sliding: false, alternate: false };memories.set(fighter.id, memory); }
        const speed = hypot(body.velocityX, body.velocityZ), walkSpeed = definition.movement?.speed ?? 4;
        const move = definition.config.moves.find(move => move.id === fighter.moveId);
        const attacking = move && fighter.moveFrame < combatMoveDuration(move, fighter);
        const heavy = (move?.damage ?? 0) >= 18 || move?.weaponAttack === 'heavy';
        if (fighter.attackSerial !== previous.attackSerial) emitter.voice(heavy ? 'attackHeavy' : 'attack', fighter.id, input.after.frame);
        if (fighter.strikeIndex >= 0 && (fighter.attackSerial !== previous.attackSerial || fighter.strikeIndex > previous.strikeIndex)) emitter.cue(heavy ? 'swingHeavy' : 'swing', fighter.id, fighter.strikeIndex > 0 ? .65 : 1);
        if (dash > memory.dash) { emitter.cue('dash', fighter.id);emitter.voice('effort', fighter.id, input.after.frame); }
        if (motionCue > 0 && (motionCue > memory.motionCue || motionKind !== memory.motionKind)) {
          if (motionKind === 4 || motionKind === 5) { emitter.fallback(motionKind === 4 ? 'airJump' : 'wallJump', 'jump', fighter.id);emitter.voice('effort', fighter.id, input.after.frame); }
          if (motionKind === 2 || motionKind === 3) emitter.cue(motionKind === 2 ? 'airDashUnavailable' : 'airDashReady', fighter.id, .5);
        }
        if (grounded && body.velocityY > 2 && memory.vy <= .5 && !fighter.stunFrames) { emitter.cue('jump', fighter.id, .65);emitter.voice('effort', fighter.id, input.after.frame); }
        const surface = movementSurface(runtime, definition, fighter.id, options.activeHazards());
        const floorImpact = input.events?.some(event => event.targetId === fighter.id && (event.kind === 'bounce' || event.kind === 'tech') && (event.contactNormal?.y ?? 0) > .5);
        if (grounded && !memory.grounded && memory.vy < -1 && !floorImpact) {
          const legacy = memory.vy < -8 ? 'landHeavy' : 'land';
          const key = surface === 'wood' ? 'landWood' : surface === 'metal' ? 'landMetal' : surface === 'wet' ? 'landWet' : legacy;
          emitter.fallback(key, legacy, fighter.id, Math.min(1, .35 + Math.abs(memory.vy) / 18));
        }
        if (motion?.wallSliding && !memory.sliding) emitter.cue('wallSlide', fighter.id, .5);
        if ((grounded || motion?.wallRunning) && speed > .5 && !fighter.stunFrames && fighter.health > 0 && !attacking && !dash) {
          memory.distance += Math.min(1, hypot(body.x - memory.x, body.z - memory.z));
          if (memory.distance >= 1.35) {
            memory.distance %= 1.35;
            const running = speed > walkSpeed * 1.15, base = running ? 'sprint' : 'step', alternate = running ? 'sprintAlternate' : 'stepAlternate';
            const legacy = memory.alternate && emitter.has(alternate) ? alternate : base;
            const key: CombatAudioCue3D = motion?.wallRunning ? 'wallStep' : surface === 'wood' ? running ? 'sprintWood' : 'stepWood' : surface === 'metal' ? running ? 'sprintMetal' : 'stepMetal' : surface === 'wet' ? running ? 'sprintWet' : 'stepWet' : legacy;
            emitter.fallback(key, legacy, fighter.id, Math.min(1, .3 + speed / 18));memory.alternate = !memory.alternate;
          }
        } else memory.distance = 0;
        if (previous.health > 0 && fighter.health <= 0) { emitter.cue('ko', fighter.id);emitter.voice('ko', fighter.id, input.after.frame); }
        memory.x = body.x;memory.z = body.z;memory.vy = body.velocityY;memory.grounded = grounded;memory.dash = dash;memory.motionCue = motionCue;memory.motionKind = motionKind;memory.sliding = motion?.wallSliding ?? false;
      }
    },
  };
}
