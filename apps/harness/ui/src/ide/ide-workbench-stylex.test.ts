import { describe, expect, it } from "bun:test";
import { transformFileAsync } from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import solidPreset from "babel-preset-solid";

const workbenchUrl = new URL("./ide-workbench.tsx", import.meta.url);
const stylesUrl = new URL("./ide-workbench.styles.ts", import.meta.url);

function filenameFromUrl(url: URL) {
  return url.pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1));
}

describe("IDE workbench StyleX boundary", () => {
  it("keeps IDE presentation out of raw utility class strings", async () => {
    const [source, stylesSource] = await Promise.all([
      Bun.file(workbenchUrl).text(),
      Bun.file(stylesUrl).text(),
    ]);

    expect(source).toContain('from "./ide-workbench.styles"');
    expect(stylesSource).toContain("stylex.create({");
    expect(source).not.toContain('class="');
    expect(source).not.toContain("classList=");
    expect(source).not.toContain(".classList");
    expect(source).not.toMatch(
      /(?:contentClass|itemClass|triggerClass|wrapperClass)="/,
    );
    expect(source).not.toMatch(/class=\{`/);
  });

  it("compiles through the production Solid and StyleX Babel pass", async () => {
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
    const workbenchFilename = filenameFromUrl(workbenchUrl);
    const stylesFilename = filenameFromUrl(stylesUrl);

    const [workbenchResult, stylesResult] = await Promise.all([
      transformFileAsync(workbenchFilename, {
        ...options,
        filename: workbenchFilename,
      }),
      transformFileAsync(stylesFilename, {
        ...options,
        filename: stylesFilename,
      }),
    ]);

    expect(workbenchResult?.code).toContain("data-test-ide-workbench");
    expect(stylesResult?.code).toContain("export const ideStyles = {");
  });
});
