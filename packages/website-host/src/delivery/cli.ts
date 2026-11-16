import { dirname, resolve } from 'node:path';
import { mkdir, open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { spawnBackgroundProcess, terminateProcessTree } from '@hyperfocus/desktop-runtime/process';
import { verifyArtifact } from './artifact';
import { railwayTargetSchema, uploadRailway, waitForRailway, verifyRailwayTarget } from './railway';

export async function runArtifactDeployment({ directory, schema, args = Bun.argv.slice(2) }: { directory: string; schema: string; args?: string[] }) {
  const { values } = parseArgs({ args, options: { target: { type: 'string' }, out: { type: 'string' }, check: { type: 'boolean' }, wait: { type: 'boolean' }, help: { type: 'boolean' } }, strict: true });
  if (values.help) { console.log('deploy --check | --target <target.json> --out <receipt.json> [--wait]. Target: projectId, environmentId, serviceId. Uploads the verified artifact only.'); return; }
  const artifact = await verifyArtifact({ directory, schema });
  if (values.check) { console.log(JSON.stringify({ passed: true, artifactHash: artifact.artifactHash, files: artifact.receipt.files.length })); return; }
  if (!values.target || !values.out) throw new Error('Use --target <target.json> --out <receipt.json>, or --check for local validation.');
  if (await Bun.file(values.out).exists()) throw new Error('A receipt already exists at --out. Inspect its deployment before choosing a new candidate or output.');
  const target = railwayTargetSchema.parse(await Bun.file(values.target).json());
  const output = resolve(values.out);
  if (output.startsWith(artifact.directory + '/') || output.startsWith(artifact.directory + '\\')) throw new Error('Keep deployment receipts outside the immutable artifact.');
  const run = async (args: string[]) => {
    const child = spawnBackgroundProcess({ cmd: [process.env.RAILWAY_BIN || 'railway', ...args], cwd: artifact.directory, env: { ...process.env, CI: '1' }, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => void terminateProcessTree({ process: child }), 120_000);
    try {
      const read = async (stream: ReadableStream<Uint8Array> | null) => { if (!stream) return ''; const reader = stream.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0; while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 4_194_304) { await terminateProcessTree({process:child}); throw new Error('Provider output exceeded its limit.'); } text += decoder.decode(part.value,{stream:true}); } return text; };
      const [stdout, , code] = await Promise.all([read(child.stdout), read(child.stderr), child.exited]);
      if (code || stdout.length > 4_194_304) throw new Error('Railway command failed or exceeded its output limit. Inspect the target before retrying.');
      return stdout;
    } finally { clearTimeout(timer); if (child.exitCode === null) await terminateProcessTree({ process: child }); }
  };
  await verifyRailwayTarget({target,run});
  await mkdir(dirname(output), { recursive: true });
  const receipt: { schema: string; artifactHash: string; target: typeof target; deployment: null | { id: string; status: string }; phase: string; startedAt: string } = { schema: 'hyperfocus-deployment-receipt-v1', artifactHash: artifact.artifactHash, target, deployment: null, phase: 'uploading', startedAt: new Date().toISOString() };
  const handle = await open(output, 'wx');
  try { await handle.writeFile(JSON.stringify(receipt, null, 2)); } finally { await handle.close(); }
  receipt.deployment = await uploadRailway({ directory: artifact.directory, target, run, message: `artifact:${artifact.artifactHash}`, includeIgnoredAssets: true });
  receipt.phase = 'uploaded'; await Bun.write(output, JSON.stringify(receipt, null, 2));
  if (values.wait) {
    receipt.deployment = await waitForRailway({ id: receipt.deployment.id, target, run });
    receipt.phase = 'provider-healthy'; await Bun.write(output, JSON.stringify(receipt, null, 2));
  }
  console.log(JSON.stringify(receipt));
}
