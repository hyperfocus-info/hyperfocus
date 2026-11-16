import { createHash } from "node:crypto";
const start = "[hyperfocus-quality-context-v1]\n";
const end = "\n[/hyperfocus-quality-context-v1]";
export function wrapQualityPayload(content: string) { return `${start}${content}${end}`; }
export function qualityPayloadHash(prompt: string) {
  const from = prompt.lastIndexOf(start);
  if (from < 0) return undefined;
  const to = prompt.indexOf(end, from + start.length);
  if (to < 0) return undefined;
  return createHash("sha256").update(prompt.slice(from, to + end.length)).digest("hex");
}
