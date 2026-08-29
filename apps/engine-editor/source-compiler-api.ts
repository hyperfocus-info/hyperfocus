import { posix } from "node:path";
import { build, type Loader, type Plugin } from "esbuild";
import { isAllowedEditorAgentOrigin } from "./editor-agent-api.ts";

const API_PATH = "/api/source/v1/compile";
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;

export type EditorSourceFile = { path: string; source: string };
export type EditorBehaviorBinding = { module: string; exportName: string };
export type EditorSourceCompileRequest = {
  version: 1;
  files: EditorSourceFile[];
  behaviors: EditorBehaviorBinding[];
  /** Preview modules are imported by the editor; standalone registries execute
   * before the embedded offline runtime and cannot retain ESM imports. */
  target?: "preview" | "standalone";
};

export async function handleEditorSourceApi(request: Pick<Request, "url" | "method" | "headers" | "text">, enabled = true): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== API_PATH) return undefined;
  if (!enabled) return json({ error: "Live source compilation is available only when the editor server binds to loopback." }, 403);
  if (!isAllowedEditorAgentOrigin(request)) return json({ error: "Live source compilation rejects cross-origin browser requests." }, 403);
  if (request.method !== "POST") return json({ error: "Live source compilation requires POST." }, 405, { Allow: "POST" });

  try {
    const payload = await readJsonBody(request);
    const code = await compileEditorSource(payload);
    return json({ version: 1, code });
  } catch (error) {
    return json({ error: formatCompileError(error) }, 422);
  }
}

/**
 * Bundles only the source text explicitly supplied by the browser. The compiler
 * never receives a project path and cannot read arbitrary files from disk.
 */
export async function compileEditorSource(value: unknown): Promise<string> {
  const request = parseCompileRequest(value);
  const files = new Map(request.files.map((file) => [file.path, file.source]));
  const moduleAliases = new Map<string, string>();
  for (const behavior of request.behaviors) {
    const modulePath = resolveSuppliedModule("__entry__.ts", behavior.module, files);
    if (!moduleAliases.has(modulePath)) moduleAliases.set(modulePath, `behaviorModule${moduleAliases.size}`);
  }
  const imports = [...moduleAliases].map(([path, alias]) => `import * as ${alias} from ${JSON.stringify(`./${path}`)};`);
  const entries = request.behaviors.map((behavior) => {
    const path = resolveSuppliedModule("__entry__.ts", behavior.module, files);
    const key = `${behavior.module}#${behavior.exportName}`;
    return `  ${JSON.stringify(key)}: ${moduleAliases.get(path)}[${JSON.stringify(behavior.exportName)}],`;
  });
  const entrySource = [
    ...imports,
    "const behaviors = {",
    ...entries,
    "};",
    "for (const [key, behavior] of Object.entries(behaviors)) if (typeof behavior !== 'function') throw new Error(`Behavior export ${key} is not a function.`);",
    request.target === "standalone"
      ? "globalThis.__hyperfocusProjectBehaviors = Object.freeze(behaviors);"
      : "export default behaviors;",
  ].join("\n");

  const result = await build({
    bundle: true,
    entryPoints: ["hyperfocus:entry"],
    format: request.target === "standalone" ? "iife" : "esm",
    legalComments: "none",
    logLevel: "silent",
    platform: "browser",
    plugins: [inMemorySourcePlugin(files, entrySource)],
    sourcemap: "inline",
    target: "es2022",
    write: false,
  });
  const output = result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
  if (!output || result.outputFiles.length !== 1) throw new Error("Live source must compile to one JavaScript module without emitted assets.");
  if (/\bimport\s*(?:\(|["'{*])/.test(output.text)) throw new Error("Live source retained an unresolved import outside the supplied project files.");
  return output.text;
}

function parseCompileRequest(value: unknown): EditorSourceCompileRequest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.files) || !Array.isArray(value.behaviors)) {
    throw new Error("Live source request must contain version 1, files, and behaviors.");
  }
  if (value.files.length > MAX_FILES) throw new Error(`Live source supports at most ${MAX_FILES} files.`);
  const files = value.files.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.path !== "string" || typeof candidate.source !== "string") throw new Error(`Source file ${index + 1} is invalid.`);
    const path = normalizeSourcePath(candidate.path);
    if (new TextEncoder().encode(candidate.source).byteLength > MAX_FILE_BYTES) throw new Error(`${path} exceeds 1 MiB.`);
    return { path, source: candidate.source };
  });
  if (new Set(files.map((file) => file.path)).size !== files.length) throw new Error("Live source paths must be unique.");
  const behaviors = value.behaviors.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.module !== "string" || typeof candidate.exportName !== "string") throw new Error(`Behavior binding ${index + 1} is invalid.`);
    if (!candidate.module.startsWith("./")) throw new Error(`Behavior module ${candidate.module} must be relative to the project root.`);
    if (!/^[A-Za-z_$][\w$]*$/.test(candidate.exportName)) throw new Error(`Behavior export ${candidate.exportName} is invalid.`);
    return { module: candidate.module, exportName: candidate.exportName };
  });
  const target = value.target === undefined || value.target === "preview" ? "preview" : value.target === "standalone" ? "standalone" : undefined;
  if (!target) throw new Error("Live source target must be preview or standalone.");
  return { version: 1, files, behaviors, target };
}

