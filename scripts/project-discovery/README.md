# Project and change discovery

`bun run inspect:project --root <directory>` lists declared tasks without executing
them. Workspace members may inherit a package manager from an ancestor whose
workspace patterns explicitly include that member. Local manager declarations or
lockfiles remain authoritative; unsupported or ambiguous evidence stays unknown.
Nested projects outside those patterns do not inherit the repository toolchain.
Excluded/unsupported workspace patterns remain unresolved; linked paths and
ambiguous local lockfiles cannot supply inherited authority.
Use the returned commands from the selected project directory; discovery is not
proof of setup, successful checks or user acceptance.

## Change impact

From the repository root, run `bun run inspect:impact --path <changed-file>`.
Repeat `--path` for multiple changes; `--root` selects another repository with
the same supported `directory/*` workspace layout. Removed files can be queried.
Use `--summary` for initial routing: it keeps owners, consumer paths, gate plans,
scan limits and evidence counts without dumping every dependency edge. Omit it
when examining the actual source locations; summary is not a validation result.

The JSON combines reverse manifest dependencies with source evidence: literal
imports/re-exports, literal dynamic imports, imported `node:path` join/resolve
calls anchored directly at `import.meta.dir`, and self-relative paths in CMake
files. Evidence includes its source file and line. CMake root inputs such as
`bun.lock` can identify a native consumer even without a workspace owner.
Validation routes point to existing product gate plans; nothing is executed.

This is a conservative candidate graph, not a compiler dependency graph or a
minimal test selector. Tests, conditional and unused references can widen results.
Computed expressions, variable aliases, generated inputs, CMake variable expansion
and configuration, shell scripts and external consumers remain unassessed. Scan
statistics expose computed imports and skipped files. Scanning skips hidden,
generated, vendor and build directories, symlinks, and files larger than 1 MiB.
Unknown root ownership remains explicit even when one consumer is identified.

The repository has two concrete reasons to preserve these extra evidence paths:
the engine's game build uses the Editor standalone entry, and PadPilot's CMake
build names shared AI sources and the repository lockfile. Neither implies a new
shared package or automatically enforces an architecture boundary.

Verify changes with `bun test scripts/project-discovery`. Tests cover transitive
manifest/source reachability, cycles, native globs and root inputs, false imports
inside prose/comments, computed imports and bounded source reads.
