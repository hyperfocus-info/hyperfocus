const shortStampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

export function formatShortTimestamp(value: Date | number | string | undefined | null) {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  const parts = Object.fromEntries(shortStampFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month} ${parts.day} '${parts.year} - ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

export function resolveBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Account reset timestamps are ISO transport values; countdowns never imply a local reset restores quota. */
export function formatResetCountdown(value: string | undefined, now = Date.now()) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Reset time unavailable";
  const minutes = Math.ceil((Date.parse(value) - now) / 60000);
  if (minutes <= 0) return "Reset due; refresh usage";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days ? `Resets in ${days}d ${hours}h` : hours ? `Resets in ${hours}h ${minutes % 60}m` : `Resets in ${minutes}m`;
}
