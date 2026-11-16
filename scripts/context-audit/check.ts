import { validateGuidance } from "./guidance";

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2);
    if (args.some((arg) => arg !== "--json")) throw new Error("Usage: bun run check:agent-guidance [--json]");
    const result = await validateGuidance();
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Checked ${result.checkedFiles} guidance files and ${result.catalog.length} skills.`);
      for (const failure of result.failures) console.error(`${failure.file}: ${failure.reason}`);
      console.log(`${result.failures.length} guidance errors. Behavioral routing requires scenario evaluation.`);
    }
    if (result.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
