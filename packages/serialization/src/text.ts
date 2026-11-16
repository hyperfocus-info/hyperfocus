import { decodeValue, encodeValue, readStoredValue, resolveLimits, type Limits } from "./value";

const prefix = "hf:pb:1:";

/** Only for string-only boundaries such as localStorage. Binary stores use encodeValue. */
export function encodeStoredText(value: unknown, options: Limits = {}): string {
  const bytes = encodeValue(value, options);
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return prefix + btoa(text);
}

export function decodeStoredText(text: string, options: Limits = {}) {
  if (!text.startsWith("hf:pb:")) return readStoredValue(text, options);
  if (!text.startsWith(prefix)) throw new Error("Unsupported protobuf text envelope");
  const { maxBytes } = resolveLimits(options), body = text.slice(prefix.length);
  if (body.length > Math.ceil(maxBytes / 3) * 4) throw new RangeError("Serialization byte limit exceeded");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) throw new Error("Invalid protobuf Base64");
  const binary = atob(body);
  if (btoa(binary) !== body) throw new Error("Noncanonical protobuf Base64");
  return decodeValue(Uint8Array.from(binary, char => char.charCodeAt(0)), options);
}
