
export function formatBpm(bpm: number) {
  return `${Math.max(20, Math.min(320, Math.round(bpm)))} BPM`;
}
