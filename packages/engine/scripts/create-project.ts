import { runProjectCli } from "../tooling/create-project-runtime.ts";

try {
  process.exitCode = await runProjectCli(process.argv.slice(2));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`Project CLI error: ${message}`);
  console.error("Run with --help for templates and examples.");
  process.exitCode = 1;
}
