export type TimingSyncValueMode = "period-seconds" | "period-ms" | "period-hz";
export type TimingSyncControlAction = "enabled" | "division";

const TIMING_SYNC_CONTROL_PREFIX = "__timing_sync__:";

export const TIMING_SYNC_LABELS = [
  "1/32",
  "1/32T",
  "1/32d",
  "1/16",
  "1/16T",
  "1/16d",
  "1/8",
  "1/8T",
  "1/8d",
  "1/4",
  "1/4T",
  "1/4d",
  "1/2",
  "1/2T",
  "1/2d",
  "1 bar",
  "2 bars",
  "4 bars",
  "8 bars",
  "16 bars",
] as const;

export const TIMING_SYNC_BEATS = [
  0.125,
  1 / 12,
  0.1875,
  0.25,
  1 / 6,
  0.375,
  0.5,
  1 / 3,
  0.75,
  1,
  2 / 3,
  1.5,
  2,
  4 / 3,
  3,
  4,
  8,
  16,
  32,
  64,
] as const;

export const DEFAULT_SYNC_BPM = 120;

export function clampTimingSyncDivisionIndex(index: number, maximumIndex = TIMING_SYNC_LABELS.length - 1) {
  const safeMaximumIndex = Math.max(0, Math.min(TIMING_SYNC_LABELS.length - 1, Math.round(maximumIndex)));
  const safeIndex = Number.isFinite(index) ? Math.round(index) : 0;
  return Math.max(0, Math.min(safeMaximumIndex, safeIndex));
}

export function getTimingSyncLabel(index: number) {
  return TIMING_SYNC_LABELS[clampTimingSyncDivisionIndex(index)] ?? TIMING_SYNC_LABELS[0];
}

export function getTimingSyncBeats(index: number) {
  return TIMING_SYNC_BEATS[clampTimingSyncDivisionIndex(index)] ?? TIMING_SYNC_BEATS[0];
}

export function beatsToTimingValue(beats: number, mode: TimingSyncValueMode, bpm = DEFAULT_SYNC_BPM) {
  const safeBeats = Math.max(1 / 32, Number.isFinite(beats) ? beats : 0.25);
  const safeBpm = Math.max(20, Number.isFinite(bpm) ? bpm : DEFAULT_SYNC_BPM);
  const seconds = (60 / safeBpm) * safeBeats;
  switch (mode) {
    case "period-seconds":
      return seconds;
    case "period-ms":
      return seconds * 1000;
    case "period-hz":
      return 1 / Math.max(seconds, 1e-6);
    default:
      return seconds;
  }
}

export function timingValueToBeats(value: number, mode: TimingSyncValueMode, bpm = DEFAULT_SYNC_BPM) {
  const safeValue = Math.max(1e-6, Number.isFinite(value) ? value : 0);
  const safeBpm = Math.max(20, Number.isFinite(bpm) ? bpm : DEFAULT_SYNC_BPM);
  switch (mode) {
    case "period-seconds":
      return safeValue * safeBpm / 60;
    case "period-ms":
      return (safeValue / 1000) * safeBpm / 60;
    case "period-hz":
      return (1 / safeValue) * safeBpm / 60;
    default:
      return safeValue * safeBpm / 60;
  }
}

export function findNearestTimingSyncDivisionIndex(value: number, mode: TimingSyncValueMode, bpm = DEFAULT_SYNC_BPM) {
  const targetBeats = timingValueToBeats(value, mode, bpm);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < TIMING_SYNC_BEATS.length; index += 1) {
    const distance = Math.abs(targetBeats - TIMING_SYNC_BEATS[index]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function buildTimingSyncControlKey(controlKey: string, action: TimingSyncControlAction) {
  return `${TIMING_SYNC_CONTROL_PREFIX}${controlKey}:${action}`;
}

export function parseTimingSyncControlKey(key: string) {
  if (!key.startsWith(TIMING_SYNC_CONTROL_PREFIX)) {
    return null;
  }

  const payload = key.slice(TIMING_SYNC_CONTROL_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const controlKey = payload.slice(0, separatorIndex);
  const action = payload.slice(separatorIndex + 1);
  if (action !== "enabled" && action !== "division") {
    return null;
  }

  return { controlKey, action };
}
