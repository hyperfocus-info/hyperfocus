import { createFileRegistry, fromBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadSchema(options: { proto?: string; descriptor?: string; type: string; includes?: string[] }) {
  if (Boolean(options.proto) === Boolean(options.descriptor)) throw new Error('Choose exactly one --proto or --descriptor.');
  let bytes: Uint8Array;
  if (options.descriptor) bytes = readFileSync(options.descriptor);
  else {
    if (!options.proto) throw new Error('Missing --proto.');
    const local = join(import.meta.dir, '.local');mkdirSync(local, { recursive: true });
    const temporary = mkdtempSync(join(local, 'descriptor-'));
    try {
      const schema = resolve(options.proto), output = join(temporary, 'schema.pb');
      const compiler = join(dirname(fileURLToPath(import.meta.resolve('grpc-tools/package.json'))), 'bin');
      const result = spawnBackgroundProcessSync({
        cmd: [join(compiler, process.platform === 'win32' ? 'protoc.exe' : 'protoc'),
          `--descriptor_set_out=${output}`, '--include_imports',
          ...[...(options.includes ?? []), dirname(schema), compiler].map(path => `--proto_path=${resolve(path)}`), schema],
        cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', timeout: 30000,
      });
      if (result.exitCode !== 0) throw new Error(result.stderr?.toString() || 'Schema compilation failed.');
      bytes = readFileSync(output);
    } finally {
      // mkdtemp creates this absolute direct child; only owned compiler output is removed.
      if (dirname(temporary) !== resolve(local)) throw new Error('Unexpected descriptor temporary path.');
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  if (bytes.byteLength > 16777216) throw new Error('Descriptor set exceeds 16 MiB.');
  const registry = createFileRegistry(fromBinary(FileDescriptorSetSchema, bytes, { recursionLimit: 64 }));
  const schema = registry.getMessage(options.type.replace(/^\./, ''));
  if (!schema) throw new Error(`Message type not found: ${options.type}`);
  return { schema, registry };
}
