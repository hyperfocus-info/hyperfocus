import { decodeValue, encodeValue, readStoredValue, resolveLimits, type Limits } from "./value";

export const protobufContentType = "application/vnd.hyperfocus.value+protobuf";

/** Explicit host adapter; the portable codec entry has no HTTP globals. */
export function protobufResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", protobufContentType);
  return new Response(new Uint8Array(encodeValue(value)), { ...init, headers });
}

export async function readProtobufBody(input: Request | Response, options: Limits = {}) {
  const limits = resolveLimits(options), contentType = input.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== protobufContentType && contentType !== "application/json") throw new Error("Unsupported structured body content type");
  const declared = input.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limits.maxBytes)) throw new RangeError("Serialization byte limit exceeded");
  const reader = input.body?.getReader();
  if (!reader) throw new Error("Missing structured body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
      if (chunks.length >= 65536 || next.value.byteLength === 0) throw new RangeError("Serialization chunk limit exceeded");
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return contentType === protobufContentType ? decodeValue(bytes, limits)
    : readStoredValue(new TextDecoder("utf-8", { fatal: true }).decode(bytes), limits);
}
