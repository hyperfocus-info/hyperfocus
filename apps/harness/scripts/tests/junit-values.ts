

export function parseXmlAttributes(attributesText: string) {
  return Object.fromEntries(
    Array.from(attributesText.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g), ([, key, value]) => [key, value])
  );
}

export function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function normalizeFilePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

export function roundDuration(durationMs: number) {
  return Number(durationMs.toFixed(2));
}

export function toOptionalNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOptionalPositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}
