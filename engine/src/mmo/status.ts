export type MmoStatusTokenOptions = {
  delimiter?: string;
  maxLength?: number;
  maxEntries?: number;
};

export type MmoStatusState = {
  id: string;
  stacks?: number;
  durationMs?: number;
  sourceId?: string;
  tags?: readonly string[];
};

export type MmoStatusBitmaskOptions = {
  exact?: Readonly<Record<string, number>>;
  prefixes?: Readonly<Record<string, number>>;
  delimiter?: string;
};

const DEFAULT_DELIMITER = "|";
const DEFAULT_MAX_LENGTH = 256;
const DEFAULT_MAX_ENTRIES = 16;

function positiveOption(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function tokenOptions(options: MmoStatusTokenOptions = {}) {
  return {
    delimiter: options.delimiter || DEFAULT_DELIMITER,
    maxLength: positiveOption(options.maxLength, DEFAULT_MAX_LENGTH),
    maxEntries: positiveOption(options.maxEntries, DEFAULT_MAX_ENTRIES)
  };
}

export function parseMmoStatusTokens(value: string | undefined, options: Pick<MmoStatusTokenOptions, "delimiter"> = {}) {
  const delimiter = options.delimiter || DEFAULT_DELIMITER;
  return (value || "").split(delimiter).filter(Boolean);
}

export function joinMmoStatusTokens(tokens: readonly string[], options: MmoStatusTokenOptions = {}) {
  const config = tokenOptions(options);
  const selected: string[] = [];
  let length = 0;
  for (let index = tokens.length - 1; index >= 0 && selected.length < config.maxEntries; index -= 1) {
    const token = tokens[index];
    if (!token || token.includes(config.delimiter)) continue;
    const nextLength = length + token.length + (selected.length > 0 ? config.delimiter.length : 0);
    if (nextLength > config.maxLength) continue;
    selected.push(token);
    length = nextLength;
  }
  selected.reverse();
  return selected.join(config.delimiter);
}

export function hasMmoStatus(value: string | undefined, statusId: string, options: Pick<MmoStatusTokenOptions, "delimiter"> = {}) {
  if (!value) return false;
  return parseMmoStatusTokens(value, options).includes(statusId);
}

export function addMmoStatus(value: string | undefined, statusId: string, options: MmoStatusTokenOptions = {}) {
  const tokens = parseMmoStatusTokens(value, options);
  if (!tokens.includes(statusId)) tokens.push(statusId);
  return joinMmoStatusTokens(tokens, options);
}

export function removeMmoStatus(value: string | undefined, statusId: string, options: MmoStatusTokenOptions = {}) {
  if (!value) return "";
  return joinMmoStatusTokens(parseMmoStatusTokens(value, options).filter((token) => token !== statusId), options);
}

export function mmoStatusStacks(value: string | undefined, prefix: string, options: Pick<MmoStatusTokenOptions, "delimiter"> = {}) {
  if (!value) return 0;
  const entry = parseMmoStatusTokens(value, options).find((token) => token.startsWith(`${prefix}:`));
  if (!entry) return 0;
  const stacks = Number(entry.slice(prefix.length + 1));
  if (!Number.isFinite(stacks) || stacks <= 0) return 0;
  const normalized = Math.floor(stacks);
  return Number.isSafeInteger(normalized) ? normalized : 0;
}

export function mmoStatusBitmask(value: string | undefined, options: MmoStatusBitmaskOptions = {}) {
  if (!value) return 0;
  let mask = 0;
  for (const token of parseMmoStatusTokens(value, options)) {
    if (options.exact && Object.prototype.hasOwnProperty.call(options.exact, token)) mask |= options.exact[token] ?? 0;
    const separator = token.indexOf(":");
    const prefix = token.slice(0, separator);
    if (separator > 0 && options.prefixes && Object.prototype.hasOwnProperty.call(options.prefixes, prefix)) {
      mask |= options.prefixes[prefix] ?? 0;
    }
  }
  return mask >>> 0;
}

export function hasMmoStatusBit(mask: number | undefined, bit: number) {
  const normalizedBit = bit >>> 0;
  if (normalizedBit === 0 || mask === undefined || !Number.isFinite(mask)) return false;
  return ((mask >>> 0) & normalizedBit) === normalizedBit;
}

export function setMmoStatusStacks(value: string | undefined, prefix: string, stacks: number, options: MmoStatusTokenOptions = {}) {
  const flooredStacks = Number.isFinite(stacks) && stacks > 0 ? Math.floor(stacks) : 0;
  const normalizedStacks = Number.isSafeInteger(flooredStacks) ? flooredStacks : 0;
  if (!value) return normalizedStacks > 0 ? joinMmoStatusTokens([`${prefix}:${normalizedStacks}`], options) : "";
  const tokens = parseMmoStatusTokens(value, options).filter((token) => !token.startsWith(`${prefix}:`));
  if (normalizedStacks > 0) tokens.push(`${prefix}:${normalizedStacks}`);
  return joinMmoStatusTokens(tokens, options);
}

export function consumeMmoStatusStack(value: string | undefined, prefix: string, options: MmoStatusTokenOptions = {}) {
  const stacks = mmoStatusStacks(value, prefix, options);
  if (stacks <= 0) return { value: value || "", consumed: false };
  return { value: setMmoStatusStacks(value, prefix, stacks - 1, options), consumed: true };
}

export function tickMmoStatusBag(statuses: Record<string, MmoStatusState>, dtMs: number) {
  const elapsed = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  for (const [id, status] of Object.entries(statuses)) {
    if (status.durationMs === undefined) continue;
    if (!Number.isFinite(status.durationMs) || status.durationMs <= 0) {
      delete statuses[id];
      continue;
    }
    status.durationMs = Math.max(0, status.durationMs - elapsed);
    if (status.durationMs <= 0) delete statuses[id];
  }
  return statuses;
}
