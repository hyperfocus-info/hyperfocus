import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverVersionedManifests } from "../release-readiness";
import { profiles } from "../shipping/profiles";
import { inspectSourceEvidence } from "./source-evidence";

/** Combines declared dependencies and bounded static evidence; it does not certify coverage. */
export async function inspectChangeImpact({ root, paths }: { root: string; paths: readonly string[] }) {
  const repository = path.resolve(root);
  const manifests = await discoverVersionedManifests({ root: repository });
  const workspaces = await Promise.all(manifests.filter(file => file !== "package.json").map(async file => {
    const input: unknown = JSON.parse(await readFile(path.join(repository, file), "utf8"));
    const manifest = record(input);
    if (typeof manifest?.name !== "string") throw new Error(`Missing package name: ${file}`);
    return { name: manifest.name, directory: path.posix.dirname(file), manifest: file, dependencies: ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap(kind => Object.keys(record(manifest[kind]) ?? {}).map(name => ({ name, kind, source: `${file}#${kind}`, target: name }))) };
  }));
  if (new Set(workspaces.map(item => item.name)).size !== workspaces.length) throw new Error("Workspace package names must be unique.");
  workspaces.sort((a, b) => b.directory.length - a.directory.length);
  const ownerOf = (file: string) => workspaces.find(item => file.startsWith(`${item.directory}/`) || file === item.directory);
  const evidence = await inspectSourceEvidence({ root: repository, directories: workspaces.map(item => item.directory) });
  const buildInputs: { consumer: string; source: string; kind: string; target: string }[] = [];
  for (const reference of evidence.references) {
    const consumer = ownerOf(reference.source);
    const dependency = reference.packageName ? workspaces.find(item => item.name === reference.packageName) : ownerOf(reference.target);
    if (!consumer) continue;
    if (dependency && dependency !== consumer) consumer.dependencies.push({ name: dependency.name, ...reference });
    else if (!dependency && !reference.packageName && reference.kind !== "source-import") buildInputs.push({ consumer: consumer.name, ...reference });
  }
  const changed = paths.map(file => {
    const normalized = path.relative(repository, path.resolve(repository, file)).replaceAll("\\", "/");
    if (!normalized || normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) throw new Error(`Changed path must be inside the repository: ${file}`);
    const owner = ownerOf(normalized);
    return { path: normalized, owner: owner?.name ?? null };
  });
  const affected = new Map<string, string[]>();
  for (const item of changed) if (item.owner) affected.set(item.owner, [item.owner]);
  const matchedInputs = buildInputs.filter(input => changed.some(item => item.path === input.target || new Bun.Glob(input.target).match(item.path)));
  for (const input of matchedInputs) if (!affected.has(input.consumer)) affected.set(input.consumer, [input.target, input.consumer]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const consumer of workspaces) {
      if (affected.has(consumer.name)) continue;
      const dependency = consumer.dependencies.find(item => affected.has(item.name));
      if (!dependency) continue;
      affected.set(consumer.name, [...affected.get(dependency.name) ?? [], consumer.name]);
      progress = true;
    }
  }
  const consumers = workspaces.filter(item => affected.has(item.name)).map(item => {
    const targets = Object.entries(profiles).filter(([target, profile]) => target === "packages" ? item.directory.startsWith("packages/") && item.name !== "@hyperfocus/engine" : profile.documents.some(document => document.startsWith(`${item.directory}/`)));
    return {
      name: item.name, directory: item.directory, via: affected.get(item.name),
      dependencyEvidence: item.dependencies.filter(dependency => affected.has(dependency.name)),
      buildInputEvidence: matchedInputs.filter(input => input.consumer === item.name),
      validationRoutes: targets.map(([target, profile]) => ({ target, plan: ["bun", "run", "ship-check", target, "--plan"], documents: profile.documents })),
    };
  });
  return {
    schema: "hyperfocus-change-impact-v1", root: repository, changed, consumers,
    status: "discovery-only",
    sourceScan: { scannedFiles: evidence.scanned, computedImports: evidence.computedImports, skippedFiles: evidence.skipped },
    unknowns: [
      "Static candidate reachability from manifests, literal source imports, node:path calls anchored at import.meta.dir and self-relative CMake paths. These may include conditional, test-only or unused inputs; they are not observed runtime dependencies.",
      "Computed imports/paths, aliases, generated sources, evaluated CMake configuration, external consumers and other build inputs still need inspection. Source scanning skips hidden, generated, vendor and build directories, links and files larger than 1 MiB.",
      "Routes select existing product gates, not a minimal test set. No checks were run and no acceptance is implied.",
      ...changed.filter(item => item.owner === null).map(item => `No workspace owner for ${item.path}; root tooling or policy changes may affect every product.`),
    ],
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

/** Routing view; full source evidence remains available on demand. */
export function summarizeChangeImpact(report: Awaited<ReturnType<typeof inspectChangeImpact>>) {
  return { ...report, schema: "hyperfocus-change-impact-summary-v1", consumers: report.consumers.map(consumer => ({
    name: consumer.name, directory: consumer.directory, via: consumer.via,
    dependencyEvidenceCount: consumer.dependencyEvidence.length, buildInputEvidenceCount: consumer.buildInputEvidence.length,
    validationRoutes: consumer.validationRoutes.map(route => ({ target: route.target, plan: route.plan })),
  })), detail: "Omit --summary to inspect source locations and owning documents before selecting checks." };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let summary = false;
  const paths: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--summary") {
      if (summary) throw new Error("Repeated --summary.");
      summary = true; continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--") || !["--root", "--path"].includes(flag ?? "")) throw new Error("Usage: bun scripts/project-discovery/impact.ts [--root <repository>] --path <changed-path> [--path <changed-path>] [--summary]");
    if (flag === "--root") root = value; else paths.push(value);
  }
  if (!paths.length) throw new Error("Provide at least one --path to inspect.");
  const report = await inspectChangeImpact({ root, paths });
  console.log(JSON.stringify(summary ? summarizeChangeImpact(report) : report, null, 2));
}
