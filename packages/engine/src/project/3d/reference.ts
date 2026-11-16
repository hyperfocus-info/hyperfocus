import { lookAtViewMat4, multiplyMat4, perspectiveMat4 } from '../../render/3d-core.ts';
import { parseDeclaration, record, type Hyperfocus3DDeclaration } from './declaration.ts';
import { readReference3D, type Reference3D, type ReferenceFinding3D } from './reference-schema.ts';
export { readReference3D, type Reference3D, type ReferenceFinding3D } from './reference-schema.ts';

export function referenceProjection3D(contract: Reference3D) {
  return multiplyMat4(new Float32Array(16),
    perspectiveMat4(new Float32Array(16), { ...contract.camera, aspect: contract.source.width / contract.source.height }),
    lookAtViewMat4(new Float32Array(16), contract.camera.position, contract.camera.target, contract.camera.up));
}

/** Source-camera geometric alignment only; never a whole-image similarity score. */
export function inspectReference3D(options: {
  contract: Reference3D; declaration: Hyperfocus3DDeclaration;
  worldPoint?: (entityId: string, localPoint: readonly number[]) => readonly number[] | undefined;
  depth?: (entityId: string) => number | undefined;
  projection?: Float32Array;
}) {
  const { contract, declaration } = options, findings: ReferenceFinding3D[] = [];
  const scene = declaration.scenes.find(item => item.id === contract.sceneId);
  if (!scene) return [{ code: 'reference-scene', id: contract.sceneId, message: `Missing reference scene ${contract.sceneId}` }];
  if (scene.camera.followEntityId !== undefined
    || (['position', 'target', 'up'] as const).some(key => scene.camera[key].some((value, index) => value !== contract.camera[key][index]))
    || (['fovYRadians', 'near', 'far'] as const).some(key => scene.camera[key] !== contract.camera[key])) {
    findings.push({ code: 'reference-camera', id: contract.sceneId, message: 'Authored reference camera changed; recalibrate the stored camera and measurements together' });
  }
  const entities = new Map(scene.entities.map(entity => [entity.id, entity])), projected = new Map<string, [number, number]>();
  const matrix = options.projection ?? referenceProjection3D(contract);
  for (const item of contract.landmarks) {
    const entity = entities.get(item.entityId);
    if (!entity) { findings.push({ code: 'reference-entity', id: item.id, entityId: item.entityId, message: `Missing reference entity ${item.entityId}` }); continue; }
    const [lx, ly, lz] = item.localPoint.map((v, i) => v * entity.scale[i]!);
    const cos = Math.cos(entity.rotationY), sin = Math.sin(entity.rotationY);
    const point = options.worldPoint ? options.worldPoint(item.entityId, item.localPoint) : [entity.position[0] + lx! * cos + lz! * sin, entity.position[1] + ly!, entity.position[2] - lx! * sin + lz! * cos];
    if (!point || !point.every(Number.isFinite)) { findings.push({ code: 'reference-transform', id: item.id, message: `Invalid live transform for ${item.entityId}` }); continue; }
    const [x, y, z] = point;
    const w = matrix[3]! * x! + matrix[7]! * y! + matrix[11]! * z! + matrix[15]!;
    const clipZ = matrix[2]! * x! + matrix[6]! * y! + matrix[10]! * z! + matrix[14]!;
    if (!Number.isFinite(w) || !Number.isFinite(clipZ) || w <= 0 || clipZ < -w || clipZ > w) { findings.push({ code: 'reference-depth', id: item.id, message: `Landmark ${item.id} is outside the reference camera depth range` }); continue; }
    const pixel: [number, number] = [((matrix[0]! * x! + matrix[4]! * y! + matrix[8]! * z! + matrix[12]!) / w + 1) * contract.source.width / 2,
      (1 - (matrix[1]! * x! + matrix[5]! * y! + matrix[9]! * z! + matrix[13]!) / w) * contract.source.height / 2];
    projected.set(item.id, pixel);
    const drift = item.axis === 'x' ? Math.abs(pixel[0] - item.pixel[0]) : item.axis === 'y' ? Math.abs(pixel[1] - item.pixel[1]) : Math.hypot(pixel[0] - item.pixel[0], pixel[1] - item.pixel[1]);
    if (!Number.isFinite(drift) || drift > item.tolerancePixels + item.uncertaintyPixels) findings.push({ code: 'reference-landmark-drift', id: item.id, entityId: item.entityId,
      message: `${item.id}: projected landmark drift ${drift.toFixed(2)}px exceeds ${(item.tolerancePixels + item.uncertaintyPixels).toFixed(2)}px` });
  }
  for (const item of contract.ratios) {
    const points = [...item.numerator, ...item.denominator].map(id => projected.get(id));
    if (points.some(point => !point)) continue;
    const [a, b, c, d] = points;
    const denominator = Math.hypot(c![0] - d![0], c![1] - d![1]);
    const ratio = Math.hypot(a![0] - b![0], a![1] - b![1]) / denominator;
    if (!Number.isFinite(ratio) || ratio < item.minimum || ratio > item.maximum) findings.push({ code: 'reference-ratio-drift', id: item.id, message: `${item.id}: projected ratio ${ratio} is outside ${item.minimum}..${item.maximum}` });
  }
  for (const item of contract.volumes) {
    if (!entities.has(item.entityId)) findings.push({ code: 'reference-entity', id: item.entityId, message: `Missing volume entity ${item.entityId}` });
    else if (options.depth) {
      const depth = options.depth(item.entityId);
      if (depth === undefined || !Number.isFinite(depth) || depth < item.minimumDepth) findings.push({ code: 'reference-volume', id: item.entityId, message: `${item.entityId}: actual scaled mesh depth ${depth} is below ${item.minimumDepth}` });
    }
  }
  return findings;
}

