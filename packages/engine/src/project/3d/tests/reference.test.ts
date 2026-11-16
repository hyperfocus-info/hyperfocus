import { expect, test } from 'bun:test';
import { createDefaultProject, validateProject } from '../../editor.ts';
import { createProjectHistory } from '../../editor-history.ts';
import { hashHyperfocusAsset } from '../../asset-hash.ts';
import { cookPrimitiveModel } from '../../../assets/primitive-model.ts';
import { createHyperfocus3DRuntime, sample3DFrame } from '../../runtime-3d.ts';
import { readReference3D, inspectReference3D, type Reference3D } from '../reference.ts';
import { parseDeclaration, type Hyperfocus3DDeclaration, type PortableAsset3D } from '../declaration.ts';

async function fixture() {
  const project = createDefaultProject('Reference geometry');
  delete project.tilemap.sourceAssetId;
  const source = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><circle cx="500" cy="500" r="50"/></svg>');
  const mesh = cookPrimitiveModel({ label: 'reference cube', parts: [['box', 0, 0, 0, 1, 1, 1, 0, 0, 0]] });
  const assets: PortableAsset3D[] = [{ id: 'source', mimeType: 'image/svg+xml', bytes: source }, { id: 'cube', mimeType: 'model/gltf-binary', bytes: mesh }];
  project.assets = await Promise.all(assets.map(async asset => ({ id: asset.id, name: asset.id, kind: asset.id === 'source' ? 'image' as const : 'data' as const, mimeType: asset.mimeType, size: asset.bytes.length, sha256: await hashHyperfocusAsset(asset.bytes), source: 'generated' as const, lastModified: 0 })));
  const camera: Reference3D['camera'] = { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: Math.PI / 2, near: .1, far: 100 };
  const declaration: Hyperfocus3DDeclaration = { version: 1, activeSceneId: 'main',
    budgets: { meshes: 1, vertices: 1000, indices: 1000, textures: 1, textureBytes: 1024, materials: 1, lights: 1, entities: 1 },
    meshes: [{ id: 'cube', assetId: 'cube', primitive: 0, buffers: [] }], textures: [], materials: [{ id: 'gold', shading: 'unlit', baseColor: [1, .7, .1, 1], metallic: 0, roughness: 1, doubleSided: false }],
    scenes: [{ id: 'main', camera, lights: [], entities: [{ id: 'subject', meshId: 'cube', materialId: 'gold', position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0 }] }],
    audio: { policy: 'disabled', cues: [] }, save: { restoreOnBoot: false, slot: 'auto', maxBytes: 1024 } };
  const reference: Reference3D = { version: 1, sceneId: 'main', source: { assetId: 'source', sha256: project.assets[0]!.sha256!, width: 1000, height: 1000 }, camera: structuredClone(camera),
    landmarks: [{ id: 'center', entityId: 'subject', localPoint: [0, 0, 0], pixel: [500, 500], tolerancePixels: 1, uncertaintyPixels: 0 },
      { id: 'right', entityId: 'subject', localPoint: [1, 0, 0], pixel: [550, 500], tolerancePixels: 1, uncertaintyPixels: 0 },
      { id: 'top', entityId: 'subject', localPoint: [0, 1, 0], pixel: [500, 450], tolerancePixels: 1, uncertaintyPixels: 0 }],
    ratios: [{ id: 'square', numerator: ['center', 'right'], denominator: ['center', 'top'], minimum: .99, maximum: 1.01 }],
    volumes: [{ entityId: 'subject', meshSha256: project.assets[1]!.sha256!, localDepth: 2, minimumDepth: 1, hiddenGeometry: 'designed', rationale: 'Closed cube fixture; unseen sides are designed, not inferred evidence.' }] };
  project.extensions = { hyperfocus3D: declaration, hyperfocusReference3D: reference, hyperfocusArtSource: { brief: { reference: { source: 'fixture' } } } };
  return { project, declaration, reference, assets };
}

