import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export type PackageTestLane = { id: string; browser: boolean; args: string[] };

/** Keep DOM/native transport isolation while discovering new package consumers. */
export async function packageTestPlan(root: string, uiOnly = false): Promise<PackageTestLane[]> {
  const ui = { id: "ui", browser: true, args: ["test", "--conditions", "browser", "packages/ui"] };
  if (uiOnly) return [ui];
  const targets: string[] = [];
  const custom: PackageTestLane[] = [];
  const entries = await readdir(resolve(root, "packages"), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const directory = `packages/${entry.name}`;
    const file = Bun.file(resolve(root, directory, "package.json"));
    if (!await file.exists()) continue;
    // Engine has its own root test:engine / release gate; UI needs browser exports.
    if (entry.name === "engine" || entry.name === "ui") continue;
    const manifest = await file.json();
    const command = manifest.scripts?.test;
    if (command !== undefined && (typeof command !== "string" || !command.trim())) {
      throw new Error(`Invalid test command: ${directory}`);
    }
    if (command && command.trim() !== "bun test") {
      // Some packages own tests outside their source directory. Use their declared
      // command rather than inferring coverage from the directory's existence.
      custom.push({ id: entry.name, browser: false, args: ["run", "--cwd", directory, "test"] });
    } else {
      targets.push(directory);
    }
  }
  return [
    ...targets.length ? [{ id: "backend", browser: false, args: ["test", ...targets] }] : [],
    ...custom,
    ui,
  ];
}
