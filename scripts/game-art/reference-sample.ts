import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { requireText } from '@hyperfocus/utilities/text';
import { readDictionary, readObject, readTuple, requireArray, requireNumber } from '@hyperfocus/utilities/validation';

const label = (value: unknown) => {
  const text = requireText(value).trim();
  if (!text) throw new Error('Reference labels must not be empty');
  return text;
};

/** Measures annotated image-plane distances; does not infer anatomy or 3D scale. */
export function sampleReference(options: { annotation: unknown }) {
  const source = readObject(options.annotation, {
    image: label,
    source: label,
    view: label,
    width: value => requireNumber(value, { minimum: 1, integer: true }),
    height: value => requireNumber(value, { minimum: 1, integer: true }),
    uncertaintyPixels: value => requireNumber(value, { minimum: 0 }),
    points: value => readDictionary(value, point => readTuple(point, [requireNumber, requireNumber])),
    ratios: value => requireArray(value, { minimum: 1 }),
  });
  const points = Object.entries(source.points);
  if (points.length < 2) throw new Error('Reference needs at least two landmarks');
  for (const [id, [x, y]] of points) {
    if (!id.trim() || x < 0 || x > source.width || y < 0 || y > source.height) {
      throw new Error(`Landmark outside the declared image: ${id}`);
    }
  }
  const distance = (value: unknown) => {
    const ids = readTuple(value, [label, label]);
    const ends = ids.map(id => {
      if (!Object.hasOwn(source.points, id)) throw new Error(`Unknown landmark: ${id}`);
      return source.points[id]!;
    });
    return { points: ids, pixels: Math.hypot(ends[0]![0] - ends[1]![0], ends[0]![1] - ends[1]![1]) };
  };
  const names = new Set<string>();
  const ratios = source.ratios.map(value => {
    const row = readObject(value, { id: label, numerator: distance, denominator: distance });
    if (names.has(row.id)) throw new Error(`Duplicate ratio: ${row.id}`);
    names.add(row.id);
    const error = 2 * source.uncertaintyPixels;
    const a = row.numerator.pixels, b = row.denominator.pixels;
    if (b <= error) throw new Error(`Denominator too small for landmark uncertainty: ${row.id}`);
    return { id: row.id, numerator: row.numerator, denominator: row.denominator,
      ratio: a / b, interval: [Math.max(0, a - error) / (b + error), (a + error) / (b - error)] };
  });
  return { image: source.image, source: source.source, view: source.view,
    width: source.width, height: source.height, dimensionsSource: 'annotator',
    uncertaintyPixels: source.uncertaintyPixels,
    points: source.points,
    normalizedPoints: Object.fromEntries(points.map(([id, [x, y]]) => [id, [x / source.width, y / source.height]])),
    ratios, measurementSpace: 'image-plane', approval: false };
}

export async function sampleReferenceFile(options: { annotationPath: string }) {
  const path = resolve(options.annotationPath);
  const annotationBytes = await Bun.file(path).bytes();
  const annotation: unknown = JSON.parse(new TextDecoder().decode(annotationBytes));
  const result = sampleReference({ annotation });
  const image = resolve(dirname(path), result.image);
  const bytes = await Bun.file(image).bytes();
  // Bind both the inspected image and exact landmark input. Never rewrite either.
  return { ...result, image, imageSha256: createHash('sha256').update(bytes).digest('hex'),
    annotationSha256: createHash('sha256').update(annotationBytes).digest('hex') };
}

if (import.meta.main) {
  const [annotationPath, output, ...extra] = process.argv.slice(2);
  if (!annotationPath || extra.length) throw new Error('Usage: bun scripts/game-art/reference-sample.ts <landmarks.json> [new-measurement.json]');
  const json = JSON.stringify(await sampleReferenceFile({ annotationPath }), null, 2);
  if (output) await writeFile(resolve(output), `${json}\n`, { encoding: 'utf8', flag: 'wx' });
  else console.log(json);
}
