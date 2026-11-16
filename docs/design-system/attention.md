# Attention and presentation

[DESIGN.md](../../DESIGN.md#respect-limited-attention) owns the rules approved by
the user on 2026-10-26. This page owns the research and cross-project audit.

## Research

Reviewed 2026-10-26; these findings support the user's direction, not a claim that
all interface text or labels should disappear.

- [NN/g: aesthetic and minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/):
  low-value elements compete with useful information. Prioritize task relevance.
- [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  defer infrequent detail, keep common needs visible, and label the route to more.
- [GOV.UK: buttons](https://design-system.service.gov.uk/components/button/):
  one main call to action makes the next step clearer; action text describes its result.
- [NN/g: icon usability](https://www.nngroup.com/articles/icon-usability/):
  recognition depends on context and experience. Preserve visible labels when an
  icon is ambiguous; accessible names alone do not establish visual comprehension.

The resulting implementation choice is to remove redundant copy, disclose useful
supporting detail, preserve critical state and prefer familiar icons selectively.
One-primary is an attention budget, not a requirement to fill every page with a CTA.

## Implementation and coverage

The 2026-10-26 pass scanned 426 application/example TSX files and the authored
engine-example HTML entrypoints. It changed owning controls and templates rather
than modifying generated bundles alone. Existing unrelated work was preserved.

| Surface | Result | Evidence boundary |
| --- | --- | --- |
| Shared UI | Secondary button default, explicit primary emphasis, supporting-pane priority, host-owned HomeButton, pointer cursors | Control regressions; real Books, builder, Harness and PadPilot consumers |
| Books | Export/print/reset menu, optional scope/export and draft details, quieter metrics, one action across main/detail panes, brand returns to library | Desktop/390px, menu and disclosure, home navigation; draft, print-scope and correction-link regressions |
| Harness | Home selects Projects, optional setting explanations, shorter first-run copy, secondary default for local buttons | Real desktop/390px; preference and project-sidebar tests; native launcher not requalified |
| Engine Editor / Sites | Brand opens project home without replacing the project; builder returns to home page without reloading; inspector actions support Save draft | Real desktop/390px, current-project preservation, editor build and type checks |
| Trade Bot | Single page heading, quieter repeated actions, optional connection metadata | Existing paper workspace at desktop/390px; no trading commands sent |
| PadPilot | Brand opens Modules while the active module stays mounted; optional FX control help; quieter settings | Disposable browser host, desktop/390px; module preservation and FX tests. DAW/DSP acceptance is separate |
| PadPilot marketplace | Inherits website renderer and shared controls; no separate app chrome was found in the service | Template/build evidence; live marketplace purchase not exercised |
| Juice Me Up | Hero CTA remains primary; supporting sections use links, delivery checker is secondary, collection details expand | Exported actual project, disposable local preview at desktop/390px; original project and production unchanged |
| Engine examples | Motion Lab heading/home and buttons; MMO Field control disclosure; Three Arena settings copy/buttons | Source inspection/build. First-party 3D, Magic Map, MMO Skill Demo and drawing demo had no equivalent routine subtitle/navbar violation; native/gameplay acceptance not repeated |
| Touch of Death | Existing bounded game-menu composition already owns primary priority; shared dock/control cursor changes apply to its editor | Source and shared-package checks, no new game-art or gameplay claim |
| Swarm worker | No independent application view; receives the portable AI design guidance | Source inventory, generation-guidance regressions |
| Local album tools | Removed viewer instructions subtitle, disclosed folder/filter/keyboard detail, clickable title; album library uses one primary action | Regenerated existing ten-film album, viewer arrows/Escape/focus return, library desktop/390px; media and mix approvals untouched |

`hyperfocus/ui-attention` rejects unconditional competing primary actions, inert
navbar brands and unclassified `subtitle` paragraphs. Its regression suite is part
of `test:repository`. Conditional views, CSS emphasis, dynamically generated HTML
and copy quality still require rendered review. AI design-context injection carries
the same task-level guidance without repository-specific paths.

The new tests, changed-source lint, package/application type checks, and Editor,
Website, Harness and PadPilot builds passed. The wider application-boundary test
still reports native selects in the existing music-video player/report generators;
this pass does not claim a green whole-repository gate. PadPilot's normal local
database also references a missing `006-protobuf-payloads.sql` migration, so its
browser evidence uses a new disposable database.

## Verification boundary

Static checks can detect explicit competing actions and inert brand controls;
they cannot judge whether a sentence earns its space or an icon is understandable.
Review actual views with realistic data and inspect keyboard, narrow layout,
home navigation, draft preservation and disclosed information. Screen-only copy
changes must not remove scope or correction context from exported reports.

Local captures belong in `.local/design-system/attention-2026-10-26/`;
they may be pruned after this audit's acceptance. Native host and production
deployment acceptance remain distinct from local browser evidence.

Raw logs, source inventory, baseline copies and named captures are in that local
directory. PadPilot and Juice Me Up lack matching rendered before captures;
their source baselines and final rendered evidence are retained separately.
The user's direction is approved; these final screenshots have not
received separate human taste approval. The Juice Me Up candidate is under
`apps/engine-editor/website/examples/juice-me-up/releases/attention-2026-10-26/site/`;
deploying it remains a separate action.

## Shared identity and source examples

The [follow-up outcome and remaining boundaries](project-authoring.md) record the
shared abstractions, editor repairs, promoted local tools and verification.

The follow-up uses the approved SVG direction and visual-plus-source authoring choice. [Branding](../../packages/branding/README.md) owns reusable identity assets and OG metadata; [example projects](../../apps/engine-editor/example-workspace/README.md) owns copied source workspaces, visual preferences and remaining tooling limits. [Album presentation](../../scripts/albums/README.md) now has a repository owner and an installation receipt. Hosted copies have not been republished by these local changes.
