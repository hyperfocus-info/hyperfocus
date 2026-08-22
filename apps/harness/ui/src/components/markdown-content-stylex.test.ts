import { describe, expect, it } from "bun:test";
import { transformFileAsync } from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import solidPreset from "babel-preset-solid";

const componentUrls = [
  new URL("./markdown-content.tsx", import.meta.url),
  new URL("./file-linked-text.tsx", import.meta.url),
];
const stylesUrl = new URL("./markdown-content.styles.ts", import.meta.url);

function filenameFromUrl(url: URL) {
  return url.pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1));
}

describe("Markdown StyleX boundary", () => {
  it("keeps Markdown and file-link presentation out of raw class strings", async () => {
    const sources = await Promise.all(
      componentUrls.map((url) => Bun.file(url).text()),
    );

    for (const source of sources) {
      expect(source).toContain('from "./markdown-content.styles"');
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList=");
      expect(source).not.toMatch(/cn\(["']markdown-/);
      expect(source).not.toMatch(/class=\{`/);
    }
  });

  it("compiles components and emitted CSS through the production Babel pass", async () => {
    const options = {
      babelrc: false,
      configFile: false,
      presets: [
        [typescriptPreset, { allExtensions: true, isTSX: true }],
        [solidPreset, { generate: "dom", hydratable: false }],
      ],
      plugins: [
        [
          stylexBabelPlugin,
          {
            runtimeInjection: false,
            unstable_moduleResolution: {
              type: "commonJS",
              rootDir: process.cwd(),
            },
          },
        ],
      ],
    };
    const urls = [...componentUrls, stylesUrl];
    const results = await Promise.all(
      urls.map((url) => {
        const filename = filenameFromUrl(url);
        return transformFileAsync(filename, { ...options, filename });
      }),
    );
    const styleRules = (
      results.at(-1)?.metadata as
        | {
            stylex?: Parameters<typeof stylexBabelPlugin.processStylexRules>[0];
          }
        | undefined
    )?.stylex;

    expect(results.every((result) => Boolean(result?.code))).toBe(true);
    expect(styleRules?.length).toBeGreaterThan(0);
    expect(() =>
      stylexBabelPlugin.processStylexRules(styleRules ?? []),
    ).not.toThrow();
  });
});
