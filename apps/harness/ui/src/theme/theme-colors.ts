import { getContrastRatio } from "@hyperfocus/ui/theme/contrast";

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const short = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) return `#${short[1].split("").map((digit) => `${digit}${digit}`).join("")}`.toLowerCase();
  const long = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  return long ? `#${long[1].toLowerCase()}` : undefined;
}

export function parseHexColor(value: string) {
  const normalized = normalizeHexColor(value);
  if (!normalized) return undefined;
  const numeric = Number.parseInt(normalized.slice(1), 16);
  return { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 };
}

export function blendHexColors(from: string, to: string, amountTo: number) {
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  if (!fromRgb || !toRgb) return normalizeHexColor(from) ?? normalizeHexColor(to) ?? "#000000";
  const amount = Math.max(0, Math.min(1, amountTo));
  return `#${[[fromRgb.r, toRgb.r], [fromRgb.g, toRgb.g], [fromRgb.b, toRgb.b]]
    .map(([start, end]) => Math.round(start * (1 - amount) + end * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getReadableTextColor(...backgrounds: string[]) {
  const minimum = (color: string) => Math.min(...backgrounds.map(background => getContrastRatio(color, background)));
  return minimum("#ffffff") >= minimum("#0b0d12") ? "#ffffff" : "#0b0d12";
}

/** Preserve the hue and current shade when readable; move only as far as needed. */
export function ensureTextContrast(color: string, backgrounds: readonly string[], minimum = 4.5) {
  const readable = (candidate: string) => backgrounds.every(background => getContrastRatio(candidate, background) >= minimum);
  if (readable(color)) return color;
  const target = getReadableTextColor(...backgrounds);
  for (let step = 1; step <= 100; step += 1) {
    const candidate = blendHexColors(color, target, step / 100);
    if (readable(candidate)) return candidate;
  }
  // Incompatible custom surfaces still fail validation instead of claiming compliance.
  return target;
}
