import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runProgressionAudit } from "./readable_progression_audit";

test("an incomplete observation writes only its requested report", () => {
  const root = mkdtempSync(path.join(tmpdir(), "progression-audit-"));
  const observations = path.join(root, "observations.json");
  const out = path.join(root, "report.md");
  const source = JSON.stringify({ title: "Unclear goal", proximalGoalVisible: false, evidence: ["Player could not identify a goal"] });
  writeFileSync(observations, source);
  const installedRoot = path.resolve(import.meta.dir, "../../../..");
  const historicalPaths = [".agents/skills/readable-progression-audit/LEARNINGS.md", ".local/kojima/learnings.md"]
    .map((relative) => path.join(installedRoot, relative));
  const readHistoricalFiles = () => historicalPaths.map((file) => existsSync(file) ? readFileSync(file, "utf8") : null);
  const before = readHistoricalFiles();
  try {
    const markdown = runProgressionAudit({ observations, out });
    expect(readdirSync(root).sort()).toEqual(["observations.json", "report.md"]);
    expect(readHistoricalFiles()).toEqual(before);
    expect(readFileSync(out, "utf8")).toBe(markdown);
    expect(markdown).toContain("Unclear goal");
    expect(readFileSync(observations, "utf8")).toBe(source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
