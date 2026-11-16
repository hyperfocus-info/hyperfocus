import { expect, test } from 'bun:test';
import { createDefaultProject, readStandaloneStreamedAudio, type StandaloneStreamedAudio } from '@hyperfocus/engine/project';
import { combatContentPrefix, combatContentSource, previousCombatLearningIdentity, standaloneCombatContentSource } from './identity.ts';

test('longer juggling and wider round recovery use a new deterministic match namespace', () => {
  expect(combatContentPrefix).toBe('combat-v39:');
  expect(previousCombatLearningIdentity('combat-v39:city')).toBe('combat-v38:city');
  expect(previousCombatLearningIdentity('combat-v38:city')).toBeUndefined();
});

test('validated export authoring timestamps do not change combat content identity', () => {
  const project = createDefaultProject('Identity');
  expect(combatContentSource({ ...project, createdAt: '2026-09-24T01:00:00.000Z', updatedAt: '2026-09-24T02:00:00.000Z' }))
    .toBe(combatContentSource({ ...project, createdAt: '2026-09-25T01:00:00.000Z', updatedAt: '2026-09-25T02:00:00.000Z' }));
});

test('streamed delivery restores exact imported and generated catalog identities without masking content changes', () => {
  const canonical = createDefaultProject('Streamed identity');
  const streamed: StandaloneStreamedAudio[] = [];
  for (const source of ['imported', 'generated'] as const) for (const hashed of [true, false]) {
    const id = `${source}-${hashed}`, sha256 = 'a'.repeat(64);
    canonical.assets.push({ id, name: id, kind: 'audio', source, mimeType: 'audio/mpeg', size: 100, lastModified: 0, ...(hashed ? { sha256 } : {}) });
    streamed.push({ assetId: id, url: `audio/${sha256}.mp3`, sha256, size: 100, durationSeconds: 60, originalCatalog: { source, ...(hashed ? { sha256 } : {}) } });
  }
  const delivery = structuredClone(canonical);
  for (const asset of delivery.assets) if (streamed.some(row => row.assetId === asset.id)) { asset.source = 'generated';delete asset.sha256; }
  expect(combatContentSource(delivery)).not.toBe(combatContentSource(canonical));
  const parsed = readStandaloneStreamedAudio({ project: delivery, value: JSON.parse(JSON.stringify(streamed)) });
  expect(standaloneCombatContentSource({ project: delivery, streamedAudio: parsed })).toBe(combatContentSource(canonical));
  expect(delivery.assets.find(asset => asset.id === 'imported-true')?.source).toBe('generated');
  const changed = structuredClone(delivery);changed.scenes[0]!.name += ' changed';
  expect(standaloneCombatContentSource({ project: changed, streamedAudio: parsed })).not.toBe(combatContentSource(canonical));
  const changedBytes = structuredClone(parsed);
  changedBytes[0]!.sha256 = 'b'.repeat(64);changedBytes[0]!.url = `audio/${'b'.repeat(64)}.mp3`;changedBytes[0]!.originalCatalog!.sha256 = 'b'.repeat(64);
  expect(standaloneCombatContentSource({ project: delivery, streamedAudio: changedBytes })).not.toBe(combatContentSource(canonical));
  expect(standaloneCombatContentSource({ project: canonical })).toBe(combatContentSource(canonical));
  const legacy = parsed.map(({ originalCatalog, ...row }) => row);
  expect(standaloneCombatContentSource({ project: delivery, streamedAudio: legacy })).toBe(combatContentSource(delivery));
});

test('combat content identity retains rules, scene content and asset byte digests', () => {
  const project = createDefaultProject('Identity');
  const source = combatContentSource(project);
  expect(combatContentSource({ ...project, extensions: { ...project.extensions, hyperfocusCombat: { version: 1, config: { maxHealth: 80 } } } })).not.toBe(source);
  expect(combatContentSource({ ...project, scenes: project.scenes.map(scene => ({ ...scene, name: scene.name + ' changed' })) })).not.toBe(source);
  const original = { ...project, assets: project.assets.map((asset, index) => index === 0 ? { ...asset, sha256: 'a'.repeat(64) } : asset) };
  const changed = { ...project, assets: project.assets.map((asset, index) => index === 0 ? { ...asset, sha256: 'b'.repeat(64) } : asset) };
  expect(original.assets.length).toBeGreaterThan(0);
  expect(combatContentSource(changed)).not.toBe(combatContentSource(original));
});

test('guard arc, wall traversal and material weapon rules all change network and replay content identity', () => {
  const project = createDefaultProject('Combat identity');
  const combat = { version: 1, config: { guardArcDegrees: 120 }, movement: { wallRunFrames: 30 }, interactions: { weapons: [{ entityId: 'staff', material: 'wood', durability: 40, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' }] } };
  const source = combatContentSource({ ...project, extensions: { ...project.extensions, hyperfocusCombat: combat } });
  for (const next of [
    { ...combat, config: { guardArcDegrees: 180 } },
    { ...combat, movement: { wallRunFrames: 45 } },
    { ...combat, interactions: { weapons: combat.interactions.weapons.map(weapon => ({ ...weapon, material: 'metal' })) } },
    { ...combat, interactions: { weapons: combat.interactions.weapons.map(weapon => ({ ...weapon, length: 1 })) } },
  ]) expect(combatContentSource({ ...project, extensions: { ...project.extensions, hyperfocusCombat: next } })).not.toBe(source);
});
