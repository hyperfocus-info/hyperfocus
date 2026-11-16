import { DEV_UI_LIVE_RELOAD_ENDPOINT } from "../core/constants";
import type { DevHmrDebouncePolicy, UiLiveReloadMode, UiServingState } from "../core/contracts";
import type { SetupLaunchMode } from "@hyperfocus/ai-core/protocol";
import type { createUiAssetManager } from "../../ui-build";
import path from "node:path";

export function resolveUiServingState(input: {
  serverOnly: boolean;
  hotDevelopmentMode: boolean;
  launchMode: SetupLaunchMode;
  executablePath?: string;
  uiAssetManagerFactory: typeof createUiAssetManager;
  hotReloadDebouncePolicy: DevHmrDebouncePolicy;
  existingUi?: UiServingState;
}): UiServingState {
  if (input.serverOnly) {
    return {
      mode: "server-only"
    };
  }

  if (input.existingUi?.mode === "static-dist") {
    return {
      ...input.existingUi,
      liveReload: input.hotDevelopmentMode ? "debounced-poll" : "disabled"
    };
  }

  return {
    mode: "static-dist",
    uiAssets: input.uiAssetManagerFactory({
      assetRoot: input.launchMode === "portable-launcher"
        ? path.join(path.dirname(input.executablePath ?? process.execPath), "dist", "ui")
        : undefined,
      buildWhenMissing: input.launchMode !== "portable-launcher",
      debounceScheduleMs: input.hotDevelopmentMode ? input.hotReloadDebouncePolicy.scheduleMs : [0]
    }),
    liveReload: input.hotDevelopmentMode ? "debounced-poll" : "disabled"
  };
}
export async function createUiAssetResponse(assetPath: string, liveReload: UiLiveReloadMode, sessionToken: string, swarmSite = false) {
  const asset = Bun.file(assetPath);
  const headers = new Headers(liveReload === "debounced-poll" ? { "cache-control": "no-store" } : undefined);

  if (assetPath.endsWith(".js.map")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  if (path.basename(assetPath) === "index.html") {
    const html = await asset.text();
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    const authenticatedHtml = injectHarnessSessionToken(swarmSite ? html.replace("</head>", '<meta name="hyperfocus-swarm-site" content="1">\n</head>') : html, sessionToken);

    return new Response(liveReload === "debounced-poll" ? injectDevLiveReloadScript(authenticatedHtml) : authenticatedHtml, {
      headers
    });
  }

  return new Response(asset, {
    headers
  });
}
export function injectHarnessSessionToken(html: string, sessionToken: string) {
  const meta = `<meta name="harness-session-token" content="${sessionToken}">`;
  return html.includes("</head>") ? html.replace("</head>", `${meta}\n</head>`) : `${meta}\n${html}`;
}
export function injectDevLiveReloadScript(html: string) {
  const script = `<script>
(() => {
  let revision = null;
  const poll = async () => {
    try {
      const response = await fetch("${DEV_UI_LIVE_RELOAD_ENDPOINT}", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const state = await response.json();
      if (revision === null) {
        revision = state.revision;
        return;
      }
      if (state.building || state.pending || state.revision === revision) {
        return;
      }
      revision = state.revision;
      window.location.reload();
    } catch {}
  };
  void poll();
  window.setInterval(() => {
    void poll();
  }, 1000);
})();
</script>`;

  return html.includes("</body>") ? html.replace("</body>", `${script}\n</body>`) : `${html}\n${script}`;
}
