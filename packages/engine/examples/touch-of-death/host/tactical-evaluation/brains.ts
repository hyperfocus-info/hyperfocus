// These two specifiers are resolved only by the evaluation build plugin.
import { createCombatAi3D as current } from 'current-tactical-controller';
import { createCombatAi3D as frozen } from 'frozen-tactical-baseline';
import { createCombatAi3D as previous } from 'previous-tactical-controller';

let setup: any;
let seat = 1;
export function configureBrains(options: any) { setup = options;seat = 1;setup.controllers = [];return setup.controllers; }

export function createCombatAi3D(options: any) {
  const index = seat;seat = 0;
  const spec = setup.seats[index], metrics = setup.metrics[index];
  const profile = (stage: string, milliseconds: number) => {
    const row = metrics.stages[stage] ??= { calls: 0, milliseconds: 0 };row.calls++;row.milliseconds += milliseconds;
  };
  const brain = (spec.kind === 'baseline' ? frozen : spec.kind === 'previous' ? previous : current)({ ...options, tuning: spec.tuning, profile });
  setup.controllers[index] = brain;
  if (spec.learning) {
    if (!brain.restoreLearning) throw Error('The frozen original controller cannot restore contextual learning.');
    brain.restoreLearning({ value: spec.learning });
  }
  let last: any;
  let frame = 0;
  return { ...brain,
    learning() { return brain.learning?.(); },
    step(observation: any) {
      last = observation;frame++;
      const start = performance.now();
      let result = brain.step(observation);
      if (spec.script) result = scripted(spec.script, observation, result, frame, options.config);
      metrics.brainMilliseconds += performance.now() - start;metrics.observations++;
      const key = result.input.pressed?.join('+') || (result.input.guard ? 'guard' : result.jump ? 'jump' : result.dash ? 'dash' : result.sprint ? 'sprint' : 'move');
      metrics.actions[key] = (metrics.actions[key] ?? 0) + 1;
      return result;
    },
    observe(observation: any) {
      const start = performance.now();brain.observe(observation);metrics.observeMilliseconds += performance.now() - start;
      for (const event of observation.events) {
        if (event.damage <= 0) continue;
        if (event.attackerId === observation.fighterId) {
          metrics.damageDealt += event.damage;metrics.hits++;
          const target = last?.state.fighters.find((fighter: any) => fighter.id === event.targetId);
          const move = options.config.moves.find((move: any) => move.id === target?.moveId);
          if (move && target.moveFrame >= move.startupFrames + move.activeFrames) metrics.punishes++;
          metrics.hitsByMove[event.moveId] = (metrics.hitsByMove[event.moveId] ?? 0) + 1;
        }
        if (event.targetId === observation.fighterId) metrics.damageTaken += event.damage;
      }
    },
  };
}

function scripted(style: string, o: any, safe: any, frame: number, config: any) {
  const self = o.state.fighters.find((fighter: any) => fighter.id === o.fighterId);
  if (!self || self.stunFrames || self.moveId || self.health <= 0) return safe;
  const dx = o.targetBody.x - o.body.x, dz = o.targetBody.z - o.body.z, distance = Math.hypot(dx, dz);
  const toward = { x: dx / Math.max(distance, .00001), y: 0, z: dz / Math.max(distance, .00001) };
  if (style === 'switch') style = (setup.sessionTick ?? o.state.frame) < (setup.switchAt ?? 27000) ? 'rush' : 'guard';
  const pressed: string[] = [];
  const result = { input: { fighterId: o.fighterId, pressed, guard: false, airborne: !o.grounded, direction: toward }, direction: toward, dash: false, jump: false, sprint: distance > 3 && o.grounded };
  if (style === 'guard') { result.input.guard = distance < 3;result.direction = distance < 1.5 ? { x: -toward.x, y: 0, z: -toward.z } : toward; }
  if (style === 'keepaway') { result.direction = distance < 4 ? { x: -toward.x, y: 0, z: -toward.z } : toward;result.sprint = false; }
  const id = style === 'rush' ? 'flurry' : style === 'guard' ? 'jab' : 'heavy';
  const move = config.moves.find((move: any) => move.id === id);
  if (move && self.stamina >= (move.staminaCost ?? 0) && distance < move.reach + move.hitRadius + config.hurtRadius && frame % (style === 'guard' ? 90 : 30) === 0) {
    result.input.pressed = [...move.command];result.input.guard = false;
  }
  return result;
}
