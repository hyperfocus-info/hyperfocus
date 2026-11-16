# Audit evidence, review tooling and acceptance gaps

Reviewed November 2, 2026 against the local 500-seed campaigns and their producing
code. Muratori and Blow are research lenses derived from their published work,
not actual reviewers. The UX lens inspected representative screenshots and task
receipts. This is an engineering/expert review; human comprehension, preference
and assistive-technology experience remain unassessed.

## The main gap is between executing work and proving the requested outcome

The campaigns have 500 distinct frozen seeds and persona IDs. That establishes
inventory, not 500 independent human observations or mission completion.

| Finding | Evidence and consequence | Current action |
| --- | --- | --- |
| P1: easier operations promoted to complete | The package producer performs one common operation per group, then marks every mission complete. Of 55 package claims, 45 lack proof of their frozen goal. Serialization 006 asks for malformed/oversized rejection and preservation, but records valid roundtrips. | Withdraw aggregate completion totals; preserve raw results and a per-run correction ledger. Ten cases support narrower source API smoke only. |
| P1: a safe stop promoted to installation | Marketplace 003/008/013/018 require library installation and version verification; their scenario cancels higher-trust review and treats displayed terms as completion. | Four additional unsupported complete labels recorded. Consent review remains useful evidence at its actual scope. |
| P1: persona identities exceed assessed reactions | All 55 package runs lack reaction dispositions; Marketplace reuses a heading/control count for every modifier. | Treat these dimensions as unassessed. Existing frozen check/reaction requirements remain the acceptance owner. |
| P1: pictures lose authority | Flattened captions discarded original source/attempt/result identity, while pilots and replays looked alike. The PadPilot modal even obscures the decisive parameter. | Import explicit capture records with persona, seed, attempt, source and linked result receipt. Imported outcomes remain unassessed. Capture the decisive domain state in future journeys. |
| P2: browser code escaped static checking | Substantial JavaScript lived inside HTML strings; recurring `.local` producers bypassed import, type and lint rules. | Maintain browser TypeScript separately, bundle it into the portable artifact, and register importer/catalog tests in `test:repository`. Keep generated data excluded. |
| P2: verifier skipped a required test | `#kindFilter` did not exist; the generator used `#mediaFilter`. Missing controls were silently skipped and image-only reports claimed video checks. | Required controls fail closed; subset filters, paging, search recovery and focus return are exercised. Reports state sampled/full decoding and actual modality. |

The historical 355/145 and added-cohort 180/70 completion totals are withdrawn as
authoritative acceptance counts. The reviewed subset contains **49 unsupported
complete labels**; subtracting those does not validate the remaining aggregate.
The local report retains historical numbers and raw outcomes, alongside the
correction ledger. File-presence reconciliation is labeled inventory only.

The new `quality/campaign.ts` compiler reuses the existing per-run reconciler,
requires the exact cohort persona, rejects duplicate identities, and ignores loose
outcome labels. `--require-acceptance` fails for missing or blocked verification.
Both legacy cohorts return 250 unassessed and zero eligible runs because they
lack explicit bound verification manifests. This is an evidence classification,
not a finding that all products failed. Frozen goals must be exercised rather than
retrofitted to existing receipts.

## Scalability and representation

The earlier 1,565-screenshot album held 844 distinct byte contents, a roughly
2 MB HTML document, 1,565 tiles and a second full inventory. An actual browser
contained 11,057 elements. A failed copying attempt retained another 370.9 MB.
These are observed sizes/counts, not a measured latency or heap profile.

The owned importer now enumerates frozen persona directories, hashes each image,
stores identical bytes once and retains each capture as a separate record. This
avoids treating output albums as new source evidence and avoids long descriptive
Windows filenames. Actual import coverage is 1,565 screenshot records plus 30
artifact-image records, 874 unique media blobs, and 440 personas with images;
60 have no image evidence. Code-only evidence must not acquire invented pictures.

