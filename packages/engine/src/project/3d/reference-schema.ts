import { requireRecordCopy } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { optional, readObject, readTuple, requireArray, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { lookAtViewMat4, perspectiveMat4 } from '../../render/3d-core.ts';

const text = (value: unknown) => requireText(value, { nonBlank: true, min: 1, max: 2048 });
const number = (value: unknown) => requireNumber(value);
const positive = (value: unknown) => requireNumber(value, { minimum: Number.MIN_VALUE });
const nonnegative = (value: unknown) => requireNumber(value, { minimum: 0 });
const vec3 = (value: unknown) => readTuple(value, [number, number, number]);
const pair = (value: unknown) => readTuple(value, [text, text]);
const hash = (value: unknown) => { const result = text(value); if (!/^[0-9a-f]{64}$/.test(result)) throw Error('Reference requires lowercase SHA-256'); return result; };
function fields(value: unknown, keys: readonly string[]) {
  const input = requireRecordCopy(value, 'Reference');
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw Error(`Unknown reference field: ${key}`);
  return input;
}
const source = (value: unknown) => readObject(fields(value, ['assetId', 'sha256', 'width', 'height']), {
  assetId: text, sha256: hash, width: v => requireNumber(v, { minimum: 1, maximum: 16384, integer: true }), height: v => requireNumber(v, { minimum: 1, maximum: 16384, integer: true }),
});
const camera = (value: unknown) => readObject(fields(value, ['position', 'target', 'up', 'fovYRadians', 'near', 'far']), {
  position: vec3, target: vec3, up: vec3, fovYRadians: positive, near: positive, far: positive,
});
const landmark = (value: unknown) => readObject(fields(value, ['id', 'entityId', 'localPoint', 'pixel', 'axis', 'tolerancePixels', 'uncertaintyPixels']), {
  id: text, entityId: text, localPoint: vec3, pixel: v => readTuple(v, [nonnegative, nonnegative]), axis: optional(v => requireOneOf(v, ['x', 'y', 'xy'] as const)), tolerancePixels: nonnegative, uncertaintyPixels: nonnegative,
});
const ratio = (value: unknown) => readObject(fields(value, ['id', 'numerator', 'denominator', 'minimum', 'maximum']), {
  id: text, numerator: pair, denominator: pair, minimum: nonnegative, maximum: positive,
});
const volume = (value: unknown) => readObject(fields(value, ['entityId', 'meshSha256', 'localDepth', 'minimumDepth', 'hiddenGeometry', 'rationale']), {
  entityId: text, meshSha256: hash, localDepth: positive, minimumDepth: positive, hiddenGeometry: v => requireOneOf(v, ['designed'] as const), rationale: text,
});

/** Portable observed constraints; designed unseen geometry is never counted as measured. */
export function readReference3D(project: unknown) {
  const root = requireRecordCopy(project, 'Project');
  const extensions = root.extensions === undefined ? {} : requireRecordCopy(root.extensions, 'Project extensions');
  if (extensions.hyperfocusReference3D === undefined) {
    const art = extensions.hyperfocusArtSource;
    if (art && typeof art === 'object' && 'brief' in art && art.brief && typeof art.brief === 'object' && 'reference' in art.brief && art.brief.reference !== undefined) {
      throw Error('Reference-generated art is missing hyperfocusReference3D protection');
    }
    return;
  }
  const contract = readObject(fields(extensions.hyperfocusReference3D, ['version', 'sceneId', 'source', 'camera', 'landmarks', 'ratios', 'volumes']), {
    version: v => requireOneOf(v, [1] as const), sceneId: text, source, camera,
    landmarks: v => requireArray(v, { minimum: 1, maximum: 2048 }).map(landmark),
    ratios: v => requireArray(v, { maximum: 2048 }).map(ratio),
    volumes: v => requireArray(v, { minimum: 1, maximum: 512 }).map(volume),
  });
  lookAtViewMat4(new Float32Array(16), contract.camera.position, contract.camera.target, contract.camera.up);
  perspectiveMat4(new Float32Array(16), { ...contract.camera, aspect: contract.source.width / contract.source.height });
  for (const rows of [contract.landmarks, contract.ratios]) if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Duplicate reference identity');
  if (new Set(contract.volumes.map(row => row.entityId)).size !== contract.volumes.length) throw Error('Duplicate reference volume');
  const ids = new Set(contract.landmarks.map(row => row.id));
  for (const row of contract.landmarks) {
    if (row.pixel[0] > contract.source.width || row.pixel[1] > contract.source.height) throw Error(`Reference landmark ${row.id} is outside the source image`);
    if (!contract.volumes.some(v => v.entityId === row.entityId)) throw Error(`Reference landmark ${row.id} needs a calibrated geometry volume`);
  }
  for (const row of contract.ratios) {
    if (row.minimum > row.maximum || [...row.numerator, ...row.denominator].some(id => !ids.has(id)) || row.denominator[0] === row.denominator[1]) throw Error(`Invalid reference ratio ${row.id}`);
    if ([...row.numerator, ...row.denominator].some(id => { const axis = contract.landmarks.find(point => point.id === id)?.axis;return axis !== undefined && axis !== 'xy'; })) throw Error(`Reference ratio ${row.id} needs landmarks measured on both axes`);
  }
  return contract;
}
export type Reference3D = NonNullable<ReturnType<typeof readReference3D>>;
export type ReferenceFinding3D = { code: string; id: string; entityId?: string; message: string };
