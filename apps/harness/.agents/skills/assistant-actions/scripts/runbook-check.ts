import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_HELPERS = ["assistant-state.ts", "assistant-jobs.ts", "assistant-maintenance.ts", "harness-db-path.ts"];

/** Validate the installed runbook graph without requiring repository-only story metadata. */
export function validateRunbook(skillRoot = path.resolve(import.meta.dir, "..")) {
  const root = path.resolve(skillRoot);
  const errors: string[] = [];
  const documents: string[] = [];
  const pending = ["SKILL.md"];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const relative = pending.pop()!;
    if (visited.has(relative)) continue;
    visited.add(relative);
    const file = path.resolve(root, relative);
    if (!existsSync(file)) {
      errors.push(`Missing document: ${relative}`);
      continue;
    }
    documents.push(relative);
    for (const match of readFileSync(file, "utf8").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]!.split("#")[0]!;
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), target);
      const child = path.relative(root, resolved);
      if (child === ".." || child.startsWith(`..${path.sep}`) || path.isAbsolute(child)) {
        errors.push(`Reference leaves installed skill: ${relative} -> ${target}`);
      } else if (!existsSync(resolved)) {
        errors.push(`Missing reference: ${relative} -> ${target}`);
      } else if (resolved.endsWith(".md")) {
        pending.push(child.replaceAll(path.sep, "/"));
      }
    }
  }
  for (const helper of REQUIRED_HELPERS) {
    if (!existsSync(path.join(root, "scripts", helper))) errors.push(`Missing helper: scripts/${helper}`);
  }
  return { ok: errors.length === 0, skillRoot: root, errors, documents: documents.sort() };
}

if (import.meta.main) {
  let skillRoot = path.resolve(import.meta.dir, "..");
  let json = false;
  for (let index = 2; index < Bun.argv.length; index += 1) {
    const argument = Bun.argv[index];
    if (argument === "--help" || argument === "-h") {
      console.log("Usage: bun runbook-check.ts [--skill-root <installed-directory>] [--json]");
      process.exit(0);
    }
    if (argument === "--json") json = true;
    else if (argument === "--skill-root" && Bun.argv[index + 1]) skillRoot = path.resolve(Bun.argv[++index]!);
    else throw new Error(`Unknown or incomplete option: ${argument}`);
  }
  const result = validateRunbook(skillRoot);
  console.log(json ? JSON.stringify(result, null, 2) : [
    `assistant-actions runbook: ${result.ok ? "ok" : "failed"}`,
    ...result.errors
  ].join("\n"));
  process.exitCode = result.ok ? 0 : 1;
}
