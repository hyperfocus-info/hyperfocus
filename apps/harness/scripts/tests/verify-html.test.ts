import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createHarnessTestTempPath } from "../../cli/src/test-support/test-temp-root";
import { verifyHtml } from "../../.agents/skills/verify-html/verify-html.ts";

test("HTML validation parses without executing scripts and reports missing, invalid and module code", () => {
  const dir = createHarnessTestTempPath("verify-html"); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "index.html");
  try {
    writeFileSync(file, '<script>throw new Error("must not execute")</script>');
    expect(verifyHtml({ file }).ok).toBe(true);
    writeFileSync(file, '<script>const = ;</script><script src="missing.js"></script><script type="module">import "x"</script>');
    const result = verifyHtml({ file }); expect(result.ok).toBe(false);
    expect(result.errors.map((x: { code: string }) => x.code)).toEqual(['javascript-syntax', 'missing-script', 'module-build-required']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
