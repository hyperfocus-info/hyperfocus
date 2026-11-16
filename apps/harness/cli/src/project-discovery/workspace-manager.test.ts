import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectProject, projectVerificationCommands } from "./inspect";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(options: { member?: Record<string, unknown>; locks?: string[]; patterns?: string[] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "workspace-manager-")); roots.push(root);
  const member = path.join(root, "packages/member"); mkdirSync(member, { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.4.0", workspaces: options.patterns ?? ["packages/*"] }));
  writeFileSync(path.join(member, "package.json"), JSON.stringify({ scripts: { test: "never execute" }, ...options.member }));
  for (const lock of options.locks ?? []) writeFileSync(path.join(member, lock), "");
  return { root, member };
}
test("workspace members discover declared checks through their owning manager", () => {
  const { member } = fixture();
  expect(inspectProject({ root: member }).packageManager).toBe("bun");
  expect(projectVerificationCommands(member)).toEqual(["bun run test"]);
});
test("unrelated nested projects cannot borrow the ancestor package manager", () => {
  const { member } = fixture({ patterns: ["apps/*"] });
  expect(inspectProject({ root: member }).tasks).toEqual([]);
});
test("explicit member managers and local lockfiles remain authoritative", () => {
  expect(inspectProject({ root: fixture({ member: { packageManager: "pnpm@10" } }).member }).packageManager).toBe("pnpm");
  expect(inspectProject({ root: fixture({ locks: ["package-lock.json"] }).member }).packageManager).toBe("npm");
});
test("unsupported explicit managers and ambiguous member lockfiles fail closed", () => {
  for (const options of [{ member: { packageManager: "other@1" } }, { locks: ["bun.lock", "package-lock.json"] }]) {
    expect(inspectProject({ root: fixture(options).member }).tasks).toEqual([]);
  }
});
test("explicit nested workspace entries may cross intermediate manifests", () => {
  const { root, member } = fixture({ patterns: ["packages/member/example"] });
  const nested = path.join(member, "example"); mkdirSync(nested);
  writeFileSync(path.join(nested, "package.json"), JSON.stringify({ scripts: { test: "not executed" } }));
  expect(inspectProject({ root: nested }).packageManager).toBe("bun");
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1", workspaces: ["packages/member"] }));
  expect(inspectProject({ root: nested }).tasks).toEqual([]);
});

test("exclusion patterns remain unresolved instead of admitting excluded members", () => {
  const { member } = fixture({ patterns: ["packages/*", "!packages/member"] });
  expect(inspectProject({ root: member }).tasks).toEqual([]);
});
test("linked member directories cannot borrow workspace authority", () => {
  const { root, member } = fixture();
  const linked = path.join(root, "packages/linked"); symlinkSync(member, linked, "junction");
  expect(inspectProject({ root: linked }).tasks).toEqual([]);
});
test("parent lockfile alone does not establish workspace membership", () => {
  const { root, member } = fixture();
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "unrelated-parent" }));
  writeFileSync(path.join(root, "bun.lock"), "");
  expect(inspectProject({ root: member }).tasks).toEqual([]);
});

test("a nearer independent workspace boundary prevents inheritance from an outer workspace", () => {
  const { member } = fixture({ patterns: ["packages/member/example"] });
  writeFileSync(path.join(member, "package.json"), JSON.stringify({ workspaces: ["other/*"] }));
  const nested = path.join(member, "example"); mkdirSync(nested);
  writeFileSync(path.join(nested, "package.json"), JSON.stringify({ scripts: { test: "not executed" } }));
  expect(inspectProject({ root: nested }).tasks).toEqual([]);
});

test("linked manager metadata cannot be mistaken for absent authority", () => {
  const { root, member } = fixture();
  const metadata = path.join(root, "metadata"); mkdirSync(metadata);
  rmSync(path.join(member, "package.json"));
  symlinkSync(metadata, path.join(member, "package.json"), "junction");
  const nested = path.join(member, "example"); mkdirSync(nested);
  writeFileSync(path.join(nested, "package.json"), JSON.stringify({ scripts: { test: "not executed" } }));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1", workspaces: ["packages/member/example"] }));
  expect(inspectProject({ root: nested }).tasks).toEqual([]);
});
test("linked local lockfiles cannot trigger workspace fallback", () => {
  const { root, member } = fixture();
  const lock = path.join(root, "external-lock"); mkdirSync(lock);
  symlinkSync(lock, path.join(member, "bun.lock"), "junction");
  expect(inspectProject({ root: member }).tasks).toEqual([]);
});
