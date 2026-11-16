import { migrateProject, readStandaloneStreamedAudio, stableProjectJson, type StandaloneStreamedAudio } from '@hyperfocus/engine/project';

/** Bump when simulation, set lifecycle or wire semantics become incompatible. */
export const combatContentPrefix = 'combat-v39:';

/** Only contextual observations migrate; previous simulator policy approvals remain isolated. */
export function previousCombatLearningIdentity(contentIdentity: string) {
  return contentIdentity.startsWith(combatContentPrefix) ? contentIdentity.replace(combatContentPrefix, 'combat-v38:') : undefined;
}

/** Same project content survives editor import/export timestamp updates. */
export function combatContentSource(project: unknown) {
  const migrated = migrateProject(project);
  // Preserve every rule, scene, asset digest and schema field. Authoring dates
  // cannot affect a bout and change during the validated export handoff.
  return stableProjectJson({ ...migrated, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' });
}

/** Recover only delivery-rewritten catalog fields; all gameplay content stays in the digest. */
export function standaloneCombatContentSource(options: { project: unknown; streamedAudio?: readonly StandaloneStreamedAudio[] }) {
  const project = migrateProject(options.project);
  const streamed = readStandaloneStreamedAudio({ project, value: options.streamedAudio });
  const assets = project.assets.map(asset => {
    const original = streamed.find(row => row.assetId === asset.id)?.originalCatalog;
    if (!original) return asset;
    const restored = { ...asset, source: original.source };
    if (original.sha256 === undefined) delete restored.sha256;
    else restored.sha256 = original.sha256;
    return restored;
  });
  return combatContentSource({ ...project, assets });
}