Equivalent imported image bytes decrease from 186,612,448 to 116,468,962 (37.6%).
Historical archives remain on disk; this is a new-output storage improvement,
not a claim that total workspace storage was reduced. The gallery mounts 60
cards, creates file rows only when requested, and searches the complete catalog.
Viewer navigation spans the filtered catalog and returns focus to the originating
card. Surface/cohort/outcome filters replace caption parsing as the review route.

Remaining costs: the catalog is still embedded in the initial document and card
previews still load original images. Paging bounds DOM work but does not solve
thumbnail bytes, browser decoding cost, or every-device latency. Add derived
thumbnails or external catalog paging only after measuring those named burdens.

## Product implementation finding

PadPilot's browser development host restored a saved FX preset's old revision.
The provider correctly rejected that older non-authoritative frame, leaving the
visible Low Shelf value unchanged. The host now applies the saved payload at the
next local revision and preserves selected-preset identity. A deterministic
save/edit/recall regression reproduced revision 10 instead of 12 before the fix.
It now passes with the existing host suite (14 tests, 74 assertions), and the full
PadPilot application typecheck passes. The original frozen persona 007 browser
scenario also passes: saved -1.1399999856948853, edited -1.5, recalled exactly the
saved value. A supplemental replay dismisses the modal and captures the restored
visible control with the exact readback in its receipt. Both runs have zero action
failures and uncaught exceptions; two existing Solid `createRoot` warnings remain.
The other three historical personas and native/audio-host acceptance were not
replayed. The owned isolated server was stopped.

The frozen Mastering persona 004 replay exposed a different failure: WAV encoding
correctly rejected clipping, but its error appeared above the charts, outside the
export viewport. The runner waited for a download and mislabeled that rejection
as a timeout. Export errors now appear directly above the export controls, and
the browser regression checks visibility, absence of a rejected download, and
limiter/apply/retry recovery. The clipping protection remains enforced.
The same persona and unchanged source then delivered a decoded 10-second stereo
44.1 kHz, 24-bit PCM WAV (2,646,044 bytes; SHA-256
`6f850cdb3ca9c24af0450d885af0da2b7547639bbc16c47fcd962292bf489fd6`).
The replay has three flows and no action errors, console errors or uncaught
exceptions. Persona 014, native chooser/drag and human listening remain unverified;
004's cause must not be assigned to them without evidence.

## Research and the decisions it supports

