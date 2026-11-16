const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Permissive string extraction; no coercion, trimming or validation. */
export function text(value: unknown) { return typeof value === 'string' ? value : ''; }

export function parseBooleanText(value: unknown) {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

type HtmlEscapeOptions = { coerce?: boolean; apostrophe?: '&#39;' | '&#039;' };
export function escapeHtml(value: string, options?: HtmlEscapeOptions): string;
export function escapeHtml(value: unknown, options: HtmlEscapeOptions & { coerce: true }): string;
export function escapeHtml(value: unknown, options?: HtmlEscapeOptions) {
  const input = options?.coerce ? String(value) : value;
  if (typeof input !== 'string') throw new TypeError('HTML escaping requires text.');
  return input.replace(/[&<>"']/g, char => char === "'" && options?.apostrophe ? options.apostrophe : htmlEntities[char]!);
}

export function formatPercent(value: number) { return `${Math.round(value * 100)}%`; }

/** JSON for an inline script context. Serialization errors/undefined still throw. */
export function escapeInlineJson(value: unknown) { return JSON.stringify(value).replaceAll('<', '\\u003c'); }

export function normalizeWhitespace(value: string) { return value.replace(/\s+/g, ' ').trim(); }

export function stringValues(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Encode individual path segments while retaining slash structure. */
export function encodePath(value: string) {
  return value.split('/').map(part => encodeURIComponent(part).replaceAll("'", '%27')).join('/');
}

/** Existing editor display policy: base 1024, one decimal KB/MB, capped at MB. */
export function formatBytes(value: number, options: {
  unit?: 'KB' | 'MB'; places?: number; maximumUnit?: 'MB' | 'GB'; bytesLabel?: 'B' | 'bytes'; nanUnit?: 'bytes' | 'maximum';
} = {}) {
  if (options.unit) return `${(value / (options.unit === 'KB' ? 1024 : 1048576)).toFixed(options.places ?? 1)} ${options.unit}`;
  if (Number.isNaN(value)) return `NaN ${options.nanUnit === 'bytes' ? options.bytesLabel ?? 'B' : options.maximumUnit ?? 'MB'}`;
  if (options.maximumUnit === 'GB' && value >= 1073741824) return `${(value / 1024 / 1024 / 1024).toFixed(options.places ?? 1)} GB`;
  if (value < 1024) return `${value} ${options.bytesLabel ?? 'B'}`;
  if (value < 1048576) return `${(value / 1024).toFixed(options.places ?? 1)} KB`;
  return `${(value / 1024 / 1024).toFixed(options.places ?? 1)} MB`;
}

export function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function compareText(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }

/** Preserves the existing full-max-length XOR comparison. JavaScript execution
 * does not provide a cryptographic constant-time guarantee. */
export function constantTimeTextEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function errorMessage(value: unknown, options: { fallback?: string; stringify?: boolean; acceptStrings?: boolean; nonBlank?: boolean } = {}) {
  const fallback = options.fallback ?? 'Unknown error';
  if (value instanceof Error) return !options.nonBlank || value.message.trim() ? value.message : fallback;
  if (typeof value === 'string') return options.acceptStrings !== false && (!options.nonBlank || value.trim()) ? value : fallback;
  return options.stringify ? String(value) : fallback;
}

/** Checks and optional normalization are independent of error presentation. */
export function readText(value: unknown, options: {
  trim?: boolean; nonBlank?: boolean; min?: number; max?: number; unit?: 'codeUnits' | 'utf8';
} = {}) {
  if (typeof value !== 'string') return;
  const output = options.trim ? value.trim() : value;
  if (options.nonBlank && !output.trim()) return;
  const length = options.unit === 'utf8' ? new TextEncoder().encode(output).byteLength : output.length;
  if (length < (options.min ?? 0) || length > (options.max ?? Infinity)) return;
  return output;
}

export function requireText(value: unknown, options: NonNullable<Parameters<typeof readText>[1]> & { message?: string } = {}) {
  const output = readText(value, options);
  if (output === undefined) throw new Error(options.message ?? 'Expected valid text.');
  return output;
}
