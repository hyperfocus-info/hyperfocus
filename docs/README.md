# Documentation map

Use this page as a router. Start with the smallest document that owns the question,
then follow its related links only when the task crosses a boundary.

## Repository

- [Root README](../README.md): product map, packages, applications, setup, and common commands.
- [Repository code style](code-style.md): imports, type modeling, assertions, composition, and component declaration order.
- [Documentation governance](documentation-governance.md): canonical doc ownership, duplicate-doc cleanup, temporary docs, and drift control.
- [Architecture](architecture.md): dependency direction and ownership boundaries.
- [Distribution](distribution.md): editor, harness, and library packaging.
- [Versioning](versioning.md): shared app/package version line and branch patch bumps.
- [Package testing](package-testing.md): shared library verification expectations for `packages/*` and `@hyperfocus/engine`.
- [User story inventories](user-stories.md): route to first-party UI and shared UI story docs.
- [Licensing](licensing.md): repository license scope and release requirements.
- [Migration status](migration/status.md): completed monorepo work and remaining migration debt.
- [Solid 2 RC spike](migration/solid-2-rc-spike.md): tested upgrade contract, source inventory, and ecosystem blockers.
- [Migration provenance](migration/provenance.md): source history and import provenance.
- [Repository TODO](../TODO.md): cross-product migration, distribution, and release work.

## Product areas

- [Engine guide](../packages/engine/readme.md): public package contract, imports, commands, and verification.
- [Engine topic index](../packages/engine/docs/README.md): focused guides for projects, runtimes, 3D, servers, performance, and readiness.
- [Engine editor guide](../apps/engine-editor/README.md): authoring workflow, automation, persistence, and builds.
- [Harness guide](../apps/harness/README.md): shipped product behavior, local workflow, runtime shape, and testing.
- [Harness product docs](harness/README.md): roadmap, user stories, coverage, audits, and research notes. This is intentionally separate from the shipped-behavior README.

## Shared packages and UI

- [Application design standard](../DESIGN.md): first-party UI behavior and acceptance criteria.
- [StyleX integration](stylex.md): Solid/StyleX compiler and styling boundary.
- [`@hyperfocus/ai-core`](../packages/ai-core/README.md): portable harness protocol and client.
- [`@hyperfocus/workspace`](../packages/workspace/README.md): portable filesystem and task contracts.
- [`@hyperfocus/ui`](../packages/ui/README.md): reusable Solid presentation.
- [Desktop runtime](../packages/desktop-runtime/README.md): framework-neutral local desktop primitives.
- [Performance evidence helper](../packages/performance/README.md): repository-only environment labels shared by benchmark reports.

## Where examples belong

- User-facing setup and the shortest common commands belong in the nearest README.
- Detailed API examples belong beside the owning package or in its focused guide.
- User stories belong in the owning story inventory routed by [User story inventories](user-stories.md).
- Library verification policy belongs in [Package testing](package-testing.md), with package READMEs linking there instead of repeating it.
- Repeatable maintenance and audit commands belong in the owning skill's `scripts/`
  directory; its `SKILL.md` should link to them instead of reproducing their logic.
- Historical investigation, audits, and roadmap evidence belong in a clearly named
  topic folder and should be linked from that folder's index, not from every README.
- Temporary tracked Markdown files must end in `.tmp.md`; otherwise keep scratch
  notes under untracked `.local/`.

Related: [repository agent guidance](../AGENTS.md) explains how contributors should
load and maintain this documentation graph.
