import { expect, it } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSynaestheticDashboard } from "./build-synaesthetic-dashboard";

it("builds the persistent evaluator dashboard as a separate browser bundle", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "padpilot-synaesthetic-dashboard-"));
  await buildSynaestheticDashboard({ outputDirectory });

  const html = await readFile(join(outputDirectory, "index.html"), "utf8");
  const javascript = await readFile(join(outputDirectory, "dashboard.js"), "utf8");

  expect(html).toContain("Synaesthetic Library");
  expect(html).toContain("dashboard.js");
  expect(javascript).toContain("/api/v1/library");
  expect(javascript).not.toContain("CINEMA");
});
