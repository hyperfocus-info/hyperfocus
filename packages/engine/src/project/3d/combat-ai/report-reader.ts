import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { readCombatEvent, readCombatInput, readCombatVector } from '../../../combat/observation-readers.ts';
import { readCombatAiInsights } from './insights-reader.ts';
import { readCombatAiExchanges } from './exchanges/reader.ts';
import type { createCombatAiOutcomes, CombatAiReportContext } from './outcomes.ts';

export type CombatAiOutcomeReport3D = ReturnType<ReturnType<typeof createCombatAiOutcomes>['report']>;

function readContext(value: unknown): CombatAiReportContext {
  const row = requireRecord(value);
  return { ...row, mode: requireOneOf(row.mode, ['human-vs-ai', 'theater', 'practice', 'online']), match: requireNumber(row.match), round: requireNumber(row.round),
    fighters: requireArray(row.fighters).map(value => {
      const item = requireRecord(value), result: CombatAiReportContext['fighters'][number] = { ...item, id: requireText(item.id), type: requireOneOf(item.type, ['human', 'ai']) };
      if (item.level !== undefined) result.level = requireNumber(item.level);
      if (item.policyId !== undefined) result.policyId = requireText(item.policyId);
      if (item.traits !== undefined) result.traits = Object.fromEntries(Object.entries(requireRecord(item.traits)).map(([key, value]) => [key, requireNumber(value)]));
      return result;
    }) };
}

function readSegment(value: unknown): Omit<CombatAiOutcomeReport3D['segments'][number], 'cause'> {
  const row = requireRecord(value);
  const result: Omit<CombatAiOutcomeReport3D['segments'][number], 'cause'> = { ...row,
    insights: readCombatAiInsights(row.insights), exchanges: readCombatAiExchanges(row.exchanges), source: requireOneOf(row.source, ['live', 'restored']),
    observedTicks: requireNumber(row.observedTicks), levels: requireArray(row.levels).map(value => requireNumber(value)),
    counts: Object.fromEntries(Object.entries(requireRecord(row.counts)).map(([key, value]) => [key, requireNumber(value)])),
    droppedChoices: requireNumber(row.droppedChoices), droppedOutcomes: requireNumber(row.droppedOutcomes) };
  if (row.context !== undefined) result.context = readContext(row.context);
  return result;
}

/** Complete recorder contract. Returns a detached copy, retains present extension
 * fields and optional absence, and never supplies defaults or changes evidence. */
export function readCombatAiOutcomeReport3D(value: unknown): CombatAiOutcomeReport3D {
  const row = requireRecord(value);
  return structuredClone({ ...row, ...readSegment(row), version: requireOneOf(row.version, [1]), scope: requireText(row.scope), interpretation: requireText(row.interpretation),
    droppedSegments: requireNumber(row.droppedSegments),
    segments: requireArray(row.segments).map(value => { const item = requireRecord(value);return { ...item, ...readSegment(item), cause: requireText(item.cause) }; }),
    choices: requireArray(row.choices).map(value => {
      const item = requireRecord(value), action = requireRecord(item.action);
      return { ...item, frame: requireNumber(item.frame), level: requireNumber(item.level), fighter: requireText(item.fighter), target: requireText(item.target),
        distance: requireNumber(item.distance), height: requireNumber(item.height), stamina: requireNumber(item.stamina), health: requireNumber(item.health),
        selfMove: requireText(item.selfMove), selfMoveFrame: requireNumber(item.selfMoveFrame), selfStun: requireNumber(item.selfStun),
        targetMove: requireText(item.targetMove), targetMoveFrame: requireNumber(item.targetMoveFrame), targetStun: requireNumber(item.targetStun), weaponLightMove: requireText(item.weaponLightMove),
        action: { ...action, input: readCombatInput(action.input), direction: readCombatVector(action.direction), jump: requireBoolean(action.jump), dash: requireBoolean(action.dash), sprint: requireBoolean(action.sprint) } };
    }),
    outcomes: requireArray(row.outcomes).map(value => { const item = requireRecord(value);return { ...item, frame: requireNumber(item.frame), level: requireNumber(item.level), fighter: requireText(item.fighter), event: readCombatEvent(item.event) }; }),
  });
}
