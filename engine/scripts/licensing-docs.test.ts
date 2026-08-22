import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const license = readFileSync(join(root, "LICENSE"), "utf8");
const model = readFileSync(join(root, "docs", "licensing-model.md"), "utf8");
const readme = readFileSync(join(root, "readme.md"), "utf8");
const readiness = readFileSync(join(root, "docs", "readiness-roadmap.md"), "utf8");
const publicLicensingText = [license, model, readme, readiness].join("\n");

function annualRoyalty(adjustedRevenue: number): number {
  return 0.05 * Math.max(0, adjustedRevenue - 50_000);
}

describe("public licensing contract", () => {
  test("uses a five-percent marginal royalty above USD 50,000", () => {
    expect(annualRoyalty(25_000)).toBe(0);
    expect(annualRoyalty(50_000)).toBe(0);
    expect(annualRoyalty(50_001)).toBeCloseTo(0.05, 8);
    expect(annualRoyalty(75_000)).toBe(1_250);
    expect(annualRoyalty(150_000)).toBe(5_000);

    expect(license).toContain("five percent (5%) only");
    expect(license).toContain("Adjusted Game Revenue - USD 50,000");
    expect(model).toContain("0.05 × max(0, adjusted annual game revenue − 50,000 USD)");
  });

  test("keeps the license, README, and readiness assessment synchronized", () => {
    for (const text of [model, readme, readiness]) {
      expect(text).toContain("5%");
      expect(text).toContain("USD 50,000");
    }

    expect(publicLicensingText).not.toMatch(/10% royalty|royalty is 10%|Source-Available License 1\.0/);
    expect(publicLicensingText).not.toMatch(/owner decision still required|choose marginal|license is replaced/i);
  });

  test("protects both free engine forks and a clean engine exit", () => {
    expect(license).toContain("No Monetized Engine Forks");
    expect(license).toContain("without Consideration");
    expect(license).toMatch(/migrate Your\s+Independent Content to another engine at any time/);
    expect(model).toContain(".hyperfocus/project.json");
    expect(model).toContain(".hyperfocus/assets.hfp");
  });
});
