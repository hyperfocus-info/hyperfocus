import type { EditorProject } from "./editor.ts";

declare const __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: string;

export type StandalonePlayableFiles = {
  projectJson: Uint8Array;
  assetsArchive: Uint8Array;
};

export type StandalonePlayableHtmlOptions = StandalonePlayableFiles & {
  project: EditorProject;
  /** Tests and non-editor hosts may provide the already bundled runtime explicitly. */
  runtimeSource?: string;
  /** Optional bounded project-source registry emitted by the loopback compiler. */
  projectBehaviorSource?: string;
};

/**
 * Creates one offline HTML release artifact around the exact portable project pair.
 * The HTML is disposable build output; it does not add canonical project files.
 */
export function createStandalonePlayableHtml(options: StandalonePlayableHtmlOptions): string {
  const runtimeSource = options.runtimeSource ?? injectedRuntimeSource();
  if (!runtimeSource.trim()) throw new Error("The standalone playable runtime was not embedded in this editor build.");
  const payload = safeScriptJson({
    version: 1,
    projectJson: encodeBase64(options.projectJson),
    assetsArchive: encodeBase64(options.assetsArchive),
  });
  const title = escapeHtml(options.project.name);
  const locale = escapeHtml(options.project.settings.locale);
  const profile = escapeHtml(options.project.settings.targetProfile);
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'">
<title>${title}</title>
<script>const hyperfocusIcon=document.createElement("link");hyperfocusIcon.rel="icon";hyperfocusIcon.href="data:,";document.head.append(hyperfocusIcon)</script>
<style>html,body{height:100%;margin:0;background:#080c12;color:#dce8f1;font:14px system-ui,sans-serif;overflow:hidden}body{display:grid;place-items:center}main{display:grid;gap:10px;justify-items:center;max-width:100%}canvas{box-sizing:border-box;display:block;max-width:100vw;max-height:calc(100vh - 48px);border:1px solid #35516a;background:#0d1821;image-rendering:pixelated;touch-action:none}footer{display:flex;gap:10px;align-items:center;color:#7f93a6;font-size:12px}strong{color:#dce8f1}#playable-error{box-sizing:border-box;display:none;max-width:min(720px,90vw);white-space:pre-wrap;color:#ff9faf;background:#241017;border:1px solid #713241;padding:12px}</style>
</head>
<body data-hyperfocus-profile="${profile}">
<main><canvas width="760" height="480" aria-label="${title}"></canvas><footer><strong>${title}</strong><span>Hyperfocus standalone - ${profile}</span></footer><pre id="playable-error" role="alert"></pre></main>
<script type="application/json" id="hyperfocus-project-pair">${payload}</script>
${options.projectBehaviorSource ? `<script>${safeInlineScript(options.projectBehaviorSource)}</script>` : ""}
<script>${safeInlineScript(runtimeSource)}</script>
</body>
</html>`;
}

function injectedRuntimeSource() {
  return typeof __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__ === "string" ? __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__ : "";
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const remaining = bytes.length - offset;
    encoded += alphabet[a >>> 2];
    encoded += alphabet[((a & 3) << 4) | (b >>> 4)];
    encoded += remaining > 1 ? alphabet[((b & 15) << 2) | (c >>> 6)] : "=";
    encoded += remaining > 2 ? alphabet[c & 63] : "=";
  }
  return encoded;
}

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function safeInlineScript(value: string) {
  return value.replace(/<\/script/gi, "<\\/script").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
