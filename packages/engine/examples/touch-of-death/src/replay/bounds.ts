import { BinaryReader, WireType } from '@bufbuild/protobuf/wire';

type Fields = Record<number, { max: number; nested?: Fields }>;
const frame: Fields = { 1: { max: 24 }, 4: { max: 24 } };
const fighter: Fields = { 3: { max: 24 } };
const recording: Fields = { 5: { max: 2 }, 6: { max: 36000, nested: frame } };
const appearance: Fields = { 2: { max: 1, nested: fighter }, 3: { max: 1, nested: fighter } };
const archive: Fields = { 1: { max: 1, nested: recording }, 3: { max: 1, nested: appearance } };

/** Check repeated message counts before the generated decoder allocates objects. */
export function boundReplayWire(bytes: Uint8Array) {
  let tags = 0;
  function visit(bytes: Uint8Array, fields: Fields) {
    const reader = new BinaryReader(bytes), counts = new Map<number, number>();
    while (reader.pos < reader.len) {
      if (++tags > 2000000) throw new Error('Replay protobuf structure limit exceeded.');
      const [number, wire] = reader.tag(), field = fields[number];
      if (field) {
        const count = (counts.get(number) ?? 0) + 1;counts.set(number, count);
        if (count > field.max) throw new Error('Replay protobuf field count limit exceeded.');
      }
      if (field?.nested && wire === WireType.LengthDelimited) visit(reader.bytes(), field.nested);
      else reader.skip(wire, number, 8);
    }
  }
  visit(bytes, archive);
}