| Theme | Primary research | Applied practice and limit |
| --- | --- | --- |
| Complexity and API design | [Muratori: Semantic Compression](https://caseymuratori.com/blog_0015), [granularity](https://caseymuratori.com/blog_0016); [Blow: data and operations](https://the-witness.net/news/2012/09/a-note-about-programming-language-design/) | Model captures, byte identity and acceptance as separate concerns. One importer/catalog removes repeated concrete work; no generic workflow framework is needed. |
| Scale | [web.dev: DOM size and interactivity](https://web.dev/articles/dom-size-and-interactivity), [image loading costs](https://web.dev/articles/lcp-lazy-loading) | Bound retained DOM and count bytes separately. A lazy original image is not a thumbnail; fewer nodes alone does not prove latency. |
| Reliable verification | [Playwright best practices](https://playwright.dev/docs/best-practices), [test retries](https://playwright.dev/docs/test-retries) | Test user-visible goals with isolated state. Keep failed attempts and explicit selected replays; a retry or exit zero does not expand mission scope. |
| UX research | [GOV.UK moderated usability tasks](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing), [NN/g synthetic users](https://www.nngroup.com/articles/synthetic-users/) | Seeded automation is useful for behavioral probes and hypotheses. It does not establish human needs, comprehension or preference. |
| Accessibility | [W3C involving users](https://www.w3.org/WAI/test-evaluate/involving-users/), [modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Combine technical checks with relevant users/tools. Verify keyboard completion and modal focus; heading counts and focus outside BODY are narrower proxies. |
| Lint and test policy | [ESLint ignored files](https://eslint.org/docs/latest/use/configure/ignore), [Google: testing feedback loops](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html) | Keep data/output ignored and maintained producers checked. Use focused boundary regressions plus a real consumer smoke. Neither source-size metrics nor a larger test count proves outcome quality. |

## Durable owners and acceptance

- [Evidence review skill](../../.agents/skills/audit-evidence-review/SKILL.md)
  routes existing claims through raw evidence and producing code. A blind forward
  evaluation on utilities/003 and website-host/001 retained narrow observations,
  rejected unsupported completion and identified missing public-consumer/persona
  evidence. It was a skill-routing review, not new product acceptance.
- [Audit reconciliation](../../.agents/skills/user-audit/references/evidence-reconciliation.md)
  owns frozen assertions, persona dispositions, selected attempts and aggregate
  authority. Its existing pilot-before-fan-out rule was bypassed, not absent. The
  new `quality/preflight.ts` recomputes an explicitly selected pilot against the
  current target hash and exact frozen mission family. Missing, stale or blocked
  proof prevents strict fan-out; exploratory output never grants fan-out. This
  mechanical gate does not replace independent semantic inspection.
- [Managed dev servers](../../.agents/skills/dev-server/SKILL.md) own
  `--isolated --local-auth` startup for supported surfaces. The supervisor isolates
  storage, binds loopback and replaces inherited deployment settings. A real Books
  smoke returned the local developer, rejected a foreign Origin with 403 and used
  its own SQLite file despite inherited Railway/remote-database fixtures. The
  owned server was stopped; Trade Bot and Marketplace runtime behavior were not
  newly exercised by that smoke.
- [Album tooling](../../scripts/albums/README.md#audit-evidence-at-scale) owns
  manifest import, deduplication, provenance, bounded presentation and verification.
- [Package testing](../package-testing.md) distinguishes direct-source smoke from
  public export/build/extraction evidence.
- [Code style](../code-style.md) keeps executable generated behavior in checked
  sources. Existing size ratchets are maintenance limits, not architecture scores.

The focused album/audit suites pass 33 tests and 97 assertions; the separate
PadPilot host suite passes 14 tests and 74 assertions. Targeted lint and TypeScript
pass, as does the guidance checker. The installed builder
also generated a disposable album using its bundled browser sidecar. Real gallery
verification sampled two pages (101 unique decoded images), exercised all applicable
filters and navigation, and rejected held-out HTML missing only `#mediaFilter`.
The browser sample is not a new exhaustive decoding pass of every image.
The current required-filter perturbation fails with the exact missing-control
diagnostic; a source-path result link also opened its captured JSON with HTTP 200.

The follow-up passes 103 tooling tests (453 assertions) across pilot/campaign,
managed-server and guidance suites, plus eight focused audio/export-gesture tests.
The Mastering browser regression passes ten checks, including clipping rejection
and decoded WAV recovery; its application typecheck and focused lint pass.
Guidance and process-policy checks pass. These checks support the named fixes,
not retrospective acceptance of the 500 legacy runs. The removed Atlas sample
was not recreated to repair its historical heading-parser finding.

Remaining acceptance: reconcile all original missions rather than preserving a
historical headline; add safe missing recovery fixtures before fan-out; replay
the unreplayed PadPilot personas/native host as relevant; observe real accessibility and human usability;
measure thumbnail/network and interaction tails before further scale changes.
Repository-wide structural/style failures in unrelated dirty-tree files remain
separate; no baselines were raised to hide them.

Detailed local notes and receipts are under `.local/audit-evidence-review/`; raw
campaigns remain under `.local/screenshots/`. These local artifacts may be pruned
after findings/receipts are promoted and the user accepts the review; retain raw
unique evidence and user feedback. This document does not depend on their presence.
