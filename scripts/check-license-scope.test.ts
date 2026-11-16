import { describe, expect, test } from "bun:test";
import { normalizeWhitespace } from '@hyperfocus/utilities/text';

const repositoryRoot = new URL("../", import.meta.url);

async function readRepositoryFile(path: string) {
  return Bun.file(new URL(path, repositoryRoot)).text();
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

  test("keeps root-licensed package copies synchronized and all public licenses included", async () => {
    const repositoryLicense = await readRepositoryFile("LICENSE");
    for await (const manifestPath of new Bun.Glob("{apps,packages}/*/package.json").scan(new URL(repositoryRoot))) {
      const manifest = await Bun.file(new URL(manifestPath.replaceAll("\\", "/"), repositoryRoot)).json();
      if (manifest.private) continue;
      expect(manifest.license).toBe("SEE LICENSE IN LICENSE");
      expect(manifest.files).toContain("LICENSE");
      const licensePath = manifestPath.replaceAll("\\", "/").replace("package.json", "LICENSE");
      const license = await readRepositoryFile(licensePath);
      expect(license.length).toBeGreaterThan(0);
      expect(license).toBe(repositoryLicense);
    }
    for (const path of ["apps/pad-pilot/LICENSE", "apps/pad-pilot-marketplace/LICENSE"]) {
      expect(await readRepositoryFile(path)).toBe(repositoryLicense);
    }
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
