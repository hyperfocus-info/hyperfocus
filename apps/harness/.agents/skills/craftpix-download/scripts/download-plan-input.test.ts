import { expect, test } from "bun:test";
import { parseDownloadPlan } from "./download-plan-input";

test("download plans reject malformed options before filesystem or network work", () => {
  for (const value of [null, [], { downloads: [] }, { downloads: [null] }, { downloads: [{ sourceUrl: 1 }] }, { defaults: { overwrite: "false" }, downloads: [{}] }, { downloads: [{ timeout: "60" }] }]) {
    expect(() => parseDownloadPlan(value)).toThrow();
  }
  const plan = { defaults: { timeout: 60 }, downloads: [{ sourceUrl: "https://craftpix.net/download/1/", resolveOnly: true }], metadata: "retained" };
  expect(parseDownloadPlan(plan)).toEqual(plan);
});
