---
name: audit-evidence-review
description: Review existing audit claims, evidence provenance and the code that produced them. Use for evidence adequacy, testing/lint friction and requested repairs; new product journeys use user-audit.
---

# Audit Evidence Review

Trace a reported outcome back to the frozen goal, sampled persona, selected
attempt, actual artifact, raw result and decisive domain state. Separate inventory,
execution, mission acceptance and human judgment. Preserve unsupported historical
claims with a correction ledger; keep raw receipts immutable.

## Establish the evidence boundary

Use the [audit reconciliation owner](../user-audit/references/evidence-reconciliation.md)
for hash bindings, assertion IDs, persona dispositions and campaign compilation.
Run its existing checker when the inputs support it. Missing bound verification
means acceptance is unassessed; it does not establish a product failure. Do not
retrofit easier checks to make an old run pass.

Inspect representative complete, partial and failed attempts, including a replay
when present. Read screenshots with their result receipts: a visible button,
download request or open modal may omit the state needed to establish the goal.
Trace suspicious claims through their producing scenario and actual product code.
Code-only evidence needs commands, outputs and domain values. Public-consumer
claims also need the [package boundary](../../../docs/package-testing.md).

## Choose the requested lenses

Load only the research that changes the review:

- Cost, representation and API control: [Muratori research](../../../docs/research/casey-muratori.md).
  Count copies, retained data and work in a real consumer before proposing layers
  or optimizations. Separate work counts from comparable latency measurements.
- Correctness and comprehensibility: [Blow research](../../../docs/research/jonathan-blow.md).
  Follow state authority, revisions, failure atomicity and the edit-to-observed-result
  path. A smaller source file or green runner does not prove these outcomes.
- UX and reviewability: the requested task, observed input mode and
  [design contracts](../../../DESIGN.md). Check decisive states, recovery and focus
  in the real interaction. Simulated modifiers and DOM proxies do not establish
  human comprehension, taste or assistive-technology experience.

Named practitioner lenses are interpretations of sourced work, not reviews by
those people. Research new or uncertain claims from primary sources. Keep model
criticism advisory and support conclusions with raw observations or independent
domain oracles.

## Repair the owner and report the limit

For authorized fixes, preserve the failure and add the regression at the actual
boundary. Route product changes through its scoped guidance. Put repeated evidence
operations in [album tooling](../../../scripts/albums/README.md) or the audit owner;
keep generated runs in `.local/`. Maintain executable browser behavior as checked
source and exercise its rendered consumer. Lint owns enforceable syntax/boundary
rules; runtime checks own state and user outcomes.

Deliver ranked findings with trigger, impact, supported cause, exact evidence and
fix status. Correct derived reports when their claims are unsupported, retain
failed attempts, and state unassessed scope. Promote reusable rules once in their
owning skill/doc/tool; the [evidence review audit](../../../docs/audits/user-audit-evidence.md)
records the originating cases and research rather than duplicating policy here.