test('measured geometry survives history and rejects drift before a mutation commits', async () => {
  const { project } = await fixture();
  validateProject(project);
  const history = createProjectHistory(project);
  history.transact('Rename', draft => { draft.name = 'Still aligned'; });
  const before = JSON.stringify(history.project);
  expect(() => history.transact('Move', draft => { mutableDeclaration(draft).scenes[0]!.entities[0]!.position[0] = 1; })).toThrow('drift');
  expect(JSON.stringify(history.project)).toBe(before);
  expect(() => history.transactSections({ label: 'Change calibrated lens', dirtySections: ['extensions'], update(draft) { mutableDeclaration(draft).scenes[0]!.camera.fovYRadians = .9; } })).toThrow('camera changed');
  expect(JSON.stringify(history.project)).toBe(before);
  expect(() => history.transactSections({ label: 'Flatten', dirtySections: ['extensions'], update(draft) { mutableDeclaration(draft).scenes[0]!.entities[0]!.scale[2] = .001; } })).toThrow('depth');
  expect(JSON.stringify(history.project)).toBe(before);
  expect(history.undo()).toBe(true);expect(history.project.name).toBe('Reference geometry');
  expect(history.redo()).toBe(true);expect(history.project.name).toBe('Still aligned');
  expect(() => validateProject({ ...project, extensions: { ...project.extensions, hyperfocusReference3D: undefined } })).toThrow('missing');
});

test('malformed, missing, and stale calibration cannot establish alignment', async () => {
  const { project, reference } = await fixture();
  for (const change of [(value: Reference3D) => { value.landmarks[0]!.pixel[0] = NaN; }, (value: Reference3D) => { Object.assign(value.volumes[0]!, { meshSha256: '0'.repeat(64) }); }]) {
    const copy = structuredClone(project);change(mutableReference(copy));expect(() => validateProject(copy)).toThrow();
  }
  const copy = structuredClone(project);Object.assign((mutableReference(copy)).landmarks[0]!, { entityId: 'absent' });
  expect(() => validateProject(copy)).toThrow();
  expect(() => readReference3D({ extensions: { hyperfocusReference3D: { ...reference, invented: true } } })).toThrow('Unknown reference');
});

test('runtime verifies real source bytes, calibrated depth, and every presented transform', async () => {
  const { project, declaration, reference, assets } = await fixture();
  const corrupt = assets.map(asset => ({ ...asset, bytes: asset.bytes.slice() }));corrupt[0]!.bytes[0] ^= 1;
  await expect(createHyperfocus3DRuntime(project, corrupt)).rejects.toThrow('source image');
  const forged = structuredClone(project);Object.assign((mutableReference(forged)).volumes[0]!, { localDepth: 20 });
  await expect(createHyperfocus3DRuntime(forged, assets)).rejects.toThrow('calibrated depth');
  const runtime = await createHyperfocus3DRuntime(project, assets);
  expect(runtime.compile().instanceCount).toBe(1);
  const frame = sample3DFrame({ declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 1000, height: 1000 } });
  frame.camera.position = [9, 4, 6];frame.entities[0]!.visible = false;
  expect(() => runtime.applyFrame(frame)).not.toThrow(); // Orbit/isolation cannot redefine source measurements.
  frame.entities[0]!.scale[2] = .001;
  expect(() => runtime.applyFrame(frame)).toThrow('depth');
  frame.entities[0]!.scale[2] = 1;runtime.applyFrame(frame);
  runtime.scene.transforms.setPosition(0, 3, 0, 0);
  expect(() => runtime.compile()).toThrow('drift');
  expect(() => runtime.compileViews(runtime.viewProjection(1))).toThrow('drift');
  runtime.scene.transforms.setPosition(0, 0, 0, 0);
  expect(() => runtime.compile()).not.toThrow();
  const originalFov = runtime.declaration.scenes[0]!.camera.fovYRadians;
  runtime.declaration.scenes[0]!.camera.fovYRadians = .9;
  expect(() => runtime.compile()).toThrow('camera changed');
  runtime.declaration.scenes[0]!.camera.fovYRadians = originalFov;
  expect(inspectReference3D({ contract: reference, declaration })).toEqual([]);
});

function mutableDeclaration(project: ReturnType<typeof createDefaultProject>) {
 const value = parseDeclaration(project, undefined, []); if (!value) throw new Error("Missing fixture declaration"); project.extensions!.hyperfocus3D = value; return value;
}
function mutableReference(project: ReturnType<typeof createDefaultProject>) {
 const value = readReference3D(project); if (!value) throw new Error("Missing fixture reference"); project.extensions!.hyperfocusReference3D = value; return value;
}
