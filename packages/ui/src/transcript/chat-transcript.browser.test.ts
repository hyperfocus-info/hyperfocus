import { isObject as isRecord } from "@hyperfocus/utilities/records";
import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stylexSolidPlugin } from "../../build-tools/stylex-solid-plugin.ts";

const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const smokeRoot = path.join(repositoryRoot, ".local", "transcript-rendering");
const outDir = path.join(smokeRoot, "dist");
const fixtureEntry = path.join(smokeRoot, "main.tsx");
const fixtureSource = path.join(import.meta.dir, "chat-transcript.browser-fixture.tsx");
const runner = path.join(import.meta.dir, "chat-transcript.browser-runner.ts");

test("ChatTranscript executes bounded Markdown rendering at desktop and narrow widths", async () => {
  await buildFixture();
  const result = await runBrowser(pathToFileURL(path.join(outDir, "index.html")).href);
  const report: unknown = JSON.parse(result);
  if (!isRecord(report)) throw new Error("Transcript browser runner returned a non-object report.");
  await Bun.write(path.join(smokeRoot, "transcript-browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  expect(report).toHaveProperty("desktopLarge");
  expect(report).toHaveProperty("narrowLarge");
  expect(report).toHaveProperty("streamControl");
  expect(report).toHaveProperty("streamCoalesced");
  expect(report).toHaveProperty("reading");
}, 60_000);

async function buildFixture() {
  await rm(smokeRoot, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    fixtureEntry,
    `import { mountTranscriptBrowserFixture } from "${toImportPath(fixtureSource)}";\nmountTranscriptBrowserFixture();\n`
  );
  const result = await Bun.build({
    entrypoints: [fixtureEntry],
    outdir: outDir,
    format: "iife",
    target: "browser",
    treeShaking: false,
    sourcemap: "none",
    plugins: [stylexSolidPlugin({ generate: "dom", hydratable: false, importSources: ["@stylexjs/stylex"] })]
  });
  if (!result.success) {
    throw new AggregateError(result.logs.map((log) => new Error(log.message)), "Transcript browser fixture build failed.");
  }
  await writeFile(path.join(outDir, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Transcript rendering workload</title>
    <link rel="stylesheet" href="./main.css" />
    <style>html,body,#root{height:100%;margin:0}body{font-family:system-ui;background:#f7f7f8;color:#171719}main>[role=log]{height:100%;box-sizing:border-box}</style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>\n`);
}

async function runBrowser(url: string) {
  const child = spawnBackgroundProcess({
    cmd: [process.execPath, runner],
    cwd: repositoryRoot,
    env: { ...Bun.env, TRANSCRIPT_BROWSER_URL: url },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ]);
  if (exitCode !== 0) throw new Error(`Transcript browser runner failed with exit ${exitCode}.\n${stdout}\n${stderr}`);
  return stdout.trim();
}

function toImportPath(target: string) {
  const relative = path.relative(smokeRoot, target).replaceAll("\\", "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}