function inMemorySourcePlugin(files: ReadonlyMap<string, string>, entrySource: string): Plugin {
  return {
    name: "hyperfocus-live-source",
    setup(api) {
      api.onResolve({ filter: /^hyperfocus:entry$/ }, () => ({ path: "__entry__.ts", namespace: "hyperfocus-source" }));
      api.onResolve({ filter: /.*/, namespace: "hyperfocus-source" }, (args) => {
        if (!args.path.startsWith(".")) return { errors: [{ text: `Runtime import ${args.path} is not available in the in-editor live source bundle.` }] };
        try { return { path: resolveSuppliedModule(args.importer, args.path, files), namespace: "hyperfocus-source" }; }
        catch (error) { return { errors: [{ text: error instanceof Error ? error.message : String(error) }] }; }
      });
      api.onLoad({ filter: /.*/, namespace: "hyperfocus-source" }, (args) => {
        if (args.path === "__entry__.ts") return { contents: entrySource, loader: "ts" };
        const contents = files.get(args.path);
        if (contents === undefined) return { errors: [{ text: `Source module ${args.path} was not supplied.` }] };
        return { contents, loader: loaderFor(args.path) };
      });
    },
  };
}

function resolveSuppliedModule(importer: string, specifier: string, files: ReadonlyMap<string, string>): string {
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (base === ".." || base.startsWith("../") || posix.isAbsolute(base)) throw new Error(`Source import ${specifier} leaves the project root.`);
  const candidates = SOURCE_EXTENSION.test(base)
    ? [base]
    : [base, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"].map((extension) => `${base}${extension}`), ...["ts", "tsx", "js", "jsx"].map((extension) => `${base}/index.${extension}`)];
  const match = candidates.find((candidate) => files.has(candidate));
  if (!match) throw new Error(`Source import ${specifier} from ${importer} does not match an enabled project file.`);
  return match;
}

function normalizeSourcePath(value: string): string {
  const path = posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");
  if (!path || path === "." || path === ".." || path.startsWith("../") || posix.isAbsolute(path) || !SOURCE_EXTENSION.test(path)) throw new Error(`Source path is not portable TypeScript or JavaScript: ${value}`);
  if (path.split("/").some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) throw new Error(`Source path contains unsupported characters: ${value}`);
  return path;
}

async function readJsonBody(request: Pick<Request, "headers" | "text">): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new Error("Live source request exceeds 5 MiB.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new Error("Live source request exceeds 5 MiB.");
  try { const value: unknown = JSON.parse(text); return value; }
  catch { throw new Error("Live source request body must be valid JSON."); }
}

function formatCompileError(error: unknown) {
  if (isRecord(error) && Array.isArray(error.errors)) {
    const messages = error.errors.flatMap((item) => isRecord(item) && typeof item.text === "string" ? [item.text] : []);
    if (messages.length) return messages.join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function loaderFor(path: string): Loader {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "tsx") return "tsx";
  if (extension === "jsx") return "jsx";
  if (extension === "js") return "js";
  return "ts";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
