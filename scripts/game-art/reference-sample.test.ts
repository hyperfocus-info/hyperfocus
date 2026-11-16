import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleReference, sampleReferenceFile } from './reference-sample';

function annotation(scale = 1) {
  return { image: 'source.svg', source: 'Synthetic measurement fixture', view: 'front, orthographic',
    width: 300 * scale, height: 200 * scale, uncertaintyPixels: scale,
    points: { a: [20 * scale, 20 * scale], b: [80 * scale, 100 * scale], c: [220 * scale, 20 * scale] },
    ratios: [{ id: 'diagonal-to-width', numerator: ['a', 'b'], denominator: ['a', 'c'] }] };
}

test('pixel distances preserve aspect ratio and ratios survive uniform resizing', () => {
  const original = sampleReference({ annotation: annotation() });
  const resized = sampleReference({ annotation: annotation(3) });
  expect(original.ratios[0]!.ratio).toBe(0.5);
  expect(resized.ratios[0]!.ratio).toBe(0.5);
  expect(resized.ratios[0]!.interval).toEqual(original.ratios[0]!.interval);
  expect(resized.normalizedPoints).toEqual(original.normalizedPoints);
  expect(original.ratios[0]!.interval[0]).toBeLessThan(0.5);
  expect(original.ratios[0]!.interval[1]).toBeGreaterThan(0.5);
});

test('uncertain, missing and out-of-frame measurements cannot silently produce a ratio', () => {
  const a = annotation();
  expect(() => sampleReference({ annotation: { ...a, uncertaintyPixels: 100 } })).toThrow('Denominator');
  expect(() => sampleReference({ annotation: { ...a, points: { ...a.points, b: [-1, 20] } } })).toThrow('outside');
  expect(() => sampleReference({ annotation: { ...a, points: { ...a.points, b: [NaN, 20] } } })).toThrow();
  expect(() => sampleReference({ annotation: { ...a, ratios: [{ ...a.ratios[0], numerator: ['a', 'absent'] }] } })).toThrow('Unknown');
  expect(() => sampleReference({ annotation: { ...a, ratios: [a.ratios[0], a.ratios[0]] } })).toThrow('Duplicate');
  expect(() => sampleReference({ annotation: { ...a, ratios: [{ ...a.ratios[0], denominator: ['a', 'a'] }] } })).toThrow('Denominator');
});

test('receipts bind the actual source bytes and annotations without modifying originals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reference-sample-'));
  try {
    const image = join(directory, 'source.svg'), input = join(directory, 'landmarks.json');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><path d="M20 20 L80 100 M20 20 L220 20"/></svg>';
    await Bun.write(image, svg);
    await Bun.write(input, JSON.stringify(annotation()));
    const before = await sampleReferenceFile({ annotationPath: input });
    expect(await Bun.file(image).text()).toBe(svg);
    expect(before.image).toBe(image);
    expect(before.approval).toBe(false);
    await Bun.write(image, svg.replace('L80 100', 'L80 110'));
    const after = await sampleReferenceFile({ annotationPath: input });
    expect(after.imageSha256).not.toBe(before.imageSha256);
    expect(after.annotationSha256).toBe(before.annotationSha256);
    await Bun.write(input, JSON.stringify(annotation(2)));
    expect((await sampleReferenceFile({ annotationPath: input })).annotationSha256).not.toBe(before.annotationSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
