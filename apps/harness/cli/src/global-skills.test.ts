import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { syncBundledSkillsToGlobalRoot } from "./global-skills";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";

describe("global skills", () => {
  test("copies bundled skills into the global skills root", () => {
    const root = createHarnessTestTempPath("global-skills");
    const sourceRoot = path.join(root, "source");
    const globalRoot = path.join(root, "home", "skills");
    const sourceSkill = path.join(sourceRoot, ".agents", "skills", "caveman");
    mkdirSync(sourceSkill, { recursive: true });
    writeFileSync(path.join(sourceSkill, "SKILL.md"), "# caveman\n");

    try {
      const synced = syncBundledSkillsToGlobalRoot({
        sourceRoot,
        globalSkillsRoot: globalRoot,
        skillNames: ["caveman"]
      });

      expect(synced).toEqual(["caveman"]);
      expect(existsSync(path.join(globalRoot, "caveman", "SKILL.md"))).toBe(true);
      expect(readFileSync(path.join(globalRoot, "caveman", "SKILL.md"), "utf8")).toBe("# caveman\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("copies every bundled skill by default", () => {
    const root = createHarnessTestTempPath("global-skills");
    const sourceRoot = path.join(root, "source");
    const globalRoot = path.join(root, "home", "skills");
    for (const skillName of ["assistant-actions", "grill-me", "next-todo"]) {
      const sourceSkill = path.join(sourceRoot, ".agents", "skills", skillName);
      mkdirSync(sourceSkill, { recursive: true });
      writeFileSync(path.join(sourceSkill, "SKILL.md"), `# ${skillName}\n`);
    }
    mkdirSync(path.join(sourceRoot, ".agents", "skills", "notes-only"), { recursive: true });
    writeFileSync(path.join(sourceRoot, ".agents", "skills", "notes-only", "readme.md"), "# notes\n");

    try {
      const synced = syncBundledSkillsToGlobalRoot({
        sourceRoot,
        globalSkillsRoot: globalRoot
      });

      expect(synced).toEqual(["assistant-actions", "grill-me", "next-todo"]);
      expect(existsSync(path.join(globalRoot, "assistant-actions", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(globalRoot, "grill-me", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(globalRoot, "next-todo", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(globalRoot, "notes-only"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("syncs harness release skills instead of repository-local skills in a source checkout", () => {
    const root = createHarnessTestTempPath("global-source-skills");
    const sourceRoot = path.join(root, "source");
    const globalRoot = path.join(root, "home", "skills");
    const repoSkill = path.join(sourceRoot, ".agents", "skills", "update-harness");
    const bundledSkill = path.join(sourceRoot, "apps", "harness", ".agents", "skills", "assistant-actions");
    mkdirSync(repoSkill, { recursive: true });
    mkdirSync(bundledSkill, { recursive: true });
    writeFileSync(path.join(repoSkill, "SKILL.md"), "# update-harness\n");
    writeFileSync(path.join(bundledSkill, "SKILL.md"), "# assistant-actions\n");

    try {
      expect(syncBundledSkillsToGlobalRoot({ sourceRoot, globalSkillsRoot: globalRoot })).toEqual([
        "assistant-actions"
      ]);
      expect(existsSync(path.join(globalRoot, "assistant-actions", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(globalRoot, "update-harness"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
