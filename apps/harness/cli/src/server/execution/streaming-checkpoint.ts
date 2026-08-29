export function shouldPersistStreamingCheckpoint(options: {
  force: boolean;
  hasChanges: boolean;
  elapsedMs: number;
  intervalMs: number;
}) {
  if (!options.hasChanges) return false;
  return options.force || options.elapsedMs >= options.intervalMs;
}
