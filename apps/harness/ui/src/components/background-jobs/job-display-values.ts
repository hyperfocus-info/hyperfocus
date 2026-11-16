


export function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function formatShare(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function compareOptionalIsoAsc(left?: string, right?: string) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

export function isSchedulerHeartbeatStale(schedulerHeartbeatAt?: string) {
  if (!schedulerHeartbeatAt) {
    return false;
  }
  const timestamp = Date.parse(schedulerHeartbeatAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp > 60_000;
}

export function fuzzyTokenMatch(haystack: string, token: string) {
  let cursor = 0;
  for (const char of token) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor < 0) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

export function isRightAlignedHealthHeader(header: string) {
  return ["Count", "Share", "Runs", "Avg chars", "Streak"].includes(header);
}
