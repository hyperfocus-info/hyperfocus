import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("application release workflow", () => {
  test("gates and uploads exact editor and extracted-smoked Harness artifacts", async () => {
    const workflow = await readFile(path.resolve(import.meta.dir, "../../../.github/workflows/release.yml"), "utf8");
    const harnessGate = workflow.indexOf("bun run test:harness");
    const packageLauncher = workflow.indexOf("bun apps/harness/scripts/package-launcher.ts --target bun-windows-x64");
    const archiveLauncher = workflow.indexOf("id: harness-release");
    const releaseUpload = workflow.indexOf("uses: softprops/action-gh-release@v2");

    expect(harnessGate).toBeGreaterThan(-1);
    expect(packageLauncher).toBeGreaterThan(harnessGate);
    expect(archiveLauncher).toBeGreaterThan(packageLauncher);
    expect(releaseUpload).toBeGreaterThan(archiveLauncher);
    expect(workflow).toContain("bun apps/harness/scripts/launcher-release.ts --target bun-windows-x64");
    expect(workflow).toContain("hyperfocus-editor-windows-portable.zip");
    expect(workflow).toContain("${{ steps.harness-release.outputs.artifact_path }}");
    expect(workflow).toContain("fail_on_unmatched_files: true");
    expect(workflow).not.toContain("release/*");
  });
});
