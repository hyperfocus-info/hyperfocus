import { describe, expect, it } from "bun:test";
import { transformFileAsync } from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import solidPreset from "babel-preset-solid";

describe("Trace panel StyleX boundary", () => {
  it("keeps trace presentation out of legacy selectors and raw utility strings", async () => {
    const source = await Bun.file(new URL("./trace-panel.tsx", import.meta.url)).text();

    expect(source).toContain('from "./trace-panel.styles"');
    expect(source).not.toContain('class="');
    expect(source).not.toContain("classList=");
    expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass)="/);
    expect(source).not.toMatch(/["'](?:panel-shell|trace-context-summary|trace-peek-rail|trace-summary-card|tool-call-snippet|dense-numeric-flagged)["']/);
  });

  it("compiles through the production Solid and StyleX Babel pass", async () => {
    const filename = new URL("./trace-panel.tsx", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1));
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

    expect(result?.code).toContain("data-test-trace-panel");
  });
});
