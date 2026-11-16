import { createFrameRecordSelection } from '../../../../frame/record-selection.ts';
import { createFrameRecordLookup, type FrameRecordLookupStrategy } from '../../../../frame/record-lookup.ts';
import { presentCombatVisuals3D } from '../../combat-visuals.ts';

/** Bind the fixed authored scene once. Accessories borrow this frame's records;
 * camera, materials and render graph stay shared with the complete frame.
 * Keep authored order, including nested accessories used by travel lean.
 */
export function createCombatVisualPresenter3D(options: { entities: readonly { id: string }[]; fighterIds: readonly string[]; lookupStrategy?: FrameRecordLookupStrategy; lookupDiagnostics?: boolean }) {
  const ids = options.entities.filter(entity =>
    entity.id === 'tod:arena' || entity.id === 'tod:city:street'
    || options.fighterIds.some(id => entity.id === id || entity.id.startsWith(`${id}:`))).map(entity => entity.id);
  const select = createFrameRecordSelection({ ids });
  const lookup = options.lookupStrategy === undefined ? undefined : createFrameRecordLookup({ ids, strategy: options.lookupStrategy, diagnostics: options.lookupDiagnostics });
  return Object.assign((input: Parameters<typeof presentCombatVisuals3D>[0]) => {
    lookup?.resetWork();
    presentCombatVisuals3D({ ...input, entityLookup: input.entityLookup ?? lookup, frame: { ...input.frame, entities: select(input.frame.entities) } });
  }, { readLookupWork: () => lookup?.work });
}
