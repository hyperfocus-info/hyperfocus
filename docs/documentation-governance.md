# Documentation Governance

This is the source of truth for documentation ownership in this repository. Keep
the graph shallow: a document either owns a fact or routes to the owner.

## Ownership

- `README.md` owns the repository overview, package/app map, setup, and common
  commands.
- `docs/README.md` owns navigation. It should point to the smallest document that
  answers a question and should not restate that document.
- App and package READMEs own shipped behavior, public contracts, local workflow,
  and verification commands for their nearest code.
- Product planning, research, audits, story inventories, and coverage matrices live
  in the product docs folder named by `docs/README.md`.
- Implementation details live beside the source or test that owns them.
- Repeatable procedures belong in scripts. Markdown may explain when to run a
  script, but should not mirror its logic.

The harness split is intentional: [apps/harness/README.md](../apps/harness/README.md)
describes shipped behavior and local workflow, while
[docs/harness/README.md](harness/README.md) routes roadmap, user stories, coverage,
audits, and research evidence.

## Agent Context

Prefer short, stable, high-signal docs that route to focused references. Agents
should load the root instructions, the nearest README, and one task-specific route,
then search locally for exact symbols or facts.

Research basis:

- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
  documents lower latency and input cost when repeated prompt prefixes stay stable.
- [Anthropic context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
  emphasizes compacting history and keeping critical decisions while dropping
  redundant tool output.
- [GitHub Copilot CLI guidance](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-best-practices)
  says custom instructions should be concise and actionable because long
  instructions can dilute effectiveness.
- [AGENTS.md guidance](https://agents.md/) treats repository instructions as a
  predictable place for agent-specific context.
- Recent AGENTS.md studies report mixed outcomes: one
  [arXiv study](https://arxiv.org/abs/2601.20404) observed lower runtime and
  output-token usage with repository instructions, while another
  [arXiv study](https://arxiv.org/abs/2602.11988) found that unnecessary
  requirements can increase cost and hurt success. The practical rule here is
  minimal durable requirements, not maximal context.

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

Tracked temporary Markdown files must end in `.tmp.md`. Prefer `.local/` for
throwaway notes that should never be committed. A temporary doc must not be linked
from a permanent index unless the link clearly marks it temporary and names the
condition for deletion or promotion.

## Related

- [Documentation map](README.md)
- [Repository guidance](../AGENTS.md)
- [Package testing](package-testing.md)
- [User story inventories](user-stories.md)
