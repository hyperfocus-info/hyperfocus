import { timeZoneSchema } from './approval-policy';

type Calendar = { year: number; month: number; day: number; hour: number; minute: number; second: number };
function calendar(at: number, timeZone: string): Calendar {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => Number(parts.find(row => row.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}
const utc = (value: Calendar) => Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
function instant(value: Calendar, timeZone: string) {
  const target = utc(value); let candidate = target;
  for (let i = 0; i < 5; i++) { const difference = target - utc(calendar(candidate, timeZone)); if (!difference) break; candidate += difference; }
  if (utc(calendar(candidate, timeZone)) !== target || [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000].some(delta => utc(calendar(candidate + delta, timeZone)) === target)) throw new Error('That local time is missing or ambiguous at a clock change. Use an ISO timestamp with an explicit UTC offset.');
  return candidate;
}

/** Case matters: M is calendar months, m is minutes. No probabilistic date guessing. */
export function parseMute(input: string, options: { timeZone: string; now?: number }) {
  const now = options.now ?? Date.now(), zone = timeZoneSchema.parse(options.timeZone);
  const value = input.trim().replace(/^mute\s+/i, '').trim();
  let until: number;
  const amount = /^(\d{1,5})\s*(m|M|[hHdDwW]|minutes?|hours?|days?|weeks?|months?)$/.exec(value);
  if (amount) {
    const count = Number(amount[1]), unit = amount[2]!;
    if (count <= 0) throw new Error('Choose a positive mute duration.');
    if (unit === 'M' || unit.startsWith('month')) {
      if (count > 24) throw new Error('Choose at most 24 calendar months.');
      const local = calendar(now, zone), month = new Date(Date.UTC(local.year, local.month - 1 + count, 1));
      const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      until = instant({ ...local, year: month.getUTCFullYear(), month: month.getUTCMonth() + 1, day: Math.min(local.day, lastDay) }, zone);
    } else {
      const lower = unit.toLowerCase(), scale = lower.startsWith('w') ? 604800000 : lower.startsWith('d') ? 86400000 : lower.startsWith('h') ? 3600000 : 60000;
      until = now + count * scale;
    }
  } else if (/^(?:until\s+)?(?:tomorrow|tommorow|tommorrow)$/i.test(value)) {
    const local = calendar(now, zone), next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    until = instant({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0 }, zone);
  } else {
    const timestamp = value.replace(/^until\s+/i, '');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(timestamp)) throw new Error('Use mute 1D, 4H, 1W, 2M (months), 5m (minutes), until tomorrow, or an ISO timestamp with UTC offset.');
    const date = timestamp.slice(0, 10), normalized = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(normalized.getTime()) || normalized.toISOString().slice(0, 10) !== date || Number(timestamp.slice(11, 13)) > 23) throw new Error('Use a real calendar date and time.');
    until = Date.parse(timestamp);
  }
  if (!Number.isFinite(until) || until <= now || until - now > 63244800000) throw new Error('Mute must end in the future, within two years.');
  return new Date(until).toISOString();
}
