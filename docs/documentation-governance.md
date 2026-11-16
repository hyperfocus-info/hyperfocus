# Documentation Governance

This is the source of truth for documentation ownership in this repository. Keep
the graph shallow: a document either owns a fact or routes to the owner.

## Keep docs concise

Lead with what the reader needs to decide or do. Keep current contracts, commands
and unresolved limits; remove repeated explanations, generic advice and superseded
instructions. Link to existing owners instead of copying their context.

When a document mixes substantial topics with different readers or lifecycles,
split those topics and keep a short entrypoint. Do not fragment a coherent guide
just to meet a length target. Separate current guidance from release and experiment
history; retain durable decisions and necessary evidence, with raw run output in
`.local/`. Document size is a review signal, not proof of bloat.

## Ownership

- `README.md` owns the repository overview, package/app map, setup, and common
  commands.
- `docs/README.md` owns navigation. It should point to the smallest document that
  answers a question and should not restate that document.
- App and package READMEs own shipped behavior, public contracts, local workflow,
  and verification commands for their nearest code.
- Durable product planning, research, maintained audits, story inventories, and coverage matrices live
  in the product docs folder named by `docs/README.md`.
- Implementation details live beside the source or test that owns them.
- Repeatable procedures belong in scripts. Markdown may explain when to run a
  script, but should not mirror its logic.

The harness split is intentional: [apps/harness/README.md](../apps/harness/README.md)
describes shipped behavior and local workflow, while
[docs/harness/README.md](harness/README.md) routes roadmap, user stories, coverage,
audits, and research evidence.

## Agent guidance

Root `AGENTS.md` carries cross-repository invariants and conditional routes.
Scoped instructions add only constraints that differ locally. Read the section
that owns the task; neither a README nor a topic index is a preload requirement.

| Knowledge | Owner |
| --- | --- |
| Enforceable behavior/default | Code or schema |
| Reproducible failure/invariant | Test or validator |
| Repeated fragile procedure | Script with bounded inputs and failure reporting |
| Constraint across a subtree | Scoped `AGENTS.md` |
| Specialized repeatable workflow | Skill with a precise what/when description |
| Context, tradeoff, approved decision | Owning reference/product document |
| Invariant needed on nearly every task | Root `AGENTS.md` |

Prefer one owner and links over copied rules. Harness launcher skills must be
self-contained after packaging; repository and example policy must not leak into
user projects. Do not copy model-specific tuning into shared project instructions.

Skills have three loading levels: description, selected `SKILL.md`, then only the
references/scripts needed for that invocation. Keep detailed mode instructions one
link from the skill. Tiny skills need no extra files. Remove generic tutorials and
obsolete workflows rather than moving them into a reference nobody needs.

Describe freedom when it prevents mistakes:

- **High:** state the outcome, invariants, and completion boundary; implementation,
  investigation, and subjective tradeoffs need judgment.
- **Medium:** identify canonical primitives and decision criteria where a preferred
  pattern exists, such as UI composition or API integration.
- **Low:** bind migrations, persistence, release/version operations, process cleanup,
  and generated artifacts to their actual scripts/contracts and failure handling.
  Do not turn those constraints into a universal recipe for unrelated edits.

Local authorized work continues through proportionate validation and repair.
Preparing artifacts does not authorize external publication or destructive actions.
A new approval checkpoint must protect a concrete boundary, not compensate for a
vague workflow. A review-only task still stops at findings.

### Validate guidance changes

Run `bun run check:agent-guidance` for skill metadata, local reference integrity,
and packaged-scope links, and `bun test scripts/context-audit` when changing those
checks. `bun scripts/context-audit/cli.ts --json` inventories sizes and duplicates;
sizes are UTF-8 bytes and whitespace words, not model tokens.

For substantial routing changes, [guidance scenarios](../scripts/context-audit/scenarios.json)
provide representative requests and criteria. Use an independent execution only
when it resolves a material routing uncertainty; another agent is not a mandatory
gate for prose. Assess selected guidance, irrelevant routes skipped and completion
depth. Structural checks alone cannot establish behavioral quality. Keep model,
tools and task fixed for comparisons; distinguish simulations from executed tasks.
Use [outcome engineering](agent-outcomes.md) for task acceptance and the concise
executive summary; its receipt checker is optional when machine evidence helps. The
[executed evaluation record](audits/agent-outcomes.md) preserves observed failures,
repairs and comparison limits; a structural pass or a better-written plan is not
evidence of improved product outcomes.

