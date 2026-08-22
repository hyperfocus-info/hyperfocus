import { isAbsolute, relative } from "node:path";

export function parseTcpPort(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value.trim() === "") return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error(`${name} must be an integer from 1 through 65535`);
  return port;
}

export function relativePathWithin(root: string, candidate: string) {
  const result = relative(root, candidate);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result)) ? result : null;
}

