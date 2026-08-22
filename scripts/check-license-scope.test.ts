import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../", import.meta.url);

async function readRepositoryFile(path: string) {
  return Bun.file(new URL(path, repositoryRoot)).text();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("repository license scope", () => {
  test("defines Software as every first-party repository component", async () => {
    const license = normalizeWhitespace(await readRepositoryFile("LICENSE"));

    expect(license).toContain(
      '"Software" means all source code, object code, documentation, applications,',
    );
    expect(license).toContain(
      "packages, tools, scripts, assets, and other first-party materials contained in",
    );
    expect(license).toContain(
      "the Hyperfocus repository or distributed from that repository with this",
    );

    for (const component of [
      "Hyperfocus engine",
      "engine editor",
      "AI development harness",
      "shared packages",
      "all other first-party code",
    ]) {
      expect(license).toContain(component);
    }

    expect(license).not.toContain('"Software" means the Hyperfocus engine');
  });

  test("preserves separately licensed third-party material", async () => {
    const license = normalizeWhitespace(await readRepositoryFile("LICENSE"));

    expect(license).toContain(
      "Software does not include materials expressly identified as third-party materials",
    );
    expect(license).toContain("or governed by separate license terms");
  });

  test("keeps the engine package license synchronized with the repository license", async () => {
    const [repositoryLicense, enginePackageLicense] = await Promise.all([
      readRepositoryFile("LICENSE"),
      readRepositoryFile("engine/LICENSE"),
    ]);

    expect(enginePackageLicense).toBe(repositoryLicense);
  });

  test("keeps public license summaries aligned with the operative text", async () => {
    const [readme, licensingGuide] = await Promise.all([
      readRepositoryFile("README.md"),
      readRepositoryFile("docs/licensing.md"),
    ]);

    for (const summary of [readme, licensingGuide]) {
      expect(summary).toContain("all first-party");
      expect(summary).toContain("engine");
      expect(summary).toContain("editor");
      expect(summary).toContain("harness");
      expect(summary).toContain("shared packages");
      expect(summary).toContain("third-party");
    }

    expect(readme).not.toContain("names only the engine");
    expect(licensingGuide).not.toContain("does not unambiguously extend");
  });
});
