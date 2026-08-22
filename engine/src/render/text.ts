export type TextMeasureOptions = {
  font?: string;
  maxLines?: number;
  ellipsis?: string;
};

function withFont<T>(ctx: CanvasRenderingContext2D, font: string | undefined, read: () => T) {
  if (!font) return read();
  const previous = ctx.font;
  ctx.font = font;
  try {
    return read();
  } finally {
    ctx.font = previous;
  }
}

function textWidth(ctx: CanvasRenderingContext2D, text: string, font?: string) {
  return withFont(ctx, font, () => ctx.measureText(text).width);
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function normalizeMaxLines(value: number | undefined) {
  if (value === undefined || value === 0) return 0;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("maxLines must be a positive safe integer, 0, or undefined");
  }
  return value;
}

export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, options: TextMeasureOptions = {}) {
  assertNonNegativeFinite(maxWidth, "maxWidth");
  const ellipsis = options.ellipsis ?? "...";
  if (maxWidth <= 0) return "";
  if (textWidth(ctx, text, options.font) <= maxWidth) return text;
  if (textWidth(ctx, ellipsis, options.font) > maxWidth) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}`;
    if (textWidth(ctx, candidate, options.font) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low)}${ellipsis}`;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, options: TextMeasureOptions = {}) {
  assertNonNegativeFinite(maxWidth, "maxWidth");
  const maxLines = normalizeMaxLines(options.maxLines);
  if (maxWidth === 0) return [];
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(ctx, candidate, options.font) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[kept.length - 1] = truncateText(ctx, `${kept[kept.length - 1]}${options.ellipsis ?? "..."}`, maxWidth, options);
    return kept;
  }
  return lines;
}
