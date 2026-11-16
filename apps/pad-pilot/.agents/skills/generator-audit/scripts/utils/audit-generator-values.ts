
export function toId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
export function lineOf(source: string, needle: string) {
  const index = source.indexOf(needle);
  if (index < 0) {
    return "missing";
  }
  return String(source.slice(0, index).split(/\r?\n/).length);
}
export function extractArrayConst(source: string, name: string) {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`).exec(source);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((item) => item[1] ?? "");
}
export function sliceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  if (start < 0) {
    return "";
  }
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}
export function extractStringArrayEntries(source: string) {
  return [...source.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((item) => item[1] ?? "");
}
