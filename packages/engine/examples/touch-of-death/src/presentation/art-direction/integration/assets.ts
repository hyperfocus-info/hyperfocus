import { hashHyperfocusAsset, uniqueId, type EditorProject, type EditorAsset } from '@hyperfocus/engine/project';
/** The authoring host owns binary persistence and rollback. */
export type DirectedFighterAssetHost = {
  putAsset(asset: { id: string; name: string; mimeType: string; bytes: Uint8Array }): Promise<void>;
  removeAsset(id: string): Promise<void>;
};
import { addFighter, createArtFixture } from '../fixture.ts';
import { fighterCandidates } from '../candidates.ts';
import { refineFighter } from '../refine.ts';
import { applyDirectedFighters } from './author.ts';
import bank from './universal-bank.json';
import constraints from '../../../../docs/touch-of-death-art-corpus/constraints.json';
import { vessel } from '../../city/weapons/geometry.ts';
import { cookCityFacets } from '../../city/mesh-cooking.ts';
import { directedFighterSchema } from './contract.ts';
import { addCosmeticModels } from '../../cosmetics/models.ts';
import type { ServiceTreatment } from '../service-jacket.ts';

export function cookDirectedFighters(treatment: ServiceTreatment = 'utility') {
  const fixture = createArtFixture();
  addCosmeticModels(fixture);
  fixture.model('flexible-handle', cookCityFacets('Articulated nunchaku handle', vessel([[-1, .85], [-.9, 1], [.9, 1], [1, .85]], .8, 8)));
  for (const [id, opponent] of [['actor', false], ['actor-copy', true]] as const) {
    addFighter({ fixture, candidate: fighterCandidates[2], id, opponent });
    refineFighter(fixture, id, opponent, treatment, true);
  }
  return fixture;
}

/** Both fresh setup and upgrades use these exact reviewed generators and byte locks. */
export async function prepareDirectedFighterAssets(options: { project: EditorProject; host: DirectedFighterAssetHost; treatment?: ServiceTreatment }) {
  const fixture = cookDirectedFighters(options.treatment), written: string[] = [], catalog: EditorAsset[] = [], ids = new Map<string, string>();
  // Portable data uses an exact binary MIME: Bun otherwise adds a JSON charset
  // to Blob.type, which fails the editor's byte/catalog export preflight.
  const models = [...fixture.assets, { id: 'art:universal-bank', mimeType: 'application/octet-stream', bytes: new TextEncoder().encode(JSON.stringify(bank)) }];
  const cleanup = async () => { for (const id of written) await options.host.removeAsset(id); };
  try {
    for (const model of models) {
      const sha256 = await hashHyperfocusAsset(model.bytes);
      const lock = constraints.locks.flatMap(lock => lock.assets).find(asset => asset.id === model.id);
      if (lock && lock.sha256 !== sha256) throw new Error(`Accepted forearm bytes changed: ${model.id}`);
      let asset = [...options.project.assets, ...catalog].find(asset => asset.sha256 === sha256 && asset.mimeType === model.mimeType);
      if (!asset) {
        asset = { id: uniqueId('tod-directed'), name: `${model.id.replaceAll(':', '-')}.${model.id === 'art:universal-bank' ? 'json' : 'glb'}`, kind: 'data', mimeType: model.mimeType, size: model.bytes.length, lastModified: Date.now(), source: 'generated', sha256 };
        await options.host.putAsset({ id: asset.id, name: asset.name, mimeType: asset.mimeType, bytes: model.bytes });
        written.push(asset.id); catalog.push(asset);
      }
      ids.set(model.id, asset.id);
    }
  } catch (error) { await cleanup(); throw error; }
  return { cleanup, apply(project: EditorProject) {
    const previous = project.extensions?.hyperfocusTouchOfDeathArt;
    const oldBank = previous && directedFighterSchema.parse(previous).bankAssetId;
    if (oldBank && oldBank !== ids.get('art:universal-bank')) project.assets = project.assets.filter(asset => asset.id !== oldBank);
    for (const asset of catalog) if (!project.assets.some(item => item.id === asset.id)) project.assets.push(asset);
    applyDirectedFighters({ project, fixture, assetIds: ids });
  } };
}
