import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { createQualitySession } from "@hyperfocus/ai-runtime/quality";
import { qualityCompletionBlock } from "@hyperfocus/ai-core/quality";
import { useGitProjectFixture } from "../test-support/git-project-fixture";
import { freezeQualityChecks, qualityCandidate, runQualityChecks, changedQualityPaths, qualityChangedFiles } from "@hyperfocus/ai-runtime/quality/execution";

describe("host-owned quality receipts", () => {
  const fixture = useGitProjectFixture({ fixtureName: "quality-receipts", packageName: "quality-fixture", readmeTitle: "Fixture" });
  const ids = ["navigation", "recovery", "focus", "responsive", "journey"];
  for (const mutation of ["none", "skipped", "wrong-nonce", "missing-evidence", "process-failure", "changed-candidate", "changed-verifier"] as const) {
    test(`${mutation}: only fresh independent execution can verify`, async () => {
      const root = fixture.createTempDir(mutation);
      await mkdir(join(root, "src")); await writeFile(join(root, "src", "app.tsx"), "original");
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { "test:quality": "bun verify.ts" }, hyperfocus: { quality: {
        schema: "hyperfocus-quality-profile-v1", script: "test:quality", inputs: ["src"], verifierInputs: ["verify.ts", "package.json"], verifierIds: ids,
      } } }));
      await writeFile(join(root, "verify.ts"), `
        const args = process.argv.slice(2), nonce = args[args.indexOf('--nonce') + 1], output = args[args.indexOf('--receipt') + 1];
        const mode = ${JSON.stringify(mutation)};
        const checks = ${JSON.stringify(ids)}.map(id => ({ id, outcome: mode === 'skipped' && id === 'recovery' ? 'skipped' : 'passed',
          reason: 'Executable fixture receipt', evidenceRefs: mode === 'missing-evidence' ? ['absent.json'] : [], durationMs: 1 }));
        if (mode === 'changed-candidate') await Bun.write('src/app.tsx', 'changed while checking');
        await Bun.write(output, JSON.stringify({schema:'hyperfocus-quality-checks-v1', nonce: mode === 'wrong-nonce' ? crypto.randomUUID() : nonce, checks}));
        if (mode === 'process-failure') process.exitCode = 1;
      `);
      const frozen = await freezeQualityChecks(root); expect(frozen).toBeDefined();
      if (mutation === "changed-verifier") await writeFile(join(root, "verify.ts"), "throw new Error('weakened verifier')");
      const quality = createQualitySession({ runId: mutation, task: { intent: "Fix Books navigation and workbench", project: "books" } });
      quality.select(); quality.delivery("main", "sdk-prompt", true, quality.context("main"));
      const report = await runQualityChecks(quality, frozen, true);
      expect(report.state === "VERIFIED").toBe(mutation === "none");
      expect(Boolean(qualityCompletionBlock({ intent: "Fix Books navigation", trace: quality.trace }))).toBe(mutation !== "none");
      expect(report.rules.find(rule => rule.id === "ui.composition.approved-reference")?.status).not.toBe("PASSED");
      if (mutation === "wrong-nonce") expect(report.rules[0]?.status).toBe("UNKNOWN");
      if (mutation === "missing-evidence") expect(report.rules[0]?.unresolvedReason).toBe("Verifier referenced missing evidence.");
    });
  }
  test("credential files cannot be hashed; dirty unrelated work is excluded from changed-path eligibility", async () => {
    const root = await fixture.createRepoClone("changed-paths");
    await mkdir(join(root, "src", "client"), { recursive: true });
    await writeFile(join(root, "src", "client", "existing.tsx"), "previous user work");
    const before = await qualityChangedFiles(root);
    await writeFile(join(root, "src", "client", "new.tsx"), "task change");
    const after = await qualityChangedFiles(root);
    expect(changedQualityPaths(before, after)).toEqual(["src/client/new.tsx"]);
    expect(changedQualityPaths(new Map([["reverted.tsx", "dirty"]]), new Map())).toEqual(["reverted.tsx"]);
    await writeFile(join(root, ".env"), "SYNTHETIC_SECRET=not-real");
    await expect(qualityCandidate(root, [".env"])).rejects.toThrow("Sensitive");
    expect(changedQualityPaths(undefined, after)).toBeUndefined();
    expect(await qualityChangedFiles(join(root, "unavailable-virtual-workspace"))).toBeUndefined();
  });
});
