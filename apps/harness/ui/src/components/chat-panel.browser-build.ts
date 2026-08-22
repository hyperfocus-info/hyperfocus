import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stylexSolidPlugin } from "../../../../../scripts/stylex-solid-plugin";

const [smokeRoot, fixtureSourcePath] = process.argv.slice(2);
if (!smokeRoot || !fixtureSourcePath) {
  throw new Error("Usage: bun chat-panel.browser-build.ts <smoke-root> <fixture-source>");
}

const outDir = path.join(smokeRoot, "dist");
const fixtureEntry = path.join(smokeRoot, "main.tsx");
await rm(smokeRoot, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await writeFile(fixtureEntry, `import "${toImportPath(smokeRoot, fixtureSourcePath)}";\n`);

const result = await Bun.build({
  entrypoints: [fixtureEntry],
  outdir: outDir,
  format: "iife",
  target: "browser",
  sourcemap: "none",
  metafile: true,
  plugins: [
    stylexSolidPlugin({
      useCSSLayers: { before: ["reset", "legacy"], prefix: "hyperfocus" },
      importSources: ["@stylexjs/stylex"]
    })
  ]
});

if (!result.success) {
  throw new AggregateError(result.logs.map((log) => new Error(log.message)), "ChatPanel browser fixture build failed");
}

await writeFile(path.join(outDir, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Chat First Paint</title>
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`);

function toImportPath(fromRoot: string, targetPath: string) {
  const relativePath = path.relative(fromRoot, targetPath).replaceAll("\\", "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}
