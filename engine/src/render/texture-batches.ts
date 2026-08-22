export interface TextureBatchRange {
  start: number;
  count: number;
  textureCount: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

/**
 * Splits ordered draw texture handles into ranges that never require more than
 * maxTextureUnits resident textures. Negative handles mean an untextured draw.
 * Existing output objects are reused when supplied.
 */
function planWithSet(
  textureHandles: ArrayLike<number>,
  maxTextureUnits: number,
  output: TextureBatchRange[],
  active: Set<number>
): TextureBatchRange[] {
  positiveInteger(maxTextureUnits, "maxTextureUnits");
  active.clear();
  let batchStart = 0;
  let outputLength = 0;

  for (let index = 0; index < textureHandles.length; index += 1) {
    const handle = textureHandles[index];
    if (!Number.isSafeInteger(handle)) throw new RangeError(`texture handle at ${index} must be a safe integer.`);
    if (handle < 0 || active.has(handle)) continue;
    if (active.size === maxTextureUnits) {
      let batch = output[outputLength];
      if (!batch) output[outputLength] = batch = { start: 0, count: 0, textureCount: 0 };
      batch.start = batchStart;
      batch.count = index - batchStart;
      batch.textureCount = active.size;
      outputLength += 1;
      batchStart = index;
      active.clear();
    }
    active.add(handle);
  }
  if (batchStart < textureHandles.length) {
    let batch = output[outputLength];
    if (!batch) output[outputLength] = batch = { start: 0, count: 0, textureCount: 0 };
    batch.start = batchStart;
    batch.count = textureHandles.length - batchStart;
    batch.textureCount = active.size;
    outputLength += 1;
  }
  output.length = outputLength;
  return output;
}

export class TextureUnitBatchPlanner {
  readonly #active = new Set<number>();

  plan(textureHandles: ArrayLike<number>, maxTextureUnits: number, output: TextureBatchRange[] = []): TextureBatchRange[] {
    return planWithSet(textureHandles, maxTextureUnits, output, this.#active);
  }
}

export function planTextureUnitBatches(
  textureHandles: ArrayLike<number>,
  maxTextureUnits: number,
  output: TextureBatchRange[] = []
): TextureBatchRange[] {
  return planWithSet(textureHandles, maxTextureUnits, output, new Set<number>());
}

export function createTextureUnitBatchPlanner(): TextureUnitBatchPlanner {
  return new TextureUnitBatchPlanner();
}
