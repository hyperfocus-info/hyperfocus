---
name: market-research
description: Research competitors, public repositories, documentation, changelogs, pricing, or user-provided links and translate the evidence into Hyperfocus product guidance. Use for market comparisons or evidence-backed updates to `docs/harness/todo.md`; do not use for generic web summaries unrelated to this repository.
---

# Market Research

Research external products for product direction, not feature tourism.

Use `update-harness` when changing harness docs or product-facing behavior.

## Workflow

1. Read local context first:
   - `docs/harness/todo.md`
   - `apps/harness/README.md`
   - any local context docs tied to researched area
2. Read provided links directly before broad searching.
   - Prefer primary sources.
   - For latest or unstable claims, verify with browsing.
3. If link is GitHub repo, inspect at least:
   - `README.md`
   - product site if linked
   - recent releases or changelog
   - open issues for repeated pain or top-demand features
   - roadmap or TODO file if present
4. If link is product or docs site, inspect at least:
   - landing page
   - getting started flow
   - docs nav
   - pricing or packaging if visible
   - changelog or release notes if visible
5. Separate evidence from inference.
   - Evidence: shipped features, docs, issues, release notes, user complaints
   - Inference: why those features matter, what loop is sticky, what likely drives PMF
6. Load [references/pmf-lens.md](references/pmf-lens.md) when rewriting roadmap bets or doing multi-source comparison.
7. Patch local docs when research changes product direction.
   - Update `docs/harness/todo.md` with highest-signal bets, not full competitor parity
   - Rewrite broad ideas into smaller PMF-focused bets when useful
   - Update `apps/harness/README.md` only when shipped behavior or durable product direction materially changes
   - Keep markdown conceptual, brief, and light on code references

## Output Shape

Start with highest-level summary first.

Then cover:

- what product seems optimized for
- sticky loops or user value wedges
- strongest gaps or opportunities for this repo
- recommended `docs/harness/todo.md` edits, with priority
- risks, non-goals, or likely distractions
- sources used, with explicit notes on inference

## Heuristics

- Optimize for PMF signal: activation, daily loop, trust, inspectability, portability, background reliability
- Prefer repeated pain signals over isolated flashy features
- Do not cargo-cult features from larger tools with different users or distribution
- Treat GitHub issues, release velocity, packaging, and onboarding friction as market signals
- Prefer 3-5 strong roadmap changes over long feature dumps
- If target is ambiguous and local context cannot resolve it, ask one narrow clarifying question

## Link Handling

Accept one or more links.

Common inputs:

- GitHub repositories
- docs pages
- landing pages
- changelogs
- pricing pages
- issue trackers
- blog posts
- app listings

When user gives only a product name, search for official site, docs, repo, and recent release or issue signals before answering.
