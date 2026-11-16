import { buildUiBundle } from "../cli/src/ui-build";

const minify = process.argv.includes("--minify");
const outputIndex = process.argv.indexOf("--output-directory");
const outputDir = outputIndex < 0 ? undefined : process.argv[outputIndex + 1];
if (outputIndex >= 0 && (!outputDir || outputDir.startsWith("--"))) throw new Error("--output-directory requires a path");

if (minify) {
  console.log("[Production Mode Enabled] Minifying UI...");
} else {
  console.log("[Dev Mode Enabled]");
}

await buildUiBundle({ minify, outputDir });
