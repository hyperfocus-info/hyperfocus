import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeBundleNotices } from "./bundle-notices";

test("bundle notices preserve upstream text from actual inputs and skip unrelated installed packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "bundle notices "));
  try {
    await Bun.write(join(root, "THIRD_PARTY_NOTICES.md"), "Canonical repository notice\n");
    const library = join(root, "node_modules/example");
    await Bun.write(join(library, "package.json"), JSON.stringify({ name: "example", version: "1.2.3", license: "MIT" }));
    await Bun.write(join(library, "LICENSE"), "Exact upstream copyright λ\nSecond line.\n");
    await Bun.write(join(library, "NOTICE.txt"), "Additional attribution.\n");
    await Bun.write(join(library, "esm/package.json"), JSON.stringify({ type: "module" }));
    await Bun.write(join(library, "esm/index.js"), "export const value = 1;");
    await Bun.write(join(root, "node_modules/unrelated/package.json"), JSON.stringify({ name: "unrelated", version: "9.0.0" }));
    const output = join(root, "out/THIRD_PARTY_NOTICES.md");
    const count = await writeBundleNotices({ root, output, inputs: [join(library, "esm/index.js"), join(library, "esm/index.js")], title: "Fixture" });
    const notices = await Bun.file(output).text();
    expect(count).toBe(1);
    expect(notices).toContain("Canonical repository notice\n");
    expect(notices).toContain("Exact upstream copyright λ\nSecond line.\n");
    expect(notices).toContain("Additional attribution.\n");
    expect(notices).toContain("example 1.2.3");
    expect(notices).not.toContain("unrelated");
  } finally { await rm(root, { recursive: true, force: true }); }
});