export function assertReferenceFindings3D(findings: readonly ReferenceFinding3D[]) {
  if (findings.length) throw Object.assign(new Error(`Reference geometry rejected: ${findings.map(finding => finding.message).join('; ')}`), { findings });
}

/** Synchronous admission for history, undoable authoring and persisted project input. */
export function assertReferenceProject3D(project: unknown, declaration?: Hyperfocus3DDeclaration) {
  const contract = readReference3D(project);
  if (!contract) return;
  const diagnostics: Parameters<typeof parseDeclaration>[2] = [];
  declaration ??= parseDeclaration(project, undefined, diagnostics);
  if (!declaration || diagnostics.length) throw Error('Reference requires a valid canonical 3D declaration');
  const catalog = record(project)?.assets;
  const assets = new Map(Array.isArray(catalog) ? catalog.map(asset => { const row = record(asset); return [row?.id, row]; }) : []);
  const source = assets.get(contract.source.assetId);
  if (!source || source.sha256 !== contract.source.sha256 || typeof source.mimeType !== 'string' || !source.mimeType.startsWith('image/')) throw Error('Reference source image/hash does not match the portable asset catalog');
  const scene = declaration.scenes.find(item => item.id === contract.sceneId);
  for (const volume of contract.volumes) {
    const entity = scene?.entities.find(item => item.id === volume.entityId), mesh = declaration.meshes.find(item => item.id === entity?.meshId);
    if (!mesh || assets.get(mesh.assetId)?.sha256 !== volume.meshSha256) throw Error(`Reference geometry source changed: ${volume.entityId}; remeasure before rebinding`);
    if (mesh.buffers.length || mesh.primitive !== 0 || mesh.skin || entity?.variants?.length) throw Error(`Reference ${volume.entityId} requires a self-contained static primitive-0 mesh; bake variants/skins before calibration`);
  }
  assertReferenceFindings3D(inspectReference3D({ contract, declaration, depth(entityId) {
    const entity = scene?.entities.find(item => item.id === entityId), volume = contract.volumes.find(item => item.entityId === entityId);
    return entity && volume ? volume.localDepth * Math.abs(entity.scale[2]) : undefined;
  } }));
  return contract;
}
