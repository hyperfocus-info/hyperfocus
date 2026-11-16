import type { EditorProject } from '@hyperfocus/engine/project';
import { readCombatProject3D, sample3DFrame } from '@hyperfocus/engine/project/runtime-3d';
import { readMutableHyperfocus3DDeclaration as readEditor3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import type { ArtFixture } from '../fixture.ts';
import { presentArtFighter } from '../pose.ts';
import { sampleUniversalCombat } from '../universal-combat.ts';
import type { DirectedFighters } from './contract.ts';
import { legacyParts } from './contract.ts';
import bank from './universal-bank.json';
import { readDirectedBank } from './bank.ts';
import { installDirectedCosmetics } from '../../cosmetics/author.ts';

export function applyDirectedFighters(options: { project: EditorProject; fixture: ArtFixture; assetIds: ReadonlyMap<string, string> }) {
  const { project, fixture, assetIds } = options, declaration = readEditor3DDeclaration(project)!;
  const combat = readCombatProject3D(project.extensions?.hyperfocusCombat), scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  if (!combat || combat.fighters.length !== 2 || !scene.entities.some(entity => entity.id === `${combat.fighters[0]!.entityId}:left-hand`)) throw new Error('Set up two Touch of Death fighters before installing their directed rig.');
  const upsert = <T extends { id: string }>(items: T[], value: T) => { const index = items.findIndex(item => item.id === value.id); if (index < 0) items.push(value); else items[index] = value; };
  const material = (id: string) => `tod:directed:${id}`;
  for (const look of fixture.declaration.materials) {
    if (look.id.startsWith('cosmetic-')) upsert(declaration.materials, { ...structuredClone(look), id: material(look.id) });
    else if (!declaration.materials.some(item => item.id === material(look.id))) declaration.materials.push({ ...structuredClone(look), id: material(look.id) });
  }
  for (const mesh of fixture.declaration.meshes) upsert(declaration.meshes, { ...structuredClone(mesh), id: material(mesh.id), assetId: assetIds.get(mesh.assetId!)! });
  const result: DirectedFighters = { version: 1, bankAssetId: assetIds.get('art:universal-bank')!, fighters: [] };
  for (const [index, fighter] of combat.fighters.entries()) {
    const root = scene.entities.find(entity => entity.id === fighter.entityId)!;
    const sourceId = index ? 'actor-copy' : 'actor', rigId = `${fighter.entityId}:art`;
    const parts = fixture.scene.entities.filter(entity => entity.id.startsWith(sourceId + ':'));
    const roleMaterial = (role: string, fallback: string) => declaration.materials.some(item => item.id === `${fighter.entityId}:appearance:${role}`) ? `${fighter.entityId}:appearance:${role}` : material(fallback);
    const rest = parts.map((part): DirectedFighters['fighters'][number]['rest'][number] => ({ id: part.id.replace(sourceId + ':', rigId + ':'), position: [...part.position], scale: [...part.scale], rotationY: part.rotationY }));
    for (const part of parts) {
      const suffix = part.id.slice(sourceId.length + 1), id = `${rigId}:${suffix}`;
      const old = scene.entities.find(entity => entity.id === fighter.entityId + legacyParts[suffix]);
      const variants = part.variants?.map(variant => ({ ...structuredClone(variant), meshId: material(variant.meshId), ...(variant.materialId ? {materialId: material(variant.materialId)} : {}) }))
        ?? old?.variants?.map(variant => ({ ...structuredClone(variant), meshId: variant.meshId === old.meshId ? material(part.meshId) : variant.meshId }));
      const color = part.materialId === 'cloth' || part.materialId === 'opponent' ? roleMaterial('top', part.materialId)
        : part.materialId === 'skin' ? roleMaterial('skin', 'skin') : part.materialId === 'trousers' ? roleMaterial('bottom', 'trousers')
        : suffix === 'hair' ? roleMaterial('hair', 'ink') : suffix.endsWith('-shoe') ? roleMaterial('shoes', 'ink') : material(part.materialId!);
      upsert(scene.entities, { ...structuredClone(part), id, meshId: material(part.meshId), materialId: color, ...(variants?.length ? { variants:variants.map(variant=>({...variant,materialId:variant.materialId===material(part.materialId!)?color:variant.materialId})) } : {}) });
    }
    for (const suffix of ['handle', 'chain', 'tail']) upsert(scene.entities, { id: `${rigId}:flexible:${suffix}`, meshId: material(suffix === 'chain' ? 'box' : 'flexible-handle'), materialId: material(suffix === 'chain' ? 'wrap' : 'orange'), position: [0, -100, 0], scale: [.01, .01, .01], rotationY: 0 });
    result.fighters.push({ entityId: fighter.entityId, rigId, rootHeight: Math.max(...root.scale.map(Math.abs)), rest });
  }
  project.extensions!.hyperfocusTouchOfDeathArt = result;
  installDirectedCosmetics(project, declaration);
  // Store a readable authored guard at each existing spawn, leaving physics roots intact.
  const frame = sample3DFrame({ declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 1280, height: 720 } });
  const authoredBank = readDirectedBank(new TextEncoder().encode(JSON.stringify(bank)));
  for (const fighter of result.fighters) {
    const root = scene.entities.find(entity => entity.id === fighter.entityId)!;
    presentArtFighter({ frame, declaration, id: fighter.rigId, bindPose: fighter.rest, root: [root.position[0], root.position[1] - fighter.rootHeight, root.position[2]], yaw: root.rotationY, motion: sampleUniversalCombat(authoredBank, { kind: 'idle', frame: 0 }) });
    for (const part of fighter.rest) {
      const entity = scene.entities.find(entity => entity.id === part.id)!, rendered = frame.entities.find(entity => entity.id === part.id)!;
      entity.position = [...rendered.position]; entity.rotationY = root.rotationY; entity.scale = [...rendered.scale];
    }
  }
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length), meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length), materials: Math.max(declaration.budgets.materials, declaration.materials.length), vertices: Math.max(declaration.budgets.vertices, 250_000), indices: Math.max(declaration.budgets.indices, 1_000_000) };
}
