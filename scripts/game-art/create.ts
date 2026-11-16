import { resolve } from 'node:path';
import { execute, managedSurface } from './execute.ts';

const args = process.argv.slice(2), root = resolve(import.meta.dir, '../..');
if (!args.length) throw new Error('Usage: art:create <brief.json> [--project <directory>] [--plan] [--build-only] [--retry] | --catalog');
const needsSurface = resolve(process.cwd()) === root && !args.some(a => ['--catalog', '--plan', '--build-only', '--url'].includes(a));
const surface = needsSurface ? await managedSurface({ root, surface: 'editor' }) : undefined;
try {
  const result = await execute({ root: process.cwd(), args: [resolve(root, 'apps/engine-editor/cli.ts'), 'art', ...args, ...(surface ? ['--url', surface.url] : [])], timeoutSeconds: 240 });
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode = result.code;
} finally { await surface?.close(); }
