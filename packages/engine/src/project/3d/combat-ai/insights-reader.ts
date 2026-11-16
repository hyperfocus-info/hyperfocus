import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber } from '@hyperfocus/utilities/validation';
import type { createCombatAiInsights } from './insights.ts';

export function readCombatAiInsights(value: unknown): ReturnType<ReturnType<typeof createCombatAiInsights>['report']> {
  const row = requireRecord(value);
  return structuredClone({ ...row, droppedMoves: requireNumber(row.droppedMoves), droppedDroughts: requireNumber(row.droppedDroughts),
    worked: requireArray(row.worked).map(value => { const item = requireRecord(value);return { ...item, moveId: requireText(item.moveId), hits: requireNumber(item.hits), damage: requireNumber(item.damage) }; }),
    struggled: requireArray(row.struggled).map(value => { const item = requireRecord(value);return { ...item, moveId: requireText(item.moveId), whiffs: requireNumber(item.whiffs), blocked: requireNumber(item.blocked), parried: requireNumber(item.parried) }; }),
    attackDroughts: requireArray(row.attackDroughts).map(value => { const item = requireRecord(value);return { ...item, fighter: requireText(item.fighter), startFrame: requireNumber(item.startFrame), endFrame: requireNumber(item.endFrame), frames: requireNumber(item.frames), open: requireBoolean(item.open), reasons: Object.fromEntries(Object.entries(requireRecord(item.reasons)).map(([key, value]) => [key, requireNumber(value)])) }; }),
  });
}
