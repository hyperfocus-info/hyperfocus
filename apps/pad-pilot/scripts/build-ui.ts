import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { snapshotDirectory } from "./directory-snapshot";
import { promoteStagedDirectory, withProcessLock } from "./directory-transaction";
import { REQUIRED_UI_ENTRY_ASSETS } from "./ui-build-contract";

export function uiMarketplaceBuildEnv({ minify, environment = process.env }: { minify: boolean; environment?: NodeJS.ProcessEnv }) {
  const origin = minify ? "https://padpilot.hyperfocus.info" : environment.PADPILOT_PUBLIC_ORIGIN || "http://localhost:3000";
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PadPilot UI marketplace URL must be an HTTP(S) origin.');
  return { version: 1, MARKETPLACE_URL: url.origin };
}

export function externalModuleUiBuildFlag(environment = process.env) {
  return environment.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI === "true" ? "true" : "false";
}

export function uiBuildOutputMode({ embedded, minify }: { embedded: boolean; minify: boolean }) {
  const compact = embedded || minify;
  return {
    minify: compact,
    sourcemap: compact ? "none" as const : "inline" as const,
  };
}

export function parseBuildUiArguments(argumentsToParse: string[]) {
  let embedded = false;
  let minify = false;
  let outputDirectory: string | undefined;
  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    if (!argument) continue;
    if (argument === "--embedded") {
      embedded = true;
      continue;
    }
    if (argument === "--minify") {
      minify = true;
      continue;
    }
    if (argument === "--output-directory") {
      const value = argumentsToParse[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output-directory requires a path.");
      }
      outputDirectory = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown build-ui argument: ${argument}`);
  }
  return { embedded, minify, outputDirectory };
}

async function pathExists(target: string) {
  try {
    return (await stat(target)).size > 0;
  } catch (error) {
    if ((error && typeof error === "object" && "code" in error ? error.code : undefined) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function buildUi({
  embedded = false,
  minify = false,
  projectRoot = path.resolve(import.meta.dir, ".."),
  outputDirectory = path.join(projectRoot, "ui", "dist"),
} = {}) {
  const uiRoot = path.join(projectRoot, "ui");
  const outputMode = uiBuildOutputMode({ embedded, minify });
  return withProcessLock(path.join(uiRoot, ".padpilot-ui-build.lock"), async () => {
    const outputParent = path.dirname(outputDirectory);
    await mkdir(outputParent, { recursive: true });
    const stagingDirectory = await mkdtemp(path.join(outputParent, ".padpilot-ui-build-"));
    let stagingExists = true;
    try {
      const result = await Bun.build({
        entrypoints: [path.join(uiRoot, "src", "main.tsx")],
        outdir: stagingDirectory,
        naming: "[name].[ext]",
        target: "browser",
        format: "iife",
        define: {
          "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development"),
          "process.env.PADPILOT_DEVTOOLS_ENABLED": JSON.stringify(minify ? "false" : "true"),
          "process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI": JSON.stringify(externalModuleUiBuildFlag()),
          "process.env.HANDSHAKE_DETAILS": JSON.stringify(uiMarketplaceBuildEnv({ minify })),
        },
        minify: outputMode.minify,
        sourcemap: outputMode.sourcemap,
        plugins: [
          stylexSolidPlugin({
            importSources: ["@stylexjs/stylex"],
            useCSSLayers: {
              before: ["pad-pilot-reset", "pad-pilot-legacy"],
              prefix: "pad-pilot",
            },
          }),
        ],
      });
      if (!result.success) {
        throw new Error("UI build failed.");
      }

      await cp(path.join(uiRoot, "public"), stagingDirectory, { recursive: true, force: true });
      await cp(path.join(uiRoot, "index.html"), path.join(stagingDirectory, "index.html"), { force: true });
      if ((await Promise.all(
        REQUIRED_UI_ENTRY_ASSETS.map((filename) => pathExists(path.join(stagingDirectory, filename))),
      )).some((exists) => !exists)) {
        throw new Error("UI build did not produce its required entry assets.");
      }
      const outputSnapshot = await snapshotDirectory(stagingDirectory);

      const promotion = await promoteStagedDirectory(stagingDirectory, outputDirectory, {
        validate: async (directory) => {
          if (await snapshotDirectory(directory) !== outputSnapshot) {
            throw new Error("Staged UI output changed before promotion.");
          }
          if ((await Promise.all(
            REQUIRED_UI_ENTRY_ASSETS.map((filename) => pathExists(path.join(directory, filename))),
          )).some((exists) => !exists)) {
            throw new Error("Staged UI output lost a required entry asset.");
          }
        },
      });
      stagingExists = false;
      if (promotion.retainedBackup) {
        console.warn(`UI built; previous output backup remains at ${promotion.retainedBackup}.`);
      }
      return promotion.destination;
    } finally {
      if (stagingExists) {
        await rm(stagingDirectory, { force: true, recursive: true });
      }
    }
  }, 600000);
}

if (import.meta.main) {
  const { embedded, minify, outputDirectory } = parseBuildUiArguments(process.argv.slice(2));
  console.log(minify ? "[Production Mode Enabled] Minifying UI..." : "[Dev Mode Enabled]");
  await buildUi({ embedded, minify, outputDirectory });
  console.log("UI build successful!");
}
