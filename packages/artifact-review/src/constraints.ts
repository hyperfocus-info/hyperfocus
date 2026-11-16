import { isRecord as isObject } from "@hyperfocus/utilities/records";
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';

type FileRef = { path: string; sha256: string };
type AssetRef = FileRef & { id: string };
export type ArtifactConstraints = {
  schemaVersion: 1;
  id: string;
  constitution: string;
  corpus: string;
  locks: { id: string; scope: string; evidence: FileRef[]; assets: AssetRef[] }[];
};


function object(value: unknown) {
  if (!isObject(value)) throw new Error('Expected constraint object');
  return value;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected nonempty constraint text');
  return value;
}
function path(value: unknown) {
  const result = text(value);
  if (isAbsolute(result) || /^[a-z]:|^\\\\|^[a-z]+:\/\//i.test(result)) throw new Error('Constraint paths must be relative to the manifest');
  return result;
}
function list(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw new Error('Constraint list must not be empty');
  return value;
}
function file(value: unknown): FileRef {
  const item = object(value), sha256 = text(item.sha256);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Expected lowercase SHA-256');
  return { path: path(item.path), sha256 };
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
export function parseArtifactConstraints(value: unknown): ArtifactConstraints {
  const raw = object(value);
  if (raw.schemaVersion !== 1) throw new Error('Unsupported constraint schema');
  const locks = list(raw.locks).map(value => {
    const item = object(value);
    return {
      id: text(item.id), scope: text(item.scope), evidence: list(item.evidence).map(file),
      assets: list(item.assets).map(value => ({ ...file(value), id: text(object(value).id) })),
    };
  });
  unique(locks.map(lock => lock.id), 'lock id');
  unique(locks.flatMap(lock => lock.assets.map(asset => asset.id)), 'locked asset id');
  return { schemaVersion: 1, id: text(raw.id), constitution: path(raw.constitution), corpus: path(raw.corpus), locks };
}

/** A preservation gate for trusted, owner-maintained constraints; never a taste grade. */
export async function verifyArtifactConstraints(options: {
  manifestPath: string;
  assets?: readonly { id: string; bytes: Uint8Array }[];
}) {
  const manifestPath = resolve(options.manifestPath), root = dirname(manifestPath);
  const source = await Bun.file(manifestPath).text();
  const manifest = parseArtifactConstraints(JSON.parse(source));
  const failures: string[] = [], files = new Map<string, string>();
  for (const link of [manifest.constitution, manifest.corpus]) {
    if (!await Bun.file(resolve(root, link)).exists()) failures.push(`Missing direction owner: ${link}`);
  }
  for (const lock of manifest.locks) for (const ref of [...lock.evidence, ...lock.assets]) {
    const target = resolve(root, ref.path);
    if (files.has(target) && files.get(target) !== ref.sha256) failures.push(`Conflicting evidence hash: ${ref.path}`);
    files.set(target, ref.sha256);
  }
  for (const [target, expected] of files) {
    if (!await Bun.file(target).exists()) { failures.push(`Missing locked reference: ${target}`); continue; }
    const hash = createHash('sha256').update(new Uint8Array(await Bun.file(target).arrayBuffer())).digest('hex');
    if (hash !== expected) failures.push(`Locked reference bytes changed: ${target}`);
  }
  let assetsChecked = 0;
  if (options.assets) {
    unique(options.assets.map(asset => asset.id), 'candidate asset id');
    const assets = new Map(options.assets.map(asset => [asset.id, asset.bytes]));
    for (const lock of manifest.locks) for (const expected of lock.assets) {
      const bytes = assets.get(expected.id);
      if (!bytes) { failures.push(`Missing locked asset ${expected.id} (${lock.scope})`); continue; }
      assetsChecked++;
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== expected.sha256) failures.push(`Locked asset changed: ${expected.id} (${lock.scope})`);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return { id: manifest.id, manifestSha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    constitution: resolve(root, manifest.constitution), corpus: resolve(root, manifest.corpus),
    locks: manifest.locks.map(lock => ({ id: lock.id, scope: lock.scope, assets: lock.assets.map(asset => asset.id) })),
    filesChecked: files.size, assetsChecked, status: 'constraints-preserved' as const };
}
