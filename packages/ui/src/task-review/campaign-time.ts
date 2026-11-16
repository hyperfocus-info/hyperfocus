/** Elapsed/remaining task display uses whole minutes and seconds, clamped at zero. */
export function formatCampaignDuration(ms: number) {
  return `${Math.floor(Math.max(0, ms) / 60000)}m ${Math.floor(Math.max(0, ms) / 1000) % 60}s`;
}
