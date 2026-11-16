import { escapeHtml } from "@hyperfocus/utilities/text";
import type { EditorProject } from "./editor.ts";
import { readCombatProject3D } from './3d/combat-declaration.ts';
import { readStandaloneStreamedAudio, type StandaloneStreamedAudio } from './standalone/streamed-audio.ts';
import { deliveryUrl } from './delivery/manifest.ts';
import type { DeliveryObject } from './delivery/manifest.ts';
import { deliveryBootstrapSource } from './delivery/bootstrap.ts';
export { readStandaloneStreamedAudio } from './standalone/streamed-audio.ts';
export type { StandaloneStreamedAudio } from './standalone/streamed-audio.ts';

declare const __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: string;
declare const __HYPERFOCUS_STANDALONE_RUNTIME_2D_SOURCE__: string;
declare const __HYPERFOCUS_STANDALONE_RUNTIME_3D_SOURCE__: string;

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
  /** Explicitly permit user-initiated combat joins; unsupported projects fail closed. */
  allowCombatConnections?: boolean;
  /** Optional web-folder music sources; only content-addressed same-origin MP3 paths are accepted. */
  streamedAudio?: readonly StandaloneStreamedAudio[];
  /** Web builds keep code and assets in independently cacheable files. */
  delivery?: { manifestUrl: string; runtimeUrl: string; behaviorModule?: string; assetOrigins?: readonly string[]; preload?: readonly string[];
    bootstrap?: { manifest: DeliveryObject; project: DeliveryObject; core: DeliveryObject } };
};

export function supportsStandaloneCombatConnections(project: EditorProject): boolean {
  if (!project.extensions?.hyperfocus3D) return false;
  const combat = readCombatProject3D(project.extensions.hyperfocusCombat);
  return Boolean(combat?.match && combat.fighters.length === 2 && combat.fighters.some(fighter => fighter.control === 'player'))
    && !project.scenes.some(scene => scene.entities.some(entity => entity.components.some(component => component.enabled
      && component.type === 'behavior' && typeof component.values.module === 'string' && !component.values.module.startsWith('builtin:'))));
}

/**
 * Creates an HTML artifact around a validated project pair, optionally with
 * separately delivered same-origin music. Offline exports retain packed audio.
 * The HTML is disposable build output; it does not add canonical project files.
 */
