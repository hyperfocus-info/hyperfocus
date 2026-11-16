import { createRuntimeStartup3D } from '../../src/project/3d/runtime/startup.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readHyperfocusProjectPair } from '../../src/project/filesystem.ts';
import { migrateProject } from '../../src/project/editor.ts';
import { createWebPlayable } from '../../src/project/delivery/web.ts';
import { buildWebRuntime } from './web-runtime.ts';
import { collectProjectBehaviorImports, createBehaviorBundleEntry } from '../build-project.ts';
import { hasHyperfocus3DProject } from '../../src/project/metadata/index.ts';
import { auditPlayableProject, isPlayablePostEffect2D } from '../../src/project/runtime2d/runtime-2d-support.ts';
import { readAssetUrlMap as parseAssetUrlMap } from '../../src/project/delivery/manifest.ts';
import { auditNavigationProject2D, navigationBehaviorKey2D } from '../../src/project/runtime-navigation-2d.ts';
import { validatePlayableSaveProject2D } from '../../src/project/runtime-save-2d.ts';
import { validatePlayableStoryProject2D } from '../../src/project/runtime-story-2d.ts';

export async function buildWebProject(options: { projectDirectory: string; outputDirectory?: string; assetBaseUrl?: string; assetUrls?: Readonly<Record<string, string>>; debug?: boolean }) {
  const root = resolve(options.projectDirectory), destination = resolve(options.outputDirectory ?? join(root, 'dist/web'));
  const opened = await readHyperfocusProjectPair(root, { parseProject: migrateProject, maxArchiveBytes: 536870912, maxUnpackedBytes: 536870912, maxAssets: 5000 });
  validatePlayableSaveProject2D(opened.project);validatePlayableStoryProject2D(opened.project);
  const behaviors = collectProjectBehaviorImports(opened.project, root);
  if (hasHyperfocus3DProject(opened.project)) await createRuntimeStartup3D(opened.project, opened.assets);
  else {
    const diagnostics = [...auditPlayableProject(opened.project, [...behaviors.map(item => item.key), navigationBehaviorKey2D()]), ...auditNavigationProject2D(opened.project)];
    const unsupportedEffects = opened.project.postProcessing.effects.filter(effect => effect.enabled && !isPlayablePostEffect2D(effect.id));
    if (unsupportedEffects.length) throw Error(`Enabled post effects are not executed by the portable runtime: ${unsupportedEffects.map(effect => effect.id).join(', ')}.`);
    if (diagnostics.length) throw Error(`Project runtime preflight failed:\n${diagnostics.map(item => item.message).join('\n')}`);
  }
  const runtime = await buildWebRuntime({ source: createBehaviorBundleEntry(behaviors, hasHyperfocus3DProject(opened.project) ? '3d' : '2d'), resolveDirectory: root, debug: options.debug });
  const output = await createWebPlayable({ ...opened, runtime, assetBaseUrl: options.assetBaseUrl, assetUrls: options.assetUrls });
  // Write immutable objects before the document. Old hashes may safely remain for existing sessions.
  await mkdir(destination, { recursive: true });
  for (const file of [...output.files].sort((a, b) => Number(a.path === 'index.html') - Number(b.path === 'index.html'))) {
    const target = join(destination, file.path);await mkdir(dirname(target), { recursive: true });await writeFile(target, file.bytes);
  }
  return { outputPath: join(destination, 'index.html'), manifest: output.manifest, files: output.outputs, behaviorCount: behaviors.length,
    bytes: output.files.reduce((sum, file) => sum + file.bytes.length, 0) };
}

export async function readAssetUrlMap(path: string | undefined): Promise<Record<string, string> | undefined> {
  if (!path) return;
  return parseAssetUrlMap(JSON.parse(await readFile(path, 'utf8')));
}
