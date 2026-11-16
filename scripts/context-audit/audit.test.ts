import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditContext, inspectContext } from "./audit";
import { parseContextArguments } from "./cli";

describe("context inventory", () => {
  test("deduplicates overlapping roots, includes hidden skills, and skips generated trees", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "context-audit-"));
    try {
      const skill = path.join(root, ".agents", "skills", "sample");
      await mkdir(skill, { recursive: true });
      await mkdir(path.join(root, "node_modules"));
      await mkdir(path.join(root, ".tmp-test-data"));
      await writeFile(path.join(skill, "SKILL.md"), "---\nname: sample\n---\nKeep constraints.\n");
      await writeFile(path.join(root, "copy.md"), "---\r\nname: sample\r\n---\r\nKeep constraints.\r\n");
      await writeFile(path.join(root, "node_modules", "skip.md"), "generated");
      await writeFile(path.join(root, ".tmp-test-data", "skip.md"), "generated fixture");
      const report = await auditContext({ roots: [root, skill, root] });
      expect(report.fileCount).toBe(2);
      expect(report.skillCount).toBe(1);
      expect(report.duplicates).toHaveLength(1);
      expect(report.files.find((file) => file.skill)?.frontmatterBytes).toBeGreaterThan(0);
      expect((await auditContext({ roots: [root], includeGenerated: true })).fileCount).toBe(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags prose claims without treating fenced examples as instructions", () => {
    const source = "README L42\n~~~md\nSaves 75% tokens\n```\n~~~\nSaves 46% tokens\n";
    const result = inspectContext({ source, file: "SKILL.md" });
    expect(result.flags.map((flag) => flag.line)).toEqual([1, 6]);
    expect(result.bytes).toBe(Buffer.byteLength(source));
  });

  test("inventories temporary note ownership and pruning conditions", () => {
    const source = "# Review\nOwner: Engine\nPrune after: transfer unresolved defects to the engine roadmap.\n";
    const note = inspectContext({ source, file: ".local/audit/review.tmp.md" });
    expect(note.temporary).toEqual({ owner: "Engine", pruneAfter: "transfer unresolved defects to the engine roadmap." });
    expect(note.flags).toEqual([]);
    expect(inspectContext({ source: "# Scratch", file: "docs/review.tmp.md" }).flags).toHaveLength(2);
    expect(inspectContext({ source: "# Durable queue", file: "docs/correctness-review.md" }).temporary).toBeUndefined();
  });

  test("fails explicitly for absent roots and invalid CLI input", async () => {
    await expect(auditContext({ roots: [] })).rejects.toThrow("At least one root");
    expect(() => parseContextArguments(["--root"])).toThrow("Missing value");
    for (const value of ["0", "-1", "NaN", "1.5", "Infinity", "9007199254740992"]) {
      expect(() => parseContextArguments(["--limit", value])).toThrow("positive integer");
    }
    expect(() => parseContextArguments(["--typo"])).toThrow("Unknown argument");
    expect(parseContextArguments(["--root", "a b", "--root", "c", "--json"]).roots).toEqual(["a b", "c"]);
  });
});
