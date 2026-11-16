import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { migrateProject, openHyperfocusProjectFiles, readStandaloneStreamedAudio, HYPERFOCUS_PROJECT_PATH, HYPERFOCUS_ASSETS_PATH, supportsStandaloneCombatConnections } from '@hyperfocus/engine/project';
import { readHyperfocusProjectPair } from '@hyperfocus/engine/project/filesystem';
import { combatContentPrefix, combatContentSource, standaloneCombatContentSource } from '../../src/network/identity.ts';
import { profileProtocolVersion } from '../../src/appearance/profile.ts';
import { communityProtocolVersion } from '../../src/network/community-protocol.ts';
import { quickPlayProtocolVersion } from '../../src/network/quick-play/protocol.ts';
import { trainingProtocolVersion } from '../../src/training/protocol.ts';
import { verifyTouchOfDeathExportRuntime } from '../export-runtime.ts';
import { exportDevelopmentPolicy } from './policy.ts';
import { readDeploymentPolicy } from '../policy-learning/deployment.ts';
import { readVerifiedWebPackage } from './web.ts';

const hash = (value: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
async function absent(path: string) { try { await lstat(path);throw new Error('Output directory already exists. Choose a new release directory.'); } catch (cause) { if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause; } }
function requiredPath(value: string) { if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) throw new Error('Expected a nonempty filesystem path.');return resolve(value); }
/** Strictly validate the exported pair without evaluating or rewriting its HTML. */
export async function validatePackagePair(options: { html: string; projectSource: string; assetsArchive: Uint8Array }) {
  const matches = [...options.html.matchAll(/<script\b[^>]*\bid="hyperfocus-project-pair"[^>]*>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) throw new Error('HTML must contain exactly one portable project pair.');
  const pair: unknown = JSON.parse(matches[0]![1]!);
  if (!pair || typeof pair !== 'object' || Array.isArray(pair) || Reflect.get(pair, 'version') !== 1) throw new Error('Invalid embedded project pair.');
  const decode = (field: string) => { const value = Reflect.get(pair, field);if (typeof value !== 'string' || value.length > 1073741824) throw new Error('Invalid embedded project bytes.');const bytes = Buffer.from(value, 'base64');if (bytes.toString('base64') !== value) throw new Error('Noncanonical embedded base64.');return bytes; };
  const projectJson = decode('projectJson'), assetsArchive = decode('assetsArchive');
  const opened = await openHyperfocusProjectFiles(projectJson, assetsArchive, { parseProject: migrateProject, maxArchiveBytes: 1073741824, maxAssets: 5000, maxUnpackedBytes: 1073741824 });
  const streamedAudio = readStandaloneStreamedAudio({ project: opened.project, value: Reflect.get(pair, 'streamedAudio') });
  if (standaloneCombatContentSource({ project: opened.project, streamedAudio }) !== options.projectSource) throw new Error('HTML project differs from the canonical fighter.');
  const canonical = await openHyperfocusProjectFiles(new TextEncoder().encode(options.projectSource), options.assetsArchive, { parseProject: migrateProject, maxArchiveBytes: 1073741824, maxAssets: 5000, maxUnpackedBytes: 1073741824 });
  const assets = new Map(canonical.assets.map(asset => [asset.id, asset]));
  if (opened.assets.length + streamedAudio.length !== assets.size) throw new Error('HTML asset set differs from the canonical project.');
  for (const source of streamedAudio) {
    const asset = assets.get(source.assetId);
    if (!asset || asset.mimeType !== 'audio/mpeg' || asset.bytes.length !== source.size || hash(asset.bytes) !== source.sha256) throw new Error(`Streamed audio differs from canonical asset: ${source.assetId}`);
    assets.delete(source.assetId);
  }
  for (const asset of opened.assets) {
    const expected = assets.get(asset.id);
    if (!expected || asset.name !== expected.name || asset.mimeType !== expected.mimeType || hash(asset.bytes) !== hash(expected.bytes)
      || !Buffer.from(asset.bytes).equals(Buffer.from(expected.bytes))) throw new Error(`HTML asset differs from canonical asset: ${asset.id}`);
    assets.delete(asset.id);
  }
  if (assets.size) throw new Error('HTML is missing canonical assets.');
}
export async function buildTouchOfDeathPackage(options: { projectRoot: string; artifactPath: string; outputDirectory: string; policyDatabasePath?: string; runtimeBuild?: { entrypoint: string; cwd: string } }) {
  const projectRoot = requiredPath(options.projectRoot), artifactPath = requiredPath(options.artifactPath), output = requiredPath(options.outputDirectory);
  await absent(output);
  const snapshot = await readHyperfocusProjectPair(projectRoot, { parseProject: migrateProject, maxArchiveBytes: 1073741824, maxAssets: 5000, maxUnpackedBytes: 1073741824 });
  if (!supportsStandaloneCombatConnections(snapshot.project)) throw new Error('Package requires a supported two-fighter combat project.');
  const projectJson = await readFile(join(projectRoot, HYPERFOCUS_PROJECT_PATH)), assetsArchive = await readFile(join(projectRoot, HYPERFOCUS_ASSETS_PATH)), htmlBytes = await readFile(artifactPath), html = htmlBytes.toString('utf8');
  const source = combatContentSource(snapshot.project);
  if (combatContentSource(migrateProject(JSON.parse(projectJson.toString('utf8')))) !== source) throw new Error('Project changed during packaging.');
  const webFiles = await readVerifiedWebPackage({ directory: dirname(artifactPath), html, project: snapshot.project });
  if (!webFiles) await validatePackagePair({ html, projectSource: source, assetsArchive });
  const runtime = await verifyTouchOfDeathExportRuntime({ html, directory: dirname(artifactPath), runtimeBuild: options.runtimeBuild });
  const contentId = `${combatContentPrefix}${hash(source)}`;
  const policyArtifact = exportDevelopmentPolicy({ databasePath: options.policyDatabasePath ? requiredPath(options.policyDatabasePath) : resolve(projectRoot, '../community.sqlite'), contentId, required: options.policyDatabasePath !== undefined });
  const policy = readDeploymentPolicy({ artifact: policyArtifact, contentId });
  const host = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../relay.ts')], target: 'bun', format: 'esm', minify: true });
  const moderator = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../../src/uploads/moderation-entry.ts')], target: 'browser', format: 'iife', minify: true });
  if (!host.success || host.outputs.length !== 1 || !moderator.success || moderator.outputs.length !== 1) throw new Error('Portable host or moderator build failed.');
  await mkdir(dirname(output), { recursive: true });const staging = await mkdtemp(join(dirname(output), `.${basename(output)}-stage-`));
  try {
    const files: Record<string, Uint8Array> = { 'host.js': new Uint8Array(await host.outputs[0]!.arrayBuffer()), 'moderation.js': new Uint8Array(await moderator.outputs[0]!.arrayBuffer()), 'game.html': htmlBytes, 'policy-candidate.json': new TextEncoder().encode(policyArtifact), [`project/${HYPERFOCUS_PROJECT_PATH}`]: projectJson, [`project/${HYPERFOCUS_ASSETS_PATH}`]: assetsArchive };
    for (const [path, bytes] of Object.entries(webFiles ?? {})) files[`web/${path}`] = bytes;
    await mkdir(join(staging, 'project', '.hyperfocus'), { recursive: true });await mkdir(join(staging, 'data'));
    await mkdir(join(staging, 'web'), { recursive: true });
    for (const [path, bytes] of Object.entries(files)) { await mkdir(dirname(join(staging, path)), { recursive: true });await writeFile(join(staging, path), bytes, { flag: 'wx' }); }
    const manifest = { version: 1, contentId, bunVersion: Bun.version, runtime, policy: { id: policy.id, sourceRevision: policy.sourceRevision, nomination: policy.record !== undefined }, protocols: { profile: profileProtocolVersion, community: communityProtocolVersion, quickPlay: quickPlayProtocolVersion, training: trainingProtocolVersion }, files: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, { bytes: bytes.length, sha256: hash(bytes) }])) };
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await writeFile(join(staging, 'Dockerfile'), railwayDockerfile(), { flag: 'wx' });
    await writeFile(join(staging, 'railway.json'), JSON.stringify({ $schema: 'https://railway.com/railway.schema.json', build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' }, deploy: { numReplicas: 1, healthcheckPath: '/tod-health', restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 } }, null, 2), { flag: 'wx' });
    await writeFile(join(staging, '.dockerignore'), 'data\n.env\n.env.*\n*.sqlite*\n', { flag: 'wx' });
    await writeFile(join(staging, 'README.md'), packageReadme(), { flag: 'wx' });
    await absent(output);await rename(staging, output);return { outputDirectory: output, manifest };
  } catch (cause) { if (dirname(resolve(staging)) !== dirname(output) || !basename(staging).startsWith(`.${basename(output)}-stage-`)) throw new Error('Unsafe package staging cleanup.');await rm(staging, { recursive: true, force: true });throw cause; }
}
export function railwayDockerfile() { return `FROM oven/bun:1.4.2
WORKDIR /app
COPY host.js game.html moderation.js policy-candidate.json ./
COPY project ./project
COPY web ./web
ENV TOUCH_OF_DEATH_BIND_ADDRESS=0.0.0.0
ENV TOUCH_OF_DEATH_DEMO_HTML=/app/game.html
ENV TOUCH_OF_DEATH_REQUIRE_POSTGRES=1
ENV TOUCH_OF_DEATH_STORAGE=postgres
ENV TOUCH_OF_DEATH_POLICY_CANDIDATE=/app/policy-candidate.json
ENV TOUCH_OF_DEATH_MODERATOR_SCRIPT=/app/moderation.js
CMD ["bun", "./host.js", "--project", "./project"]
`; }
function packageReadme() { return `# Touch of Death local demo host

Requires Bun ${Bun.version} or a compatible release. Run from this folder in PowerShell:

\x60\x60\x60powershell
$env:PORT = '8802'
$env:TOUCH_OF_DEATH_STORAGE = 'sqlite'
$env:TOUCH_OF_DEATH_DEMO_HTML = (Resolve-Path './game.html').Path
$env:TOUCH_OF_DEATH_DATABASE_PATH = Join-Path (Get-Location) 'data/community.sqlite'
$env:TOUCH_OF_DEATH_MODERATOR_SCRIPT = (Resolve-Path './moderation.js').Path
$env:TOUCH_OF_DEATH_POLICY_CANDIDATE = (Resolve-Path './policy-candidate.json').Path
bun ./host.js --project ./project
\x60\x60\x60

Open http://127.0.0.1:8802/ (not localhost). The host binds loopback only. For an independently provisioned TLS reverse proxy, set TOUCH_OF_DEATH_PUBLIC_ORIGIN to the exact HTTPS origin (no trailing slash) before starting, and preserve that origin's Host header upstream. Public routes are /, /tod-demo.json, /tod-guest-session, /tod-guest-recovery, /tod-health, /tod-ai-policy, /tod-ai-candidates and the exact verified /audio/<sha256>.mp3 songs in the export; WebSockets upgrade only at / with the exact configured Origin. Stats and moderation stay on the loopback backend. Forwarded headers never choose the account origin. Choose a stable origin before issuing recovery files, which are bound to it. This package does not provision a domain, certificate or public service.

Railway: deploy this directory with its Dockerfile and railway.json and keep one replica. Set DATABASE_URL to the linked PostgreSQL service reference, TOUCH_OF_DEATH_PUBLIC_ORIGIN to the generated HTTPS domain, and PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in service variables. Enable desired OAuth providers and that origin in the Clerk dashboard. The image requires PostgreSQL and binds 0.0.0.0 on Railway PORT; public binding disables backend moderation/stats routes, even with spoofed Host headers. /tod-health checks the database and returns readiness without operational data. All durable application state uses PostgreSQL; the game service needs no disk volume. Back up PostgreSQL. Clerk accounts do not automatically merge with old local guests. One replica remains required for live rooms and matchmaking.

The checksummed policy-candidate.json contains the dev server's approved policy for this exact content identity, or an explicit empty nomination. On Railway startup it is queued once for fresh evaluation against the current production policy. Only a passing evaluation changes production weights; restart/redeploy cannot replay the same artifact. Failed staging retries after one minute; active production weights remain usable. No local revision number overwrites a production revision. The manifest records the candidate digest and source revision.

Stop with Ctrl+C and wait for shutdown. The local command explicitly selects SQLite even when DATABASE_URL is inherited; preserve data/community.sqlite and its sidecars between runs. Railway requires PostgreSQL and supplies its database secrets at runtime. No accounts, database or credentials are included in this package; only the bounded policy artifact crosses from dev to production.

Host review is optional: supply TOUCH_OF_DEATH_MODERATOR_TOKEN (32–128 URL-safe characters) and TOUCH_OF_DEATH_REVIEWER_ID privately before starting. Visit /moderation and enter that token there. Never place it in a player invitation or this package. Static moderation.js is prebuilt; no source checkout is needed. Optional TOUCH_OF_DEATH_VOICE_CONFIG retains the existing bounded ICE configuration; default has no external servers.

Keep project, game.html and host.js together: the manifest records content, protocol and file hashes. Guest admission uses HttpOnly cookies and one-use socket tokens. Anonymous replay archive endpoints stay disabled. No game source or exported HTML was patched during packaging. Configured Clerk hosting adds its exact frontend origin to the in-memory response CSP, leaving exported files and runtime/project bytes intact. Production Clerk keys require a game domain belonging to the production instance; configure custom DNS before switching TOUCH_OF_DEATH_PUBLIC_ORIGIN.
`; }
export function readPackageArguments(args: string[]) {
  const values = new Map<string, string>();for (let index = 0; index < args.length; index += 2) { const key = args[index]!, value = args[index + 1];if (!['--project', '--html', '--out', '--policy-db', '--runtime-entry', '--runtime-cwd'].includes(key) || values.has(key) || !value || value.startsWith('--')) throw new Error('Use --project <directory> --html <export.html> --out <new-directory> [--policy-db <sqlite-file>].');values.set(key, value); }
  if (values.has('--runtime-entry') !== values.has('--runtime-cwd')) throw new Error('Provide both --runtime-entry and --runtime-cwd.');
  if (['--project', '--html', '--out'].some(key => !values.has(key))) throw new Error('Expected --project, --html and --out.');return { projectRoot: values.get('--project')!, artifactPath: values.get('--html')!, outputDirectory: values.get('--out')!, ...(values.has('--runtime-entry') ? { runtimeBuild: { entrypoint: values.get('--runtime-entry')!, cwd: values.get('--runtime-cwd')! } } : {}), ...(values.has('--policy-db') ? { policyDatabasePath: values.get('--policy-db')! } : {}) };
}
if (import.meta.main) console.log(JSON.stringify(await buildTouchOfDeathPackage(readPackageArguments(process.argv.slice(2))), null, 2));
