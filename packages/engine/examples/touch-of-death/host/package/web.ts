import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { migrateProject, type EditorProject } from '@hyperfocus/engine/project';
import { openDeliveryCore, readProjectDeliveryManifest, validateDeliveryCatalog, verifyDeliveryObject } from '@hyperfocus/engine/project/delivery';
import { verifyWebDeliveryDirectory } from '@hyperfocus/engine/tooling/build-project';
import { combatContentSource } from '../../src/network/identity.ts';

export async function readVerifiedWebPackage(options: { directory: string; html: string; project: EditorProject }) {
  const payload = /id="hyperfocus-project-pair">([^<]+)<\/script>/.exec(options.html)?.[1];
  const value: unknown = payload ? JSON.parse(payload) : undefined;
  if (!value || typeof value !== 'object' || Reflect.get(value, 'version') !== 2) return;
  const manifestPath: unknown = Reflect.get(value, 'manifestUrl');
  if (typeof manifestPath !== 'string' || !/^delivery-[a-f0-9]{64}\.json$/.test(manifestPath)) throw Error('Invalid indexed game manifest path.');
  const inventory = await verifyWebDeliveryDirectory(options.directory);
  const manifestFile = inventory.files.find(file => file.path === manifestPath);
  if (!manifestFile || manifestPath !== `delivery-${manifestFile.sha256}.json`) throw Error('Delivery manifest hash differs from its release name.');
  const manifest = readProjectDeliveryManifest(JSON.parse(await readFile(join(options.directory, manifestPath), 'utf8')));
  for (const object of [manifest.project, manifest.core]) if (!inventory.files.some(file => file.path === object.url && file.sha256 === object.sha256 && file.size === object.size)) throw Error('Indexed project files differ from the release inventory.');
  for (const object of manifest.assets) if (!object.url.startsWith('https://') && !inventory.files.some(file => file.path === object.url && file.sha256 === object.sha256 && file.size === object.size)) throw Error(`Delivered asset is absent from the release inventory: ${object.id}`);
  for (const [group, object] of Object.entries(manifest.packs ?? {})) if (!object.url.startsWith('https://') && !inventory.files.some(file => file.path === object.url && file.sha256 === object.sha256 && file.size === object.size)) throw Error(`Delivered pack is absent from the release inventory: ${group}`);
  const projectBytes = await verifyDeliveryObject({ object: manifest.project, bytes: new Uint8Array(await readFile(join(options.directory, manifest.project.url))) });
  const project = migrateProject(JSON.parse(new TextDecoder().decode(projectBytes)));
  if (combatContentSource(project) !== combatContentSource(options.project)) throw Error('Web project differs from the canonical fighter.');
  validateDeliveryCatalog({ manifest, project: options.project });
  await openDeliveryCore({ manifest, project, bytes: new Uint8Array(await readFile(join(options.directory, manifest.core.url))) });
  const files: Record<string, Uint8Array> = { 'build.json': new Uint8Array(await readFile(join(options.directory, 'build.json'))) };
  for (const file of inventory.files) files[file.path] = new Uint8Array(await readFile(join(options.directory, file.path)));
  return files;
}
