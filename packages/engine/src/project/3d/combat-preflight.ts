import { validateArenaLayoutReferences } from './combat-match/arena-layouts.ts';
import { validateEnvironmentReferences } from './combat-environment/references.ts';
import { readCombatProject3D } from './combat-declaration.ts';
import { combatAudioAssetIds3D } from './combat-audio-config.ts';
import { record, type Hyperfocus3DDeclaration, type Hyperfocus3DDiagnostic } from './declaration.ts';

/** Build and runtime share fail-closed validation before any asset cooking. */
export function auditCombatProject3D(options: { project: unknown; declaration: Hyperfocus3DDeclaration | undefined; diagnostics: Hyperfocus3DDiagnostic[] }) {
  const pointer = '/extensions/hyperfocusCombat';
  try {
    const combat = readCombatProject3D(record(record(options.project)?.extensions)?.hyperfocusCombat);
    if (!combat || !options.declaration) return;
    if (combat.environment) validateEnvironmentReferences({ definition: combat.environment, declaration: options.declaration, fighterIds: combat.fighters.map(fighter => fighter.entityId), config: combat.config });
    validateArenaLayoutReferences({ definition: combat, declaration: options.declaration });
    const assets = record(options.project)?.assets;
    const audioIds = new Set(Array.isArray(assets) ? assets.filter(asset => typeof record(asset)?.mimeType === 'string' && String(record(asset)?.mimeType).startsWith('audio/')).map(asset => record(asset)?.id) : []);
    for (const id of combatAudioAssetIds3D(combat.audio)) if (!audioIds.has(id)) options.diagnostics.push({ severity: 'error', code: 'combat-audio', pointer: `${pointer}/audio`, message: `Combat audio ${id} needs an existing audio asset. Select or import audio in Combat > Audio.` });
    const scene = options.declaration.scenes.find(item => item.id === options.declaration?.activeSceneId);
    for (const [index, weapon] of (combat.interactions?.weapons ?? []).entries()) {
      if (!scene?.entities.some(entity => entity.id === weapon.entityId) || combat.fighters.some(fighter => fighter.entityId === weapon.entityId)) options.diagnostics.push({ severity: 'error', code: 'combat-weapon', pointer: `${pointer}/interactions/weapons/${index}/entityId`, message: `Weapon ${weapon.entityId} needs a non-fighter object in the active 3D scene.` });
    }
    for (const [index, fighter] of combat.fighters.entries()) {
      const entity = scene?.entities.find(item => item.id === fighter.entityId);
      if (!entity || entity.physics?.type !== 'dynamic') options.diagnostics.push({ severity: 'error', code: 'combat-fighter', pointer: `${pointer}/fighters/${index}/entityId`, message: `Fighter ${fighter.entityId} needs a dynamic body in the active 3D scene.` });
    }
  } catch (error) {
    options.diagnostics.push({ severity: 'error', code: 'combat-invalid', pointer, message: error instanceof Error ? error.message : String(error) });
  }
}
