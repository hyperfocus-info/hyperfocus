import { readdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Preserve upstream attribution from the modules actually included in each bundle. */
export async function writeBundleNotices({ root, output, inputs, title }: { root: string; output: string; inputs: string[]; title: string }) {
  const packages = new Map<string, { directory: string; name: string; version: string; license: unknown }>();
  for (const source of inputs) {
    if (!source.replaceAll("\\", "/").includes("/node_modules/")) continue;
    let directory = dirname(source);
    while (dirname(directory) !== directory) {
      const file = Bun.file(join(directory, "package.json"));
      if (await file.exists()) {
        const manifest = await file.json();
        if (typeof manifest.name === "string" && typeof manifest.version === "string") {
          if (!manifest.name.startsWith("@hyperfocus/")) {
            const canonical = await realpath(directory);
            packages.set(canonical, { directory: canonical, name: manifest.name, version: manifest.version, license: manifest.license });
          }
          break;
        }
      }
      directory = dirname(directory);
    }
  }
  let notices = await Bun.file(join(root, "THIRD_PARTY_NOTICES.md")).text();
  notices += `\n\n# ${title} bundled dependencies\n\nThe following upstream license and notice files are preserved verbatim from the installed bundle inputs. Manifest license identifiers are included where upstream packages omit a license file.\n`;
  for (const dependency of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    notices += `\n## ${dependency.name} ${dependency.version}\n\nManifest license: ${JSON.stringify(dependency.license ?? "not declared")}\n`;
    if (dependency.name === '@resvg/resvg-wasm' && dependency.version === '2.6.2') notices += '\n' + await Bun.file(join(root, 'apps/engine-editor/website/licenses/resvg-2.6.2.txt')).text();
    for (const file of (await readdir(dependency.directory, { withFileTypes: true })).filter(entry => entry.isFile() && /^(?:licen[cs]e|notice|copyright)(?:[.-]|$)/i.test(entry.name))) {
      notices += `\n### ${file.name}\n\n${await Bun.file(join(dependency.directory, file.name)).text()}\n`;
    }
  }
  await Bun.write(output, notices);
  return packages.size;
}
