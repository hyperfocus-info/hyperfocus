import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireBoolean, requireNumber } from '@hyperfocus/utilities/validation';
import type { GameplayProject3D } from '../gameplay.ts';

/** The gameplay host's narrow project contract, independent of EditorProject.
 * Retains every present field in a detached value; no authored defaults are applied. */
export function readGameplayProject3D(value: unknown): GameplayProject3D {
  const row = requireRecord(value);
  const result: GameplayProject3D = { ...row, activeSceneId: requireText(row.activeSceneId),
    scenes: requireArray(row.scenes).map(value => {
      const scene = requireRecord(value);
      return { ...scene, id: requireText(scene.id), entities: requireArray(scene.entities).map(value => {
        const entity = requireRecord(value);
        return { ...entity, components: requireArray(entity.components).map(value => {
          const component = requireRecord(value);
          return { ...component, id: requireText(component.id), type: requireText(component.type), enabled: requireBoolean(component.enabled),
            values: Object.fromEntries(Object.entries(requireRecord(component.values)).map(([key, value]) => [key, typeof value === 'string' || typeof value === 'boolean' ? value : requireNumber(value)])) };
        }) };
      }) };
    }) };
  if (row.assets !== undefined) result.assets = requireArray(row.assets).map(value => {
    const asset = requireRecord(value);
    return { ...asset, id: requireText(asset.id), ...(asset.mimeType === undefined ? {} : { mimeType: requireText(asset.mimeType) }) };
  });
  if (row.extensions !== undefined) result.extensions = requireRecord(row.extensions);
  return structuredClone(result);
}
