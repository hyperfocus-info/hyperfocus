import { S3Client } from 'bun';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnBackgroundProcess } from '@hyperfocus/desktop-runtime/process';
import { railwayDockerfile } from './build.ts';
import { readObject, readDictionary, requireNumber } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

/** Prepare a small upload while preserving the original portable package and every runtime byte. */
export async function prepareRailwayAssets(options: { package: string; out: string; cli: string; linkedDirectory: string; bucket: string; environment: string }) {
  const root = resolve(options.package), output = resolve(options.out);
  if (output === root || output.startsWith(root + '/') || output.startsWith(root + '\\')) throw Error('Delivery directory must be separate from the portable package.');
  const manifest = readObject(await Bun.file(resolve(root, 'manifest.json')).json(), {
    contentId: requireText,
    files: value => readDictionary(value, value => readObject(value, { bytes: requireNumber, sha256: requireText })),
  });
  const archiveName = 'project/.hyperfocus/assets.hfp', archive = manifest.files[archiveName];
  if (!archive) throw Error('Package has no asset archive.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || name.includes(':')) throw Error('Invalid package path.');
    const data = await Bun.file(resolve(root, name)).bytes();
    if (data.length !== expected.bytes || new Bun.CryptoHasher('sha256').update(data).digest('hex') !== expected.sha256) throw Error(`Package checksum mismatch: ${name}`);
  }
  // Never overwrite an existing delivery directory or change the source package.
  await mkdir(output);
  const child = spawnBackgroundProcess({ cmd: [options.cli, 'bucket', 'credentials', '--bucket', options.bucket, '--environment', options.environment, '--json'], cwd: resolve(options.linkedDirectory), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 30_000 });
  const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw Error(`Railway credential lookup failed (${code}); output suppressed.`);
  const credentials = JSON.parse(stdout);
  const client = new S3Client({ endpoint: credentials.endpoint, bucket: credentials.bucketName, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, region: credentials.region, virtualHostedStyle: credentials.urlStyle === 'virtual-hosted' });
  const objectKey = `assets/${archive.sha256}.hfp`, remote = client.file(objectKey);
  await remote.write(Bun.file(resolve(root, archiveName)), { type: 'application/octet-stream', partSize: 8388608, queueSize: 2 }).catch(() => { throw Error('Railway asset upload failed; credential-bearing details suppressed.'); });
  const url = remote.presign({ method: 'GET', expiresIn: 86400 });
  for (const name of [...Object.keys(manifest.files).filter(name => name !== archiveName), 'manifest.json', 'railway.json', '.dockerignore']) {
    await mkdir(dirname(resolve(output, name)), { recursive: true });await cp(resolve(root, name), resolve(output, name));
  }
  await cp(resolve(import.meta.dir, 'fetch-archive.ts'), resolve(output, 'fetch-archive.ts'));
  await Bun.write(resolve(output, 'asset-source.json'), JSON.stringify({ url, ...archive }));
  const dockerfile = `FROM oven/bun:1.4.2 AS assets\nWORKDIR /download\nCOPY asset-source.json fetch-archive.ts ./\nRUN bun fetch-archive.ts asset-source.json /assets.hfp\n\n${railwayDockerfile().replace('COPY project ./project', 'COPY project ./project\nCOPY --from=assets /assets.hfp ./project/.hyperfocus/assets.hfp')}`;
  await Bun.write(resolve(output, 'Dockerfile'), dockerfile);
  const receipt = { bucketId: options.bucket, environmentId: options.environment, objectKey, archive, contentId: manifest.contentId, preparedAt: new Date().toISOString(), downloadExpiresAt: new Date(Date.now() + 86400_000).toISOString(), note: 'Contains a short-lived read-only signed download in the build stage. Final image includes only the verified archive; regenerate delivery context for future source builds after expiry.' };
  await Bun.write(resolve(output, 'delivery.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}

if (import.meta.main) {
  const args = process.argv.slice(2), options: Record<string, string> = {};
  const names = ['package', 'out', 'cli', 'linked-directory', 'bucket', 'environment'];
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!.slice(2), value = args[index + 1];
    if (!args[index]!.startsWith('--') || !names.includes(name) || options[name] || !value || value.startsWith('--')) throw Error('Expected --package --out --cli --linked-directory --bucket --environment.');
    options[name] = value;
  }
  if (names.some(name => !options[name])) throw Error('Missing required delivery arguments.');
  console.log(JSON.stringify(await prepareRailwayAssets({ package: options.package!, out: options.out!, cli: options.cli!, linkedDirectory: options['linked-directory']!, bucket: options.bucket!, environment: options.environment! }), null, 2));
}
