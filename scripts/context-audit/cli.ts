import { auditContext } from "./audit";

export function parseContextArguments(args: readonly string[]) {
  const roots: string[] = [];
  let json = false;
  let includeGenerated = false;
  let limit = 15;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (arg === "--include-generated") includeGenerated = true;
    else if (arg === "--help") help = true;
    else if (arg === "--root" || arg === "--limit") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      if (arg === "--root") roots.push(value);
      else {
        limit = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return { roots: roots.length ? roots : undefined, json, includeGenerated, limit, help };
}

if (import.meta.main) {
  try {
    const options = parseContextArguments(Bun.argv.slice(2));
    if (options.help) {
      console.log("bun scripts/context-audit/cli.ts [--root PATH ...] [--limit 15] [--json] [--include-generated]");
    } else {
      const report = await auditContext(options);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`${report.fileCount} Markdown files; ${report.skillCount} skills; ${report.bytes} bytes.`);
        console.log(report.measurement);
        console.log(`${report.duplicates.length} duplicate groups; ${report.files.reduce((sum, file) => sum + file.flags.length, 0)} review flags; ${report.skippedSymlinks} symlinks skipped.`);
        for (const file of report.files.slice(0, options.limit)) console.log(`${file.bytes}\t${file.file}`);
        console.log("Use --json for full inventory and review flags. Duplicate release copies may be intentional.");
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
