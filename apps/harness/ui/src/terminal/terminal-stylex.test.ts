import { describe, expect, it } from "bun:test";
import { transformFileAsync } from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import solidPreset from "babel-preset-solid";
import { readStylexRules } from "../utils/tests/stylex-test-utils";

const terminalSources = [
  "./terminal.styles.ts",
  "./terminal-drawer.tsx",
  "./terminal-history-dialog.tsx",
  "./terminal-pane.tsx",
  "./terminal-search.tsx",
  "./terminal-split-layout.tsx",
  "./terminal-tabs.tsx",
  "./renderers/solid-renderer-prototype.tsx",
  "./renderers/xterm-renderer.tsx",
  "../components/cli-session-panel.tsx",
];

describe("Terminal StyleX boundary", () => {
  it("keeps terminal chrome out of raw utility strings and imperative class mutation", async () => {
    const sources = await Promise.all(terminalSources.map((source) => Bun.file(new URL(source, import.meta.url)).text()));

    for (const source of sources) {
      expect(source).not.toMatch(/\bclass\s*=\s*["'`]/);
      expect(source).not.toMatch(/\bclass\s*=\s*\{\s*["'`]/);
      expect(source).not.toContain("classList=");
      expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass)="/);
      expect(source).not.toContain("classList.add");
    }
  });

  it("preserves the official xterm stylesheet import as the vendor boundary", async () => {
    const source = await Bun.file(new URL("./renderers/xterm-renderer.tsx", import.meta.url)).text();
    expect(source).toContain('import "@xterm/xterm/css/xterm.css"');
  });

  it("compiles every terminal surface through the production Solid and StyleX pass", async () => {
    const extractedRules: Parameters<typeof stylexBabelPlugin.processStylexRules>[0] = [];

    for (const source of terminalSources) {
      const filename = toWindowsPath(new URL(source, import.meta.url).pathname);
      const result = await transformFileAsync(filename, {
        babelrc: false,
        configFile: false,
        filename,
        presets: [
          [typescriptPreset, { allExtensions: true, isTSX: true }],
          [solidPreset, { generate: "dom", hydratable: false }],
        ],
        plugins: [[stylexBabelPlugin, {
          runtimeInjection: false,
          unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() },
        }]],
      });
      expect(result?.code?.length).toBeGreaterThan(0);
      extractedRules.push(...readStylexRules(result?.metadata));
    }

    const css = stylexBabelPlugin.processStylexRules(extractedRules, {
      useLayers: { before: ["reset"], prefix: "hyperfocus" },
    });
    expect(css).toContain("@layer hyperfocus.priority");
  });
});

function toWindowsPath(pathname: string) {
  return pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1));
}
