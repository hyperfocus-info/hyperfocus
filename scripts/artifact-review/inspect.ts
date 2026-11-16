import { inspectArtifactIntegrity } from "@hyperfocus/artifact-review/integrity";

if (import.meta.main) {
  const [manifestPath, ...args] = Bun.argv.slice(2);
  if (!manifestPath || manifestPath.startsWith("--")) throw new Error("Usage: inspect.ts <manifest.json> [--database feedback.sqlite] [--output report.json]");
  let databasePath: string | undefined;
  let output: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing ${flag} value`);
    if (flag === "--database") databasePath = value;
    else if (flag === "--output") output = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  const report = await inspectArtifactIntegrity({ manifestPath, databasePath });
  if (output) await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: report.manifestPath, passed: report.passed, ...report.summary,
    ...(output ? { report: output } : { failures: report.items.filter(item => item.source !== "valid" || item.cached === "mismatch") }) }));
  if (!report.passed) process.exitCode = 1;
}