The design draws on [Anthropic's skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
and [OpenAI's instruction audit guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra):
retain non-obvious project knowledge, disclose it on demand, and test whether it
changes the agent's behavior usefully. These are principles, not model requirements.

### Subjective decisions

Use current explicit preferences and approved references before inferring taste.
Legacy implementations and successful tests establish behavior, not user approval.
When evidence conflicts or is insufficient for a material choice, ask about concrete
alternatives and their consequences. Prefer screenshots/A-B examples for visual
choices; continue work that does not depend on the answer.

After an answer, keep task-local preferences in the task. Put reusable product
decisions in the owning product/design document; put shared UI decisions in
[DESIGN.md](../DESIGN.md) or its relevant visual-system reference. Record the
decision, applicable scope, approval source/date, and example or counterexample.
Update the owning default/test where enforceable and replace superseded guidance.
Silence, generated ratings, and an agent's own judgment do not establish approval.
Do not ask again when the existing decision covers the case.

## Duplicate Docs

When two docs answer the same question:

1. Pick the owning document nearest the behavior or product decision.
2. Move durable facts there.
3. Replace duplicate text with a one-sentence summary and a link.
4. Keep only local context that changes how the reader should use the owner.

Do not add a new branch to the graph unless the existing owner would become too
large or would mix unrelated lifecycles.

## Drift Control

Every behavior change should update documentation in the same change when it alters
any of these surfaces:

- shipped behavior, commands, options, setup, or public contracts;
- user-visible UI flows, states, recovery paths, or accessibility behavior;
- package exports, validation boundaries, persistence, runtime, or protocol shape;
- tests, coverage expectations, or verification commands.

Before handoff, search the owning term across READMEs, docs, tests, and scripts.
Fix stale links and remove contradicted claims. If a doc and implementation disagree,
either update the doc or file the discrepancy in the canonical TODO or coverage
document; do not leave both as apparent truth.

## User Stories

All first-party UI surfaces need a user-story route. Use
[User Story Inventories](user-stories.md) to find the owner.

Material UI changes must update the affected story document in the same change.
Harness changes also update [coverage-matrix.md](harness/coverage-matrix.md) when
they add, remove, or materially alter a `US-*` story.

## Package Testing

Library test expectations live in [Package Testing](package-testing.md). Package
READMEs should stay focused on the public contract and link to that guide rather
than repeating the whole testing policy.

`@hyperfocus/engine` lives at `packages/engine`; treat its README, topic index,
release checks, and package-consumer smoke tests as package documentation.

## Temporary Docs

Temporary artifacts belong in the nearest `.local/` directory, including albums,
screenshots, generated review packets, one-run audits, logs and disposable fixtures.
Temporary Markdown ends in `.tmp.md`, including notes already inside `.local/`.
Name the owner and a concrete `Prune after:` condition. At task completion or the
next audit, promote reusable decisions, unresolved defects and approved preferences
to their existing owner, then prune expired notes and reproducible outputs. Do not
delete unique user feedback, canonical projects, databases or approved source assets
as scratch merely because they live in `.local/`; preserve or explicitly archive them.

Keep durable product contracts, maintained finding queues and curated approved
references with their owning docs. A date or the word "audit" alone does not make
such a document temporary. Permanent indexes may link local evidence only when it
is labeled temporary/local and its deletion or promotion condition is stated.
Generated evidence is not a prerequisite for reading permanent documentation.

Before adding a helper, search the existing skill, script or package that owns the
workflow. Add reusable capabilities there, with bounded inputs, failure reporting
and appropriate verification. `.local/` may contain one-off probes and run data,
but must not become a second maintained tooling tree. When a probe recurs, move
its useful capability into the existing owner and retire the duplicate entrypoint.
Repository checks reject Git candidates under `.local/`, temporary Markdown outside
it, and generated design-review evidence under `docs/`.
Use `bun scripts/context-audit/cli.ts --root <local-notes-directory> --json` to
inventory each `.tmp.md` owner and pruning condition; missing metadata is flagged.
The inventory is read-only. Review the condition before pruning a note.

## Related

- [Documentation map](README.md)
- [Repository guidance](../AGENTS.md)
- [Package testing](package-testing.md)
- [User story inventories](user-stories.md)
