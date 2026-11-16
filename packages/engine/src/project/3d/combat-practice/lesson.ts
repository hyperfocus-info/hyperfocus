import { hypot } from '../../../math/simulation.ts';
import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatEvent, CombatInput, CombatSnapshot } from '../../../combat/state.ts';
import { isRecord } from '@hyperfocus/utilities/records';

export type CombatLesson = { stage: number; x: number; z: number; serial: number; move: string; retry: boolean; branch: 'upward' | 'side' | 'cashout'; learned: number };
export const combatLessonHints = [
  '1 / 3 · Launch. Get close and land Heavy without holding a direction. Let its recovery finish.',
  '2 / 3 · Chase. After your recovery, use Dash toward the airborne opponent, then land Strike. Watch their drift; Reset fighters retries.',
  '3 / 3 · Readjust. Read the opponent’s drift and connect an attack that fits the trajectory. Reset fighters retries.',
  'Complete · Launch, chase, readjust. Try Steer outward or Attempt tech next. Reset fighters repeats the lesson.',
];
export function initialCombatLesson(): CombatLesson { return { stage: 0, x: 0, z: 0, serial: -1, move: '', retry: false, branch: 'upward', learned: 0 }; }
export function validateCombatLesson(value: unknown): CombatLesson {
  if (value === undefined) return initialCombatLesson();
  if (!isRecord(value)) throw new Error('Invalid combat lesson.');
  const item = value;
  if (Object.keys(item).some(key => !['stage','x','z','serial','move','retry','branch','learned'].includes(key)) || !('stage' in item) || !Number.isInteger(item.stage) || Number(item.stage) < 0 || Number(item.stage) > 3 || !Number.isInteger(item.serial) || Number(item.serial) < -1 || !Number.isFinite(item.x) || !Number.isFinite(item.z) || typeof item.move !== 'string' || item.move.length > 128 || typeof item.retry !== 'boolean') throw new Error('Invalid combat lesson.');
  let branch: CombatLesson['branch'] = 'upward';
  if (item.branch !== undefined) {
    const coerced = String(item.branch), found = (['upward', 'side', 'cashout'] as const).find(branch => branch === coerced);
    if (found === undefined) throw new Error('Invalid combat lesson branch.');
    branch = found;
  }
  if (item.learned !== undefined && (!Number.isInteger(item.learned) || Number(item.learned) < 0 || Number(item.learned) > 7)) throw new Error('Invalid combat lesson branch.');
  return { branch, learned: Number(item.learned ?? 0), stage: Number(item.stage), x: Number(item.x), z: Number(item.z), serial: Number(item.serial), move: item.move, retry: item.retry };
}

/** Progress follows ordinary contacts and player movement; never grants a hit or recovery. */
export function observeCombatLesson(lesson: CombatLesson, before: CombatSnapshot, events: readonly CombatEvent[], inputs: readonly CombatInput[], playerId: string, grounded: ReadonlySet<string>, config: CombatConfig, nearSurface = false) {
  const player = before.fighters.find(fighter => fighter.id === playerId);
  const target = before.fighters.find(fighter => fighter.id !== playerId);
  if (!player || !target || lesson.stage === 3) return;
  if (lesson.stage > 0 && (target.stunKind !== 'hit' || target.health <= 0 || player.stunFrames > 0 || player.health <= 0)) { Object.assign(lesson, initialCombatLesson(), { retry: true, learned: lesson.learned }); }
  const hit = events.find(event => event.kind === 'hit' && event.attackerId === playerId && event.targetId === target.id);
  if (!hit || player.attackSerial === lesson.serial) return;
  if (lesson.stage === 0) {
    if (hit.impulse.y <= 2) return;
    lesson.stage = 1;lesson.x = player.position.x;lesson.z = player.position.z;lesson.serial = player.attackSerial;lesson.move = hit.moveId;lesson.retry = false;
  } else if (lesson.stage === 1) {
    if (target.stunKind !== 'hit' || grounded.has(target.id) || hypot(player.position.x - lesson.x, player.position.z - lesson.z) < .5) return;
    const lateral = Math.abs(hit.impulse.x * player.facing.z - hit.impulse.z * player.facing.x);
    const drift = Math.abs((target.position.x - lesson.x) * player.facing.z - (target.position.z - lesson.z) * player.facing.x) / (hypot(player.facing.x, player.facing.z) || 1);
    lesson.branch = nearSurface ? 'cashout' : lateral > hypot(hit.impulse.x, hit.impulse.z) * .2 || drift > .2 ? 'side' : 'upward';
    lesson.stage = 2;lesson.x = target.position.x;lesson.z = target.position.z;lesson.serial = player.attackSerial;lesson.move = hit.moveId;
  } else {
    const direction = inputs.find(input => input.fighterId === playerId)?.direction;
    const move = config.moves.find(move => move.id === hit.moveId);
    const aimed = !!direction && hypot(direction.x, direction.z) >= .1 || !!move?.direction && move.direction !== 'neutral';
    const response = lesson.branch === 'cashout' ? !!move && move.damage >= 18 && hit.damage > 0 : lesson.branch === 'side' ? config.directionMode === 'forward-back' ? aimed : move?.direction === 'side' || Math.abs(move?.impulseAngle ?? 0) > .4 : !grounded.has(playerId) && !grounded.has(target.id);
    if (target.stunKind !== 'hit' || !response || lesson.branch === 'side' && !aimed || hypot(target.position.x - lesson.x, target.position.z - lesson.z) < .25) return;
    lesson.learned |= lesson.branch === 'upward' ? 1 : lesson.branch === 'side' ? 2 : 4;
    lesson.stage = 3;lesson.serial = player.attackSerial;
  }
}


export function combatLessonHint(lesson: CombatLesson) {
  if (lesson.retry) return 'Combo dropped or defended. Reset fighters for a new defense, then launch again.';
  const learned = [1,2,4].filter(bit => lesson.learned & bit).length;
  if (lesson.stage === 3) return `Response learned: ${lesson.branch}. ${learned} / 3 routes practiced. Reset fighters for a new defense.`;
  if (lesson.stage !== 2) return combatLessonHints[lesson.stage]!;
  return lesson.branch === 'cashout' ? "3 / 3 - Surface close: after a first Strike, link a second Strike during recovery, then toward + Heavy during the second Strike's recovery. Read drift; a tech can end the conversion." : lesson.branch === 'side' ? '3 / 3 - Sideways drift: follow the body with movement, then aim an attack to reconnect before recovery.' : '3 / 3 - Open air: release direction, then press Jump to jump upward. Then aim an attack while both fighters are airborne.';
}
