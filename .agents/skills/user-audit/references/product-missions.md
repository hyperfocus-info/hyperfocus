# Product missions and surface coverage

## Discover product surfaces

Resolve scope from repository facts on every audit. Do not keep a static allowlist that will omit future apps.

- Inspect workspace manifests, `apps/*`, runnable package scripts, public engine entrypoints, packaging scripts, and the documentation map.
- Treat a packaged or bootstrap launcher as a product surface when its install, startup, update, or recovery experience differs materially from source development.
- Treat framework-neutral public code, CLI, and API workflows as user-facing surfaces even when they have no graphical UI.
- For a requested all-app or repository-wide audit, create a coverage inventory and one independently seeded mission run per discovered surface. Record any surface that cannot run and why.
- For an app-specific request, stay within that product and the dependencies needed to complete its mission.

Route implementation through the narrowest owning instructions and skill. Current examples include engine guidance for public engine work, `hyperfocus-editor-agent` for editor project operations, and `update-harness` for Harness or launcher behavior. Use `app-ui-standard` whenever a first-party UI changes.

## Resolve documentation-backed coverage

Use canonical docs to choose and report audit coverage. Do this before interacting
with the product so the mission is tied to durable repository expectations.

- For first-party UI surfaces, start with `docs/user-stories.md`, read the owning
  story inventory, and record the story IDs the mission should exercise. Also read
  the listed coverage owner: Harness uses `docs/harness/coverage-matrix.md`, the
  engine editor uses its README verification section, and shared UI uses
  `docs/package-testing.md`.
- For Harness audits, map shipped `US-*` stories to the coverage matrix and call
  out `GAP-HIGH`, `GAP-MED`, or `GAP-LOW` rows that the mission touches. Roadmap
  stories may guide exploratory findings, but do not treat unbuilt roadmap stories
  as regressions in shipped behavior.
- For package, code/API, CLI, or framework-neutral workflows, read
  `docs/package-testing.md` and the nearest package README. Map the mission to the
  Package Matrix expectations, then capture the package-local or root verification
  commands that prove public exports, validation, error handling, state transitions,
  UI behavior, performance gates, or package-consumer behavior as applicable.
- For repository-wide audits, produce a surface inventory that has one row per
  discovered app, launcher, shared UI surface, and package/API surface. Each row
  must name its story owner or package-testing route, selected mission, evidence
  path, and untested gaps.
- If a surface has no user-story owner or package-testing route, record that as a
  documentation drift finding before continuing with best-effort product evidence.

## Define a real user mission

Every run needs a `surface` and an outcome-oriented `goal`. The goal must produce an artifact or externally observable state and be credible for that product. Do not substitute "explore the UI," "click every tab," or a list of controls.

Examples:

- Engine code/API: build a small Mario-like platformer with movement, collisions, a collectible, a win state, and a runnable verification artifact.
- Editor: create and export a short music video with timed visual changes and a playable preview.
- Harness: create a small SaaS product from a written requirement, inspect the plan, execute it, and verify the generated app.
- Launcher: install or start from a clean environment, recover from one realistic setup failure, and reach a working project.

Record the mission before interaction. Define success criteria from the requested outcome, product contract, and selected persona. Judge the whole journey: setup, creation, iteration, error recovery, completion, and the quality of the resulting artifact.

## Live inference

For this repository's user-audit workflow, use real configured inference for user actions that query AI; do not replace those interactions with mocked model answers. Deterministic fixtures remain appropriate for rare non-AI state setup, transport failures, and regression tests after the live journey has exposed a finding.

- Prefer `gpt-5.6-luna` with reasoning effort `low` for audit inference.
- If the active runtime advertises a fast or instant execution option compatible with that model, enable it. Do not invent or hard-code an undocumented "instant" model id.
- If Luna is unavailable, record the runtime's discovered models and ask before selecting a materially more expensive fallback. A non-AI product mission may continue without inference.
- Use the user's configured credentials through the product's normal runtime. Never copy keys into audit artifacts, screenshots, prompts, or source files.
- Keep prompts and turns to those needed for the mission. Record the requested and effective model, reasoning effort, acceleration/service tier, number of model turns, failures, and any available token or cost usage.
- Evaluate model output as part of the product experience: latency, progress truthfulness, clarification quality, controllability, artifact correctness, and recovery all count.

The preferred model and low reasoning setting are supported by the official OpenAI model documentation. Runtime availability and accelerated service tiers must still be discovered from the active product rather than assumed.
