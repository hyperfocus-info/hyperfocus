import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("editor responsive layout contract", () => {
  test("exposes stable hooks for narrow mode and Project Center navigation", async () => {
    const source = await readFile(new URL("./editor-shell-view.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-solid-state="modes"');
    expect(source).toContain('class="editor-center-tabs-root"');
    expect(source).toContain("data-editor-center-tab={tab.id}");
  });

  test("keeps phone navigation reachable and reserves the Post panel switcher area", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toContain("#editor-center-tabs>[role=tablist]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(css).toContain("#editor-center-tabs [data-editor-center-tab]{min-width:0;min-height:44px");
    expect(css).toContain("[data-solid-state=modes] [role=tab]{min-height:44px");
    expect(css).toContain(".post-layout.hf-resizable-workspace{padding-bottom:60px}");
    expect(css).toContain(".post-sidebar[data-workspace-panel]{grid-template-rows:auto auto;height:auto!important}");
    expect(css).toContain(".hf-resizable-workspace>[data-workspace-panel][hidden]");
    expect(css).toContain("display:none!important");
    expect(css).toContain(".center-grid,.settings-grid,.build-layout,.profile-layout,.history-layout { min-width:0");
    expect(css).toContain(".build-layout p,.build-layout pre,.build-layout button{max-width:100%;overflow-wrap:anywhere}");
    expect(css).toContain(".build-layout pre{width:100%;box-sizing:border-box;white-space:pre-wrap;word-break:break-word}");
    expect(css).toContain(".build-layout button{height:auto;min-height:44px");
  });
});
