import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { withProcessLock } from "./directory-transaction";
import { readBoundedUtf8File } from "@hyperfocus/pad-pilot/bounded-file";

const knownFindingsByteLimit = 4 * 1024 * 1024;

const args = Bun.argv.slice(2);
const requiredFlags = ["symptom", "root-cause", "fix-pattern", "test", "files"] as const;
const allowedFlags = new Set([...requiredFlags, "date"]);
const skillFile = path.join(path.resolve(import.meta.dir, ".."), ".agents", "skills", "correctness", "references", "known-findings.md");

const parsedArgs: Record<string, string> = {};
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!argument.startsWith("--")) {
    throw new Error(`Unexpected update-correctness-skill argument: ${argument}`);
  }
  const name = argument.slice(2);
  if (!allowedFlags.has(name as typeof requiredFlags[number] | "date") || name in parsedArgs) {
    throw new Error(`Unknown or duplicate update-correctness-skill argument: ${argument}`);
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for update-correctness-skill argument: ${argument}`);
  }
  parsedArgs[name] = value;
  index += 1;
}

const values = Object.fromEntries(requiredFlags.map((flagName) => [flagName, parsedArgs[flagName] ?? ""]));
const missingFlags = requiredFlags.filter((flagName) => values[flagName].trim().length === 0);

if (missingFlags.length > 0) {
  console.error(`Missing required flags: ${missingFlags.map((flagName) => `--${flagName}`).join(", ")}`);
  process.exit(1);
}

const entryDate = parsedArgs.date || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
  throw new Error("--date must use YYYY-MM-DD.");
}
const normalizedFiles = values.files
  .split(",")
  .map((file) => file.trim())
  .filter(Boolean)
  .join(", ");

const nextEntry = [
  `## ${entryDate} - ${values.symptom}`,
  "",
  `- Symptom: ${values.symptom}`,
  `- Root cause: ${values["root-cause"]}`,
  `- Fix pattern: ${values["fix-pattern"]}`,
  `- Regression test added: ${values.test}`,
  `- Relevant files: ${normalizedFiles}`,
  "",
].join("\n");

await mkdir(path.dirname(skillFile), { recursive: true });
await withProcessLock(`${skillFile}.padpilot.lock`, async () => {
  const existing = await readBoundedUtf8File(
    skillFile,
    knownFindingsByteLimit,
    "Correctness known-findings file",
  ).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  });
  const duplicateMarker = [
    `- Symptom: ${values.symptom}`,
    `- Root cause: ${values["root-cause"]}`,
    `- Fix pattern: ${values["fix-pattern"]}`,
  ].join("\n");
  if (existing.includes(duplicateMarker)) {
    console.log("Known finding already present.");
    return;
  }

  const baseDocument = existing.trim().length > 0 ? existing.trimEnd() : "# Known Findings";
  const nextDocument = `${baseDocument}\n\n${nextEntry}`;
  if (Buffer.byteLength(nextDocument) > knownFindingsByteLimit) {
    throw new Error(`Correctness known-findings file would exceed ${knownFindingsByteLimit} bytes.`);
  }
  const temporary = path.join(path.dirname(skillFile), `.${path.basename(skillFile)}.${process.pid}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, nextDocument, { flag: "wx" });
    await rename(temporary, skillFile);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Appended correctness finding to ${skillFile}`);
});
