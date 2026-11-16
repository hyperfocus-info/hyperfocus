import { fromBinary, fromJsonString, toBinary, toJsonString } from '@bufbuild/protobuf';
import { decodeValue, encodeValue } from '@hyperfocus/serialization';
import { decodeReplayArchive, encodeReplayArchive } from '@hyperfocus/touch-of-death/replay';
import { open, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadSchema } from './schema.ts';

const help = `Usage: bun run protobuf:convert <to-json|to-protobuf> --input FILE --output FILE [schema]

Schema (choose one):
  --format replay                    Touch of Death HFRP archive / ordinary replay JSON
  --format value                     Hyperfocus HFPB dynamic Value / ordinary JSON
  --proto FILE --type package.Message Compile a .proto schema, including its imports
  --descriptor FILE --type package.Message  Use a FileDescriptorSet with imports included
  --include DIR                      Repeat for .proto import roots

Options:
  --max-bytes N   Input and output bound (default 67108864 = 64 MiB)
  --help         Show this help

Output must be a new file. Raw protobuf is not self-describing: supply its schema
and fully qualified message type. Raw messages use standard ProtoJSON (int64 as
decimal strings, bytes as Base64). JSON conversion cannot retain unknown wire
fields, original field ordering, or external framing/compression. Replay/value
shortcuts handle their versioned envelopes; do not use --proto on those envelopes.
`;

export async function convertFile(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    input: { type: 'string' }, output: { type: 'string' }, format: { type: 'string' },
    proto: { type: 'string' }, descriptor: { type: 'string' }, type: { type: 'string' },
    include: { type: 'string', multiple: true }, 'max-bytes': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) return help;
  const direction = positionals[0];
  if (positionals.length !== 1 || direction !== 'to-json' && direction !== 'to-protobuf') throw new Error('Choose to-json or to-protobuf. Use --help for examples.');
  if (!values.input || !values.output) throw new Error('--input and --output are required.');
  const maxBytes = Number(values['max-bytes'] ?? 67108864);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1073741824) throw new Error('--max-bytes must be between 1 and 1073741824.');
  if (values.format !== undefined && !['replay', 'value'].includes(values.format)) throw new Error('Unknown --format; choose replay or value.');
  if (values.format && (values.proto || values.descriptor || values.type || values.include)) throw new Error('Choose a built-in --format or a schema, not both.');
  if (!values.format && !values.type) throw new Error('Raw protobuf requires --type and --proto or --descriptor; otherwise choose --format.');
  // Bound the read before allocation, including a file that grows after stat.
  const file = await open(values.input, 'r');
  let bytes: Uint8Array;
  try {
    const size = (await file.stat()).size;
    if (size > maxBytes) throw new Error('Input exceeds --max-bytes.');
    const buffer = new Uint8Array(size + 1);let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await file.read(buffer, count, buffer.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count > size) throw new Error('Input changed while reading.');
    bytes = buffer.subarray(0, count);
  } finally { await file.close(); }
  const decodeText = () => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let output: string | Uint8Array;
  if (values.format === 'replay') output = direction === 'to-json'
    ? JSON.stringify(decodeReplayArchive({ bytes }), null, 2) + '\n'
    : encodeReplayArchive({ value: JSON.parse(decodeText()) });
  else if (values.format === 'value') output = direction === 'to-json'
    ? JSON.stringify(decodeValue(bytes, { maxBytes }), null, 2) + '\n'
    : encodeValue(JSON.parse(decodeText()), { maxBytes });
  else {
    const { schema, registry } = loadSchema({ proto: values.proto, descriptor: values.descriptor, type: values.type ?? '', includes: values.include });
    output = direction === 'to-json'
      ? toJsonString(schema, fromBinary(schema, bytes, { recursionLimit: 64 }), { registry, prettySpaces: 2, alwaysEmitImplicit: true }) + '\n'
      : toBinary(schema, fromJsonString(schema, decodeText(), { registry, recursionLimit: 64 }));
  }
  if ((typeof output === 'string' ? Buffer.byteLength(output) : output.byteLength) > maxBytes) throw new Error('Output exceeds --max-bytes.');
  await writeFile(values.output, output, { flag: 'wx' });
  return `Wrote ${values.output}`;
}

if (import.meta.main) {
  try { console.log(await convertFile(process.argv.slice(2))); }
  catch (cause) { console.error(cause instanceof Error ? cause.message : String(cause));process.exitCode = 1; }
}