export function createStandalonePlayableHtml(options: StandalonePlayableHtmlOptions): string {
  const runtimeSource = options.delivery ? webBootstrap(deliveryUrl(options.delivery.runtimeUrl), options.delivery.behaviorModule) : options.runtimeSource ?? injectedRuntimeSource(options.project);
  if (!runtimeSource.trim()) throw new Error("The standalone playable runtime was not embedded in this editor build.");
  if (options.allowCombatConnections && !supportsStandaloneCombatConnections(options.project)) throw new Error('Combat connections require a supported two-fighter 3D match without custom behaviors.');
  const streamedAudio = readStandaloneStreamedAudio({ value: options.streamedAudio, project: options.project });
  const assetOrigins = [...new Set(options.delivery?.assetOrigins ?? [])].map(value => {
    const url = new URL(deliveryUrl(value));if (url.origin !== value) throw Error('Delivery CSP accepts HTTPS origins only.');return url.origin;
  }).join(' ');
  const connections = options.allowCombatConnections ? "'self' wss: ws://127.0.0.1:* ws://localhost:*" : options.delivery ? "'self'" : "'none'";
  // Hosted combat sign-in uses Clerk's documented development FAPI and abuse-protection origins.
  // Keep other exports fully offline; never authorize arbitrary HTTPS scripts or JavaScript eval.
  const accountScripts = options.allowCombatConnections ? ' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com' : '';
  const accountConnections = options.allowCombatConnections ? ' https://*.clerk.accounts.dev https://*.protect.clerk.com:*' : '';
  const accountImages = options.allowCombatConnections ? ' https://img.clerk.com' : '';
  const accountFrames = options.allowCombatConnections ? "; worker-src 'self' blob:; frame-src https://challenges.cloudflare.com https://*.protect.clerk.com" : '';
  const payload = safeScriptJson(options.delivery ? { version: 2, manifestUrl: deliveryUrl(options.delivery.manifestUrl) } : {
    version: 1,
    projectJson: encodeBase64(options.projectJson),
    assetsArchive: encodeBase64(options.assetsArchive),
    ...(streamedAudio.length ? { streamedAudio } : {}),
  });
  const title = escapeHtml(options.project.name);
  const locale = escapeHtml(options.project.settings.locale);
  const profile = escapeHtml(options.project.settings.targetProfile);
  const preload = (options.delivery?.preload ?? []).map(path => {
    const url = deliveryUrl(path);if (url.startsWith('https:')) throw Error('Preloaded runtime code must live beside the game.');
    return `<link rel="modulepreload" href="${escapeHtml(url)}">`;
  }).join('\n');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:${accountImages}; media-src data: blob:${streamedAudio.length || options.delivery ? " 'self'" : ''} ${assetOrigins}; font-src data: blob:; style-src 'unsafe-inline'; script-src 'wasm-unsafe-eval' 'unsafe-inline'${options.delivery ? " 'self'" : ''}${accountScripts}; connect-src ${connections} ${assetOrigins}${accountConnections}${accountFrames}">
<title>${title}</title>
${preload}
${options.delivery?.bootstrap ? `<script>${safeInlineScript(deliveryBootstrapSource(options.delivery.bootstrap))}</script>` : ''}
<script>const hyperfocusIcon=document.createElement("link");hyperfocusIcon.rel="icon";hyperfocusIcon.href="data:,";document.head.append(hyperfocusIcon)</script>
<style>html,body{min-height:100%;margin:0;background:#080c12;color:#dce8f1;font:14px system-ui,sans-serif;overflow:auto}body{min-height:100vh;display:grid;place-items:center;align-items:safe center}main{display:grid;gap:10px;justify-items:center;max-width:100%;padding:12px 0}canvas{box-sizing:border-box;display:block;max-width:100%;max-height:calc(100vh - 170px);border:1px solid #35516a;background:#0d1821;touch-action:none}footer{display:flex;gap:10px;align-items:center;color:#7f93a6;font-size:12px}strong{color:#dce8f1}#playable-error{box-sizing:border-box;display:none;max-width:min(720px,90vw);white-space:pre-wrap;color:#ff9faf;background:#241017;border:1px solid #713241;padding:12px}.playable-controls{box-sizing:border-box;width:min(760px,100%);padding:0 12px;display:grid;gap:8px}.playable-actions{display:flex;flex-wrap:wrap;gap:6px}.playable-controls button{min-height:44px;padding:8px 14px;background:#182d3e;color:#f0f7fc;border:1px solid #53728a;border-radius:6px;font:inherit;touch-action:none}.playable-controls button:focus-visible,.playable-controls summary:focus-visible{outline:3px solid #81d5ff;outline-offset:2px}.playable-controls summary{cursor:pointer;min-height:32px}.playable-controls label{display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;flex-wrap:wrap}.playable-controls input[type=range]{width:min(240px,45vw)}.playable-controls input:focus-visible{outline:3px solid #81d5ff;outline-offset:2px}.playable-scene-text{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:16px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.playable-scene-line{grid-column:1/-1;margin:0}footer{flex-wrap:wrap;justify-content:center;padding:0 12px;text-align:center}</style>
</head>
<body data-hyperfocus-profile="${profile}">
<main><canvas width="760" height="480" aria-label="${title}"></canvas><p id="playable-loading" role="status" aria-live="polite">Loading game…</p><footer><strong>${title}</strong><span>Created with Hyperfocus</span></footer><pre id="playable-error" role="alert"></pre><button id="playable-retry" hidden onclick="location.reload()">Retry loading</button></main>
<script type="application/json" id="hyperfocus-project-pair">${payload}</script>
${options.projectBehaviorSource ? `<script>${safeInlineScript(options.projectBehaviorSource)}</script>` : ""}
<script>${safeInlineScript(runtimeSource)}</script>
</body>
</html>`;
}

function webBootstrap(runtimeUrl: string, behaviorModule?: string) {
  if (runtimeUrl.startsWith('https:')) throw Error('Runtime code must live beside the game.');
  if (behaviorModule?.startsWith('https:')) throw Error('Project code must live beside the game.');
  const prepare = behaviorModule ? `import(${safeScriptJson(`./${deliveryUrl(behaviorModule)}`)}).then(module=>{globalThis.__hyperfocusProjectBehaviors=module.default;})` : 'Promise.resolve()';
  return `globalThis.__hyperfocusRuntimeModule=new URL(${safeScriptJson(`./${runtimeUrl}`)},document.baseURI).href;${prepare}.then(()=>import(globalThis.__hyperfocusRuntimeModule)).catch(error=>{document.body.dataset.hyperfocusReady='error';document.getElementById('playable-loading').hidden=true;const output=document.getElementById('playable-error');output.style.display='block';output.textContent='Could not load the game. '+error.message;document.getElementById('playable-retry').hidden=false;});`;
}

function injectedRuntimeSource(project: EditorProject) {
  if (project.extensions?.hyperfocus3D !== undefined) {
    if (typeof __HYPERFOCUS_STANDALONE_RUNTIME_3D_SOURCE__ === "string") return __HYPERFOCUS_STANDALONE_RUNTIME_3D_SOURCE__;
  } else if (typeof __HYPERFOCUS_STANDALONE_RUNTIME_2D_SOURCE__ === "string") return __HYPERFOCUS_STANDALONE_RUNTIME_2D_SOURCE__;
  return typeof __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__ === "string" ? __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__ : "";
}

function encodeBase64(bytes: Uint8Array): string {
  const native = Reflect.get(Uint8Array.prototype, 'toBase64');
  if (typeof native === 'function') {
    const encoded: unknown = Reflect.apply(native, bytes, []);
    if (typeof encoded !== 'string') throw new Error('Native base64 encoding did not return text');
    return encoded;
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  // Bound intermediate storage. A character-at-a-time rope retains millions of
  // tiny string nodes for large offline packs before JSON forces flattening.
  const block = new Uint8Array(16384), decoder = new TextDecoder(), chunks: string[] = [];
  let written = 0;
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const remaining = bytes.length - offset;
    block[written++] = alphabet.charCodeAt(a >>> 2);
    block[written++] = alphabet.charCodeAt(((a & 3) << 4) | (b >>> 4));
    block[written++] = remaining > 1 ? alphabet.charCodeAt(((b & 15) << 2) | (c >>> 6)) : 61;
    block[written++] = remaining > 2 ? alphabet.charCodeAt(c & 63) : 61;
    if (written === block.length) { chunks.push(decoder.decode(block));written = 0; }
  }
  if (written) chunks.push(decoder.decode(block.subarray(0, written)));
  return chunks.join('');
}

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function safeInlineScript(value: string) {
  return value.replace(/<\/script/gi, "<\\/script").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
