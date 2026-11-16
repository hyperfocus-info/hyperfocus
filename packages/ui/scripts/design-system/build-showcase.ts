import { mkdir } from "node:fs/promises";
import path from "node:path";
import { stylexSolidPlugin } from "../../build-tools/stylex-solid-plugin";

export const showcaseDirectory = path.resolve(import.meta.dir, "../../../../.local/design-system/showcase");

export async function buildShowcase() {
  await mkdir(showcaseDirectory, { recursive: true });
  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "showcase.tsx")],
    outdir: showcaseDirectory,
    format: "iife",
    target: "browser",
    naming: "main.[ext]",
    plugins: [stylexSolidPlugin({ generate: "dom", hydratable: false })],
  });
  if (!result.success) throw new AggregateError(result.logs.map((log) => new Error(log.message)), "Showcase build failed");
  const target = path.join(showcaseDirectory, "index.html");
  await Bun.write(target, `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hyperfocus UI reference</title><link rel="stylesheet" href="main.css"><style>body{margin:0}</style>
</head><body><div id="root"></div><script src="main.js"></script></body></html>`);
  return target;
}

if (import.meta.main) console.log(await buildShowcase());
