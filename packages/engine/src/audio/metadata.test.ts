import { expect, test } from 'bun:test';
import { readAudioMetadata } from './metadata.ts';
import { id3Frame, id3Size, id3Tag } from './metadata-fixture.ts';
import { schedulingFixture } from './scheduling-fixture.ts';

test('TBPM reads actual FL Studio v2.3 UTF-8/Latin1 form and v2.4 text encodings with precise provenance', () => {
  for (const version of [3, 4]) for (const payload of [[0, 49, 50, 56], [3, 49, 50, 56], [1, 255, 254, 49, 0, 50, 0, 56, 0, 0, 0], [1, 254, 255, 0, 49, 0, 50, 0, 56], [2, 0, 49, 0, 50, 0, 56]]) {
    const bytes = id3Tag({ version, body: id3Frame({ version, payload }) });
    expect(readAudioMetadata({ bytes })).toEqual({ bpm: 128, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource: `ID3v2.${version}/TBPM` });
    expect(readAudioMetadata({ bytes: bytes.buffer })).toEqual(readAudioMetadata({ bytes }));
  }
  const latin = id3Tag({ body: id3Frame({ payload: [0, 32, 57, 55, 46, 53, 0] }) });
  const padded = new Uint8Array(latin.length + 30);padded.set(latin, 15);
  expect(readAudioMetadata({ bytes: padded.subarray(15, 15 + latin.length) })?.bpm).toBe(97.5);
});

test('TBPM skips unrelated frames and handles extended headers, grouping and unsynchronization', () => {
  for (const version of [3, 4]) {
    const extended = version === 3 ? [...id3Size(6, false), 0, 0, 0, 0, 0, 0] : [...id3Size(6, true), 1, 0];
    const unrelated = id3Frame({ version, id: 'TIT2', payload: [0, 65, 255, 225] });
    const grouped = id3Frame({ version, flags: version === 3 ? 32 : 64, payload: [9, 3, 49, 50, 48] });
    let body = [...extended, ...unrelated, ...grouped];
    if (version === 3) body = body.flatMap(byte => byte === 255 ? [255, 0] : [byte]);
    expect(readAudioMetadata({ bytes: id3Tag({ version, flags: 192, body }) })?.bpm).toBe(120);
  }
  expect(readAudioMetadata({ bytes: id3Tag({ version: 4, body: id3Frame({ version: 4, flags: 1, payload: [...id3Size(4, true), 3, 49, 50, 48] }) }) })?.bpm).toBe(120);
});

test('malformed, missing and resource-excessive tags never masquerade as BPM metadata', () => {
  const invalid: Uint8Array[] = [new Uint8Array(), new Uint8Array([73, 68, 51]), id3Tag({ version: 2 }), id3Tag({ version: 5 }), id3Tag({ flags: 1 }), id3Tag({ body: [] }), id3Tag({ body: id3Frame({ id: 'TXXX' }) })];
  for (const payload of [[3], [3, 48], [3, 51, 48, 49], [3, 49, 50, 48, 66, 80, 77], [3, 49, 50, 48, 0, 49], [3, 78, 97, 78], [3, 45, 49, 50, 48], [1, 49, 0, 50, 0, 48, 0], [2, 0, 49, 0], [7, 49, 50, 48], [3, 49, 50, 48, 255]]) invalid.push(id3Tag({ body: id3Frame({ payload }) }));
  const truncated = id3Tag();invalid.push(truncated.subarray(0, truncated.length - 1));
  const badHeader = id3Tag();badHeader[6] = 128;invalid.push(badHeader);
  const badFrame = id3Tag({ version: 4 });badFrame[14] = 128;invalid.push(badFrame);
  const inflated = id3Tag();inflated[17] = 100;invalid.push(inflated);
  invalid.push(id3Tag({ flags: 64, body: [...id3Size(100, false), 0, 0, 0, 0, 0, 0] }));
  for (const version of [3, 4]) invalid.push(id3Tag({ version, body: id3Frame({ version, flags: version === 3 ? 192 : 12 }) }));
  const excessive = new Uint8Array(1048590);excessive.set([73, 68, 51, 3, 0, 0, ...id3Size(1048577, true)]);invalid.push(excessive);
  invalid.push(id3Tag({ body: [...Array.from({ length: 256 }, () => id3Frame({ id: 'TIT2' })).flat(), ...id3Frame({})] }));
  for (const bytes of invalid) expect(readAudioMetadata({ bytes })).toBeUndefined();
});

test('decode exposes isolated tagged metadata only for the bounded cached buffer and replacement clears it', async () => {
  const f = await schedulingFixture();await f.engine.decode('tagged', id3Tag());
  const metadata = f.engine.getAudioMetadata('tagged');expect(metadata?.bpm).toBe(120);
  if (metadata) metadata.bpm = 200;expect(f.engine.getAudioMetadata('tagged')?.bpm).toBe(120);
  await f.engine.decode('tagged', new Uint8Array([1, 2, 3]));expect(f.engine.getAudioMetadata('tagged')).toBeUndefined();
  await f.engine.decode('tagged', id3Tag());f.engine.removeBuffer('tagged');expect(f.engine.getAudioMetadata('tagged')).toBeUndefined();
  await f.engine.decode('tagged', id3Tag());for (let i = 0; i < 4; i++) f.cache(`new-${i}`);expect(f.engine.getAudioMetadata('tagged')).toBeUndefined();
  await f.engine.decode('tagged', id3Tag());f.engine.clearDecodedCache();expect(f.engine.getAudioMetadata('tagged')).toBeUndefined();f.engine.dispose();
});
