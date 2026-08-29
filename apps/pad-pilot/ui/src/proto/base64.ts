export function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  if (!value) {
    return new Uint8Array();
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function textToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

export function jsonToBase64(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Cannot encode a non-serializable JSON value.");
  }
  return textToBase64(serialized);
}
