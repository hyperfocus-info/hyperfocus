import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { COMBAT_EVENT_KINDS } from '../../../../combat/observation-readers.ts';
import type { createCombatAiExchanges } from './recorder.ts';

type Report = ReturnType<ReturnType<typeof createCombatAiExchanges>['report']>;

function readChain(value: unknown): Report['open'][number] {
  const row = requireRecord(value);
  return { ...row, attacker: requireText(row.attacker), target: requireText(row.target), startFrame: requireNumber(row.startFrame), endFrame: requireNumber(row.endFrame),
    initialTargetHealth: row.initialTargetHealth === null ? null : requireNumber(row.initialTargetHealth), damage: requireNumber(row.damage), hits: requireNumber(row.hits),
    droppedContacts: requireNumber(row.droppedContacts), committedStun: requireBoolean(row.committedStun),
    contacts: requireArray(row.contacts).map(value => { const item = requireRecord(value);return { ...item, eventId: requireText(item.eventId), moveId: requireText(item.moveId), frame: requireNumber(item.frame), damage: requireNumber(item.damage) }; }) };
}

export function readCombatAiExchanges(value: unknown): Report {
  const row = requireRecord(value), coverage = requireRecord(row.coverage);
  return structuredClone({ ...row,
    actors: requireArray(row.actors).map(value => { const item = requireRecord(value);return { ...item, fighter: requireText(item.fighter), damageDealt: requireNumber(item.damageDealt), damageTaken: requireNumber(item.damageTaken), attackStarts: requireNumber(item.attackStarts), chainsStarted: requireNumber(item.chainsStarted), chainsCompleted: requireNumber(item.chainsCompleted), chainsBroken: requireNumber(item.chainsBroken), chainsEscaped: requireNumber(item.chainsEscaped), chainsCensored: requireNumber(item.chainsCensored) }; }),
    open: requireArray(row.open).map(readChain),
    samples: requireArray(row.samples).map(value => {
      const item = requireRecord(value), result: Report['samples'][number] = { ...readChain(item), end: requireOneOf(item.end, ['knockout', 'recovered', 'tech', 'escape', 'counterhit', 'trade', 'interrupted', 'censored']) };
      if (item.cause !== undefined) result.cause = requireText(item.cause);
      if (item.endingEvent !== undefined) { const event = requireRecord(item.endingEvent);result.endingEvent = { ...event, eventId: requireText(event.eventId), frame: requireNumber(event.frame), moveId: requireText(event.moveId), kind: requireOneOf(event.kind, COMBAT_EVENT_KINDS) }; }
      return result;
    }),
    coverage: { ...coverage, attackStartScope: requireText(coverage.attackStartScope), droppedActors: requireNumber(coverage.droppedActors), droppedSamples: requireNumber(coverage.droppedSamples), droppedContacts: requireNumber(coverage.droppedContacts), droppedEvents: requireNumber(coverage.droppedEvents), duplicateEvents: requireNumber(coverage.duplicateEvents), staleEvents: requireNumber(coverage.staleEvents), unknownHealthContacts: requireNumber(coverage.unknownHealthContacts) },
  });
}
