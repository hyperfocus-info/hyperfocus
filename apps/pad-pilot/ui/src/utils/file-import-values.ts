export function fileExtension(name: string) {
  const match = /\.[^./\\]+$/.exec(name);
  return match?.[0]?.toLowerCase() ?? "";
}
export function base64DecodedByteSize(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}
