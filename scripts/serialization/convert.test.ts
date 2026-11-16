import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { toBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { convertFile } from './convert.ts';
import { loadSchema } from './schema.ts';

async function temporary(run: (root: string) => Promise<void>) {
  const local = join(import.meta.dir, '.local');mkdirSync(local, { recursive: true });
  const root = mkdtempSync(join(local, 'convert-test-'));
  try { await run(root); }
  finally { if (dirname(root) !== resolve(local)) throw Error('Unexpected fixture path');rmSync(root, { recursive: true, force: true }); }
}

test('arbitrary schema conversion resolves imports and preserves int64, bytes, enums, maps and optional zero', () => temporary(async root => {
  writeFileSync(join(root, 'child.proto'), 'syntax="proto3"; package demo; message Child { string text=1; }');
  writeFileSync(join(root, 'main.proto'), 'syntax="proto3"; package demo; import "child.proto"; import "google/protobuf/any.proto"; message Sample { int64 id=1; bytes data=2; enum Mode { OFF=0; ON=1; } Mode mode=3; repeated Child children=4; map<string, string> labels=5; optional int32 zero=6; google.protobuf.Any extra=7; }');
  const original = { id: '9223372036854775807', data: 'AAH/', mode: 'ON', children: [{ text: '你好' }], labels: { a: 'b' }, zero: 0,
    extra: { '@type': 'type.googleapis.com/demo.Child', text: 'nested Any' } };
  const input = join(root, 'input.json'), binary = join(root, 'data.pb'), output = join(root, 'output.json');
  writeFileSync(input, JSON.stringify(original));
  const options = ['--proto', join(root, 'main.proto'), '--type', 'demo.Sample', '--include', root];
  await convertFile(['to-protobuf', '--input', input, '--output', binary, ...options]);
  const { registry } = loadSchema({ proto: join(root, 'main.proto'), type: 'demo.Sample' });
  const descriptor = join(root, 'descriptor.pb');
  writeFileSync(descriptor, toBinary(FileDescriptorSetSchema, { $typeName: 'google.protobuf.FileDescriptorSet', file: [...registry.files].map(file => file.proto) }));
  await convertFile(['to-json', '--input', binary, '--output', output, '--descriptor', descriptor, '--type', 'demo.Sample']);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(original);
  await expect(convertFile(['to-json', '--input', binary, '--output', output, ...options])).rejects.toThrow('EEXIST');
  writeFileSync(input, '{"invented":true}');
  await expect(convertFile(['to-protobuf', '--input', input, '--output', join(root, 'bad.pb'), ...options])).rejects.toThrow();
  expect(() => loadSchema({ proto: join(root, 'main.proto'), type: 'missing.Message' })).toThrow('not found');
}));

test('repository value and replay shortcuts round-trip without a supplied schema', () => temporary(async root => {
  const values = { value: { greeting: 'hello', count: 1, unset: null, array: [false, 3] },
    replay: { recording: { version: 2, mode: 'training', matchId: 'match', contentId: 'test', seed: 7, seats: ['one', 'two'], frames: [] }, stoppedReason: '' } };
  for (const [format, value] of Object.entries(values)) {
    const input = join(root, `${format}.json`), binary = join(root, `${format}.pb`), output = join(root, `${format}-out.json`);
    writeFileSync(input, JSON.stringify(value));
    await convertFile(['to-protobuf', '--input', input, '--output', binary, '--format', format]);
    await convertFile(['to-json', '--input', binary, '--output', output, '--format', format]);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(value);
    await expect(convertFile(['to-protobuf', '--input', input, '--output', input, '--format', format])).rejects.toThrow('EEXIST');
    expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual(value);
    await expect(convertFile(['to-json', '--input', binary, '--output', join(root, 'large.json'), '--format', format, '--max-bytes', '1'])).rejects.toThrow('Input exceeds');
  }
}));
