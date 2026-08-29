export const meterDbFromMix = (value: number) => -48 + value * 42;

export function createMeterVisual(valueDb: number, stereoEnabled: boolean, leftValueDb?: number, rightValueDb?: number) {
  const hasStereoValues = typeof leftValueDb === "number" && typeof rightValueDb === "number";
  return {
    valueDb,
    ...(hasStereoValues ? { leftValueDb, rightValueDb } : {}),
    stereo: stereoEnabled && hasStereoValues,
  };
}
