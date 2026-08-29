import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { relative, sep } from "node:path";

export function parseTcpPort(value: unknown, fallback: number, label = "port"): number {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > 65_535) {
    throw new RangeError(`${label} must be an integer between 1 and 65535`);
  }
  return candidate;
}

export function assertDistinctPorts(first: number, second: number, firstLabel: string, secondLabel: string): void {
  if (first === second) throw new RangeError(`${firstLabel} and ${secondLabel} must use different ports`);
}

export function relativePathWithin(root: string, target: string): string | null {
  const pathFromRoot = relative(root, target);
  if (pathFromRoot === "") return "";
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) return null;
  return pathFromRoot.split(sep).join("/");
}

export type StaticFileHandlerOptions = {
  root: string;
  index?: string;
  allow: (relativePath: string) => boolean;
  headers?: HeadersInit;
  cacheControl?: string | ((relativePath: string) => string);
  contentTypes?: Readonly<Record<string, string>>;
};

const defaultContentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

/** Exact-root static serving for demos, with traversal and method checks centralized. */
export function createStaticFileHandler(options: StaticFileHandlerOptions) {
  const root = resolve(options.root);
  const contentTypes = { ...defaultContentTypes, ...options.contentTypes };
  return async function staticFileResponse(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405, headers: { ...options.headers, allow: "GET, HEAD" } });
    }
    let pathname: string;
    try {
      const url = new URL(request.url);
      pathname = decodeURIComponent(url.pathname === "/" && options.index ? `/${options.index}` : url.pathname);
    } catch {
      return new Response("bad path", { status: 400, headers: options.headers });
    }
    const filePath = resolve(root, pathname.replace(/^[/\\]+/, ""));
    const relativePath = relativePathWithin(root, filePath);
    if (relativePath === null) return new Response("forbidden", { status: 403, headers: options.headers });
    if (!options.allow(relativePath) || !existsSync(filePath)) return new Response("not found", { status: 404, headers: options.headers });
    const cacheControl = typeof options.cacheControl === "function" ? options.cacheControl(relativePath) : options.cacheControl ?? "no-store";
    const body = request.method === "HEAD" ? null : await Bun.file(filePath).arrayBuffer();
    return new Response(body, {
      headers: {
        ...options.headers,
        "cache-control": cacheControl,
        "content-type": contentTypes[extname(relativePath).toLowerCase()] ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  };
}
