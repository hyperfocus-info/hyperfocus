/// <reference path="./babel-preset-solid.d.ts" />

import { transformFileAsync } from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import stylexBabelPlugin, { type Rule } from "@stylexjs/babel-plugin";
import solidPreset from "babel-preset-solid";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type StyleXSolidPluginOptions = {
  generate?: "dom" | "ssr" | "universal";
  hydratable?: boolean;
  importSources?: string[];
  useCSSLayers?: boolean | { before?: readonly string[]; after?: readonly string[]; prefix?: string };
};

/**
 * Runs Solid's JSX compiler and StyleX's compiler in one Babel pass.
 *
 * Bun stops at the first matching onLoad hook, so composing the standalone
 * Solid and StyleX esbuild plugins either leaves JSX as React calls or leaves
 * stylex.create calls in the browser. This combined plugin owns the transform
 * once and emits the collected StyleX rules beside Bun's CSS bundle.
 */
export function stylexSolidPlugin(options: StyleXSolidPluginOptions = {}): Bun.BunPlugin {
  const rules: Parameters<typeof stylexBabelPlugin.processStylexRules>[0] = [];
  const importSources = options.importSources ?? ["@stylexjs/stylex"];

  return {
    name: "hyperfocus-stylex-solid",
    setup(build) {
      build.onStart(() => {
        rules.length = 0;
      });

      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path: sourcePath }) => {
        if (sourcePath.includes(`${path.sep}node_modules${path.sep}`)) {
          return {
            contents: await Bun.file(sourcePath).text(),
            loader: loaderForPath(sourcePath)
          };
        }

        const result = await transformFileAsync(sourcePath, {
          babelrc: false,
          configFile: false,
          filename: sourcePath,
          sourceMaps: false,
          presets: [
            [typescriptPreset, { allExtensions: true, isTSX: /x$/.test(sourcePath) }],
            [solidPreset, { generate: options.generate ?? "dom", hydratable: options.hydratable ?? false }]
          ],
          plugins: [[stylexBabelPlugin, {
            // StyleX 0.19's query-order rewrite rejects valid responsive maps
            // when exported style modules are consumed by the full Solid graph.
            // Preserve authored order; the production-configuration regression
            // covers multiple responsive entrypoints.
            enableMediaQueryOrder: false,
            importSources,
            runtimeInjection: false,
            unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() }
          }]]
        });

        rules.push(...readStylexRules(result?.metadata));
        return result?.code ? { contents: result.code, loader: "js" } : undefined;
      });

      build.onEnd(async (result) => {
        if (rules.length === 0) {
          return;
        }
        const css = stylexBabelPlugin.processStylexRules(rules, { useLayers: options.useCSSLayers ?? false });
        const cssOutput = result.outputs.find((output) => output.path.endsWith(".css"));
        const outputDirectory = build.config.outdir;
        const cssPath = cssOutput?.path ?? (outputDirectory ? path.join(outputDirectory, "main.css") : undefined);
        if (!cssPath) {
          throw new Error("StyleX requires Bun.build to specify outdir");
        }
        await mkdir(path.dirname(cssPath), { recursive: true });
        if (await Bun.file(cssPath).exists()) {
          await appendFile(cssPath, `\n${css}`);
        } else {
          await writeFile(cssPath, css);
        }
      });
    }
  };
}

function readStylexRules(metadata: unknown): Rule[] {
  if (typeof metadata !== "object" || metadata === null) return [];
  const value = Reflect.get(metadata, "stylex");
  return Array.isArray(value) ? value.filter(isStylexRule) : [];
}

function isStylexRule(value: unknown): value is Rule {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const [className, declaration, priority] = value;
  if (typeof className !== "string" || typeof declaration !== "object" || declaration === null || typeof priority !== "number") return false;
  const ltr = Reflect.get(declaration, "ltr");
  const rtl = Reflect.get(declaration, "rtl");
  const constKey = Reflect.get(declaration, "constKey");
  const constVal = Reflect.get(declaration, "constVal");
  return typeof ltr === "string" &&
    (rtl === undefined || rtl === null || typeof rtl === "string") &&
    (constKey === undefined || typeof constKey === "string") &&
    (constVal === undefined || typeof constVal === "string" || typeof constVal === "number");
}

function loaderForPath(sourcePath: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.tsx$/i.test(sourcePath)) return "tsx";
  if (/\.ts$/i.test(sourcePath)) return "ts";
  if (/\.jsx$/i.test(sourcePath)) return "jsx";
  return "js";
}
