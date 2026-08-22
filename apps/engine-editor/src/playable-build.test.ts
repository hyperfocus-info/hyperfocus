import { describe, expect, test } from "bun:test";
import { createHyperfocusProjectFiles, decodeHyperfocusProject } from "../../../engine/src/project/index.ts";
import { createStandalonePlayableHtml } from "./playable-build.ts";
import { createDefaultProject } from "./project.ts";

describe("standalone playable HTML", () => {
  test("embeds the exact portable pair in one deterministic offline document", async () => {
    const project = createDefaultProject("Offline & Portable");
    const files = await createHyperfocusProjectFiles(project, []);
    const html = createStandalonePlayableHtml({ project, ...files, runtimeSource: "globalThis.runtimeBooted=true;" });
    const payload = JSON.parse(html.match(/id="hyperfocus-project-pair">([^<]+)<\/script>/)?.[1] ?? "") as { projectJson: string; assetsArchive: string };
    expect(new Uint8Array(Buffer.from(payload.projectJson, "base64"))).toEqual(files.projectJson);
    expect(new Uint8Array(Buffer.from(payload.assetsArchive, "base64"))).toEqual(files.assetsArchive);
    expect(decodeHyperfocusProject(Buffer.from(payload.projectJson, "base64"))).toEqual(project);
    expect(html).not.toMatch(/<script\s+src=|<link\s+[^>]*href=|https?:\/\//i);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("Offline &amp; Portable");
    expect(createStandalonePlayableHtml({ project, ...files, runtimeSource: "globalThis.runtimeBooted=true;" })).toBe(html);
  });

  test("prevents project names and bundled source from terminating their containers", async () => {
    const project = createDefaultProject("</title><script>bad()</script>\u2028");
    const files = await createHyperfocusProjectFiles(project, []);
    const html = createStandalonePlayableHtml({ project, ...files, runtimeSource: "globalThis.x='</script>';\u2028" });
    expect(html).not.toContain("<title></title><script>bad()");
    expect(html).not.toContain("globalThis.x='</script>'");
    expect(html).toContain("globalThis.x='<\\/script>'");
  });

  test("fails closed when the editor build omitted its runtime payload", async () => {
    const project = createDefaultProject();
    const files = await createHyperfocusProjectFiles(project, []);
    expect(() => createStandalonePlayableHtml({ project, ...files, runtimeSource: "" })).toThrow("runtime was not embedded");
  });
});
