import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Checkout commands run current source; installed packages run the packaged bundle.
const root = resolve(import.meta.dir, "..");
const command = process.argv[2];
const args = process.argv.slice(3).filter((value) => value !== "--");
if (command === "create") {
  const source = resolve(root, "tooling/create-project-runtime.ts");
  const entry = existsSync(resolve(root, "src/project/index.ts")) ? source : resolve(root, "dist/tooling/create-project.js");
  const { runProjectCli } = await import(entry);
  process.exitCode = await runProjectCli(args);
} else if (command === "build" || command === "dev") {
  const name = command === "build" ? "build-project" : "dev-project";
  const source = resolve(root, `scripts/${name}.ts`);
  const entry = existsSync(source) ? source : resolve(root, `dist/tooling/${name}.js`);
  const tool = await import(entry);
  if (command === "build") await tool.runBuildProjectCli(args);
  else await tool.runProjectDevCli(args);
} else {
  throw new Error("Expected create, build, or dev.");
}
