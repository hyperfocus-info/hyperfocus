import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..'), schema = resolve(root, 'src/replay/proto');
const output = resolve(schema, 'generated'), executable = process.platform === 'win32' ? '.exe' : '';
mkdirSync(output, { recursive: true });
const result = spawnBackgroundProcessSync({
  cmd: [resolve(root, `node_modules/grpc-tools/bin/protoc${executable}`),
    `--plugin=protoc-gen-es=${resolve(root, `node_modules/.bin/protoc-gen-es${executable}`)}`,
    `--proto_path=${schema}`, `--es_out=target=ts,import_extension=ts:${output}`, 'replay.proto'],
  cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 30000,
});
if (result.exitCode !== 0) throw new Error(result.stderr?.toString() || 'Replay schema generation failed');
renameSync(resolve(output, 'replay_pb.ts'), resolve(output, 'replay-pb.ts'));
