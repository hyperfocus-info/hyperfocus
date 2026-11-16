import { dirname, resolve } from 'node:path';
import { spawnBackgroundProcess, terminateProcessTree } from '@hyperfocus/desktop-runtime/process';
import { verifyWebDeliveryDirectory } from '@hyperfocus/engine/tooling/build-project';

async function currentRuntimeSource(debug: boolean, build: { entrypoint: string; cwd: string }) {
  const editorRoot = resolve(build.cwd);
  const configuration = { entrypoints: [resolve(editorRoot, build.entrypoint)],
    format: 'iife', minify: !debug, sourcemap: debug ? 'inline' : 'none', target: 'browser', metafile: true };
  // Bun's debug module labels and source maps depend on cwd; `root` does not replace it.
  // A short owned child matches the editor build without changing the caller's cwd.
  const script = `const build = await Bun.build(${JSON.stringify(configuration)});
if (!build.success) throw Error('Could not build the current standalone source.');
const output = build.outputs.find(value => value.path.endsWith('.js'));
if (!output) throw Error('Current standalone build has no JavaScript output.');
process.stdout.write(await output.text());`;
  const child = spawnBackgroundProcess({ cmd: [process.execPath, '--eval', script], cwd: editorRoot,
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', maxBuffer: 67108864, timeout: 30000 });
  try {
    const [code, source, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (code !== 0) throw Error(`Could not build the current standalone source for export verification: ${stderr.slice(0, 2048)}`);
    return source + (debug ? '\n//# sourceURL=hyperfocus-playable-3d.js\n' : '');
  } finally { if (child.exitCode === null) await terminateProcessTree({ process: child }); }
}

/** Verify the downloaded editor artifact, never patch it with a replacement runtime. */
async function currentWebRuntime(debug: boolean, build: { entrypoint: string; cwd: string }) {
  const script = `import {buildWebRuntime} from ${JSON.stringify(import.meta.resolve('@hyperfocus/engine/tooling/build-project'))};
const result = await buildWebRuntime(${JSON.stringify({ entrypoint: resolve(build.cwd, build.entrypoint), debug })});
process.stdout.write(JSON.stringify({entry:result.entry,files:result.files.map(file=>({path:file.path,size:file.bytes.length,sha256:new Bun.CryptoHasher('sha256').update(file.bytes).digest('hex')}))}));`;
  const child = spawnBackgroundProcess({ cmd: [process.execPath, '--eval', script], cwd: resolve(build.cwd), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', maxBuffer: 4194304, timeout: 30000 });
  try {
    const [code, source, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (code !== 0) throw Error(`Could not reproduce the web runtime: ${stderr.slice(0, 2048)}`);
    const result: { entry: string; files: Array<{ path: string; size: number; sha256: string }> } = JSON.parse(source);
    return result;
  } finally { if (child.exitCode === null) await terminateProcessTree({ process: child }); }
}

export async function verifyTouchOfDeathExportRuntime(options: { html: string; directory?: string; runtimeBuild?: { entrypoint: string; cwd: string } }) {
  const debug = options.html.includes('//# sourceURL=hyperfocus-playable-3d.js');
  if (!options.runtimeBuild) throw new Error('Export verification requires --runtime-entry <entry.ts> and --runtime-cwd <build-directory>.');
  if (options.html.includes('"manifestUrl"')) {
    if (!options.directory) throw Error('Indexed export verification requires its complete directory.');
    const inventory = await verifyWebDeliveryDirectory(options.directory);
    const candidate = await currentWebRuntime(inventory.files.some(file => file.path.endsWith('.map')), options.runtimeBuild);
    const expected = inventory.files.filter(file => file.path.startsWith('runtime/'));
    if (candidate.entry !== inventory.runtimeEntry || expected.length !== candidate.files.length || candidate.files.some(file => {
      const recorded = expected.find(entry => entry.path === file.path);
      return !recorded || recorded.size !== file.size || recorded.sha256 !== file.sha256;
    })) throw Error('Downloaded web build contains a stale or different runtime chunk graph. Rebuild and export again.');
    return { runtimeSha256: new Bun.CryptoHasher('sha256').update(JSON.stringify(expected)).digest('hex'), runtimeBytes: expected.reduce((sum, file) => sum + file.size, 0), format: 'esm-split', chunks: expected.length };
  }
  const source = await currentRuntimeSource(debug, options.runtimeBuild);
  const inline = source.replace(/<\/script/gi, '<\\/script').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (!options.html.includes(`<script>${inline}</script>`)) throw new Error('Downloaded HTML contains a stale or different standalone runtime. Wait for the managed editor rebuild, reload the editor and export again.');
  return { runtimeSha256: new Bun.CryptoHasher('sha256').update(source).digest('hex'), runtimeBytes: new TextEncoder().encode(source).length, format: debug ? 'debug' : 'minified' };
}

if (import.meta.main) {
  const path = process.argv[2];if (!path) throw new Error('Pass the editor-downloaded HTML path.');
  console.log(await verifyTouchOfDeathExportRuntime({ html: await Bun.file(path).text(), directory: dirname(resolve(path)), runtimeBuild: process.argv[3] ? { entrypoint: process.argv[3], cwd: process.argv[4] ?? process.cwd() } : undefined }));
}
