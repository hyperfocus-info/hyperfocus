# Website workspace

Examples: [Books](examples/books/README.md), [Trade Bot](examples/trade-bot/README.md)
and [Juice Me Up](examples/juice-me-up/README.md). Juice Me Up is a portable
storefront project imported into this workspace; Books and Trade Bot have their
own application runtimes.

The editor composes Books and Trade Bot through their owning packages' explicit
`/build` and `/editor-host` APIs. Browser verification uses the public UI layout
inspector and desktop-runtime screenshot/native viewport/Windows inspection
helpers. Website keeps only its section-pane inspection locally; its managed
site adapter supplies the existing repository supervisor command.

[Workflow tooling](workflow-tooling.md) records current editor friction, shared
deployment tooling and the next script/skill improvements.

The local starter picker also opens [Trade Bot](examples/trade-bot/README.md), a
separate persistent paper-trading application with risk controls, signal review,
rules and optional tutorials. It preserves the current website draft.

Public record removal reviews collection-detail and related-form views before
staging deletion. Collection-field removal names the populated values it will
erase and requires confirmation. [Record/field evidence](../../../docs/design-system/next25-batch8-website.md)
covers repair, focus recovery, Apply and Undo using the existing removal owner.

Content and page-view removal review their dependents before staging deletion.
Cross-page section references open their Inspector; dirty panel changes must be
applied or discarded before navigation. [Removal evidence](../../../docs/design-system/next25-batch7-website.md)
covers cancellation, repair, Apply and Undo through the existing command boundary.

Response settings group messages and privacy with associated schema errors.
Page views share reference validation with accepted data and explain Apply before
placement. [Settings and placement evidence](../../../docs/design-system/next25-batch6-website.md)
includes blank retention, missing records, keyboard correction and placement Undo.

Public record search preserves the row being edited; field errors use the same
validation as accepted data. Quiz loops identify their participating answers
before Apply. [Record and loop evidence](../../../docs/design-system/next25-batch5-website.md)
covers correction, focus, private-response validation and project Undo.

Collection/form fields share disclosed editing and native checkbox defaults.
Quiz routes identify missing destinations beside the affected choice and retain
schema minimums. [Field and route evidence](../../../docs/design-system/next25-batch4-website.md)
covers keyboard editing, correction and command-backed Undo.

Authoring disclosures share keyboard and focus behavior. Empty version history,
duplicate page addresses, selected starter confirmation, import review focus,
incomplete deployment targets, transfer errors and stale collection recovery have
focused checks in the [seven-task handoff](../../../docs/design-system/next25-editor.md).

Section ordering now shows its page position and disables unavailable moves.
Page appearance/search metadata and individual product groups use task disclosures.
Both local owner forms keep failed entries with nearby retry feedback; image review
counts unfinished descriptions and the empty media library explains its next step.
See the [further seven-task handoff](../../../docs/design-system/next25-batch2-editor.md)
for focused tests and disposable-component visual evidence.

Business fields share full-row checkbox controls, readable local validation and
accepted-state rollback. Fixed and delivery discounts display dollars while
commands retain cents. Checkout, delivery and subscription edits preserve focus
and Undo; [four-task evidence](../../../docs/design-system/next25-batch3-website.md)
records desktop, tablet, narrow and enlarged-text acceptance.

Save draft is the primary editor action. More contains history, publication and
preview; Files contains project opening and exports. On narrow screens, selecting
a section or Page settings reveals Edit & AI, and selecting a page reveals Page.
Generated site captions use `--site-font-caption` (default `.75rem`) independently
of the Hyperfocus editor theme. See the [cross-surface visual handoff](../../../docs/design-system/debt-sweep.md)
for browser checks, screenshots and limitations. Replay generated-template checks
from the repository root with `bun apps/engine-editor/website/scripts/visual-debt.ts`.

Website authoring lives inside the Hyperfocus engine editor. This scoped experiment
combines responsive pages, engine embeds, registered service recipes, and reviewed
AI commands. It shares the editor's server and navigation; changing workspace keeps
the website and engine sessions mounted with their unsaved work intact.

New projects start with the reusable Fieldwork studio template. PadPilot is the
second real test, using its existing marketplace/account service. Hyperfocus's
own product page is an optional starter. See the [framework research](../website-framework-research.md)
for the evidence behind this scope: completed authoring and service connections
matter more than adding another scaffolding command.

The acceptance journey is a public project page, member sign-in, private requests,
an owner dashboard, and a republished content change that preserves member records.
The delivery artifact is a Bun service with a project snapshot and persistent SQLite
or PostgreSQL. Choose **Deployment target** in Page settings: static files, a Bun
service with SQLite, or Railway with Postgres. The matching `deployment.update`
command is validated and undoable. Credentials stay in the host environment.
Every app export also includes `index.html` and relative browser assets. The
storefront HTML supports static-host catalog browsing and a local shopping bag;
accounts, live quotes, orders and payments require the included Bun service.
Open its printed URL for connected operations. Static exports disable connected
operations; the Railway profile's `/index.html` route serves the live application.
Railway exports include `railway-setup.ts`, `migrate.js`, and `RAILWAY.md`. Run the
setup script with existing project/service names, install the Railway SDK locally,
then review `railway config plan` and apply the app-only partial before `railway up`.
The partial leaves database ownership outside the exported config and discovers
existing application variable names on every evaluation to preserve their values. Set
`DATABASE_URL` to the Postgres service reference and generate a public domain.
The app uses `RAILWAY_PUBLIC_DOMAIN` for its origin unless `PUBLIC_ORIGIN` overrides
it. Migrations run before deployment; `/healthz` verifies database availability.
An absent or invalid database URL fails Railway startup instead of creating SQLite.
Postgres stores implement the async server port; the editor keeps its local store.
External hosting and arbitrary application generation are not established by local
acceptance. Product findings and remaining experiments live here.

The [Juice Me Up creation-process audit](creation-process-audit.md) distinguishes
editor authoring from platform engineering and deployment, with reproduced parity
gaps, workflow evidence, and qualified human-effort estimates.
The [storefront workflow follow-up](workflow-improvements.md) describes editable
sections, catalog/media improvements, reviewed live transfer and guided deployment.
The [security review](security-review.md) records owner bootstrap, payment status,
verified API protections and unresolved security work before enabling orders.

## Development

Website features read their mounted editor session from `BuilderSessionProvider`.
The builder creates that session once; replacing the session object remounts its
features. `session.dispose()` cancels its
pending requests and autosave work. Replacing project data stays within that
session's command/history boundary. Selection, page and pane commands belong to
`BuilderNavigationProvider`; commerce features consume narrow session commands,
and extension collection/form/quiz editors key their entity IDs. Deployment target inputs are independent local
signals; restoring a saved target batches them, and a response from a disposed
panel or an older revision cannot replace the displayed review state.

Run `bun run dev:editor` from the repository root and choose **Website**. The managed server reports
its address. `/website/builder` opens authoring directly; `/website/` shows the published site. Draft
edits stay separate from the published snapshot. This local builder stays on
loopback. Connected Bun and Railway exports also include an authenticated
`/builder`: sign in to the deployed site with a full-access owner account, then
open **Edit website**. Static exports have no connected authoring service. The
deployed editor has no local AI runtime or provider credentials.

Run `bun run --cwd apps/engine-editor website:typecheck`, `website:test`, `website:build`, `website:bench`, and
`website:verify` for focused verification. Browser acceptance uses an isolated temporary
database and owns its browser lifecycle. Benchmarks report environment-qualified
timings; correctness and bounded work are the acceptance gates.

Postgres tests require `WEBSITE_TEST_DATABASE_URL` and run against real PostgreSQL.
They create UUID-named scratch schemas, verify `current_schema()` before migrations,
and remove only their owned schemas in cleanup. Without this variable they are
explicitly skipped. Separate pools verify stock reservations and order idempotency
across replicas. No database connection is required while building the archive.

See [the quickstart](quickstart.md) and [user stories](user-stories.md) for the supported journeys.
`ENGINE_EDITOR_WEBSITE_DATA_DIR` selects isolated website state. The normal location
is `.local/engine-editor/website`; the engine project's canonical `.hyperfocus` pair
is independent. Website commands live in `src/project/command.ts`, with an enforced
UI ledger in `src/project/capability-parity.ts`. Import/starter replacement uses
the DOM-free history method as one undoable operation.

Website AI derives compact design context from the request. Unspecified app/UI
work starts with Hyperfocus quality defaults; requested stacks and visual references
take precedence. Requirement branches add only relevant guidance. This never expands
the validated website command catalog or implies arbitrary app generation support.

## First project

### Storefront recipe

In Page settings, choose **Add Storefront** to author a juice catalog. Product
prices, ingredients, allergens, availability, media, delivery rules, plans and
content are portable project data. The matching `commerce.update` command accepts
the same validated fields and commits a whole change as one undoable operation.
Use **Import a product table** to paste CSV or spreadsheet rows with Name, Price
and Category columns, plus optional Description, Ingredients, Allergens and Photo.
Review every row and map photos by name before adding the batch with one Undo.
Imports only add new names; existing products retain their IDs. Imported products
start hidden, with uncounted stock and required allergen review.
Upload one or several official JPEG, PNG or WebP images, review each name and alt
text, then import the batch as one undoable change. Exports retain the original
bytes. Choose primary/additional photos by name; product pages show additional
photos in an accessible disclosure. The product editor keeps focus and open
sections while values change. Disabling Storefront preserves its catalog and can
be undone. No generated product packaging is substituted.

Publish, then open **Owner sign in** on the site for daily operations. **Local
preview owner** in the editor creates or resets only local preview accounts.
Provision a deployed owner with the exported app's owner setup command. Owner
credentials are separate from the editable project and
are never exported. The storefront includes a searchable catalog, ingredients,
cart, server-priced quotes, delivery checks, accounts and a business workspace.
The generated business workspace is at `/#admin`. Its brand button returns to
the role's home view; Sales, Catalog, People and Business group available tasks.
Account contains Settings for owners, account security and sign-out. Settings
has searchable Ordering, Approvals and Access sections and a return action.
`Ctrl+,` or `Meta+,` opens it from an editing field. Unsaved forms and chosen
files survive section changes; each retained form keeps its original server
revision so another save cannot silently overwrite newer configuration.
`Ctrl/Meta+S` invokes the current supported save, product preview or report export;
`Ctrl/Meta+O` chooses a Media upload. Text editing and IME retain their shortcuts.
The DOM host uses shared shortcut and overlay mechanics without introducing Solid.
One primary-action owner emphasizes the active form's submit action, defaulting
to the first available task; product review confirmation takes priority. All
other submit actions remain secondary, including multi-form subscription views.
Run `bun apps/engine-editor/website/scripts/admin-navigation-fixture.ts` for an
isolated generated Juice fixture with disposable owner/data; its `fixture.json`
under `.local/navigation-2026-10-26/admin` records the managed URL and stop file.
At phone and tablet widths, navigation and catalog filters collapse into labeled
groups; business sections have a toggled drawer with nested task menus. Product cards become a
single column on small phones. Supplied artwork is contained without overlaid
category labels. Responsive acceptance covers 320, 390, 768 and 1440px, including
text bounds, placeholder widths and keyboard dismissal of navigation groups.

Unconfirmed delivery zones, tax settings, ingredient approvals, policies and plan
prices remain unconfigured. Ordering fails closed until its required settings are
complete. Manual request mode records an explicitly **unpaid** order request;
neither a successful page navigation nor a submitted form proves payment.
The owner workspace saves operations to the deployment's persistent database.
Its saved configuration takes precedence over the original exported defaults, so
updating the application never silently resets live stock or prices.

The Juice Me Up recipe also includes private saved addresses, support requests,
staff roles, media management and bounded sales reports. Hosted card checkout and
subscriptions require server-side Stripe credentials and verified webhooks; the
exported README documents setup, recovery and operational limits. Email/SMS
delivery, automatic refunds and public merchant-account acceptance are not
included in local verification. Reports cover at most the latest 500 orders.

Ordering requires an owner with an enrolled authenticator. The server rejects
client-supplied prices, account IDs and payment states, recomputes every total,
and reserves stock in the database transaction. New orders must choose a delivery
date within 30 days. Each customer may have three open unpaid/pending orders;
new-order limits persist across restarts (10 per customer or staff actor per hour,
plus 50 per trusted client address when one is available). A fresh idempotency key
does not bypass these limits.

New manual requests hold stock for 30 minutes while still awaiting processing;
expired requests are cancelled on the next configuration read or order attempt.
Existing orders retain their original reservation behavior. Card reservations
never expire by local time alone. **Check payment status** reads Stripe; **Expire
unpaid checkout** releases stock only after Stripe confirms expiration. An owner
can recover an unattached checkout using its Stripe session ID, which must match
the saved order and total. Uncertain attempts remain held until reconciled.
Refunds are recorded even when they arrive before payment confirmation, including
initial subscription invoices and renewals. Partial refund amounts remain visible
in the order record; a fully refunded order cannot enter fulfillment.

Backups use a versioned portable snapshot for SQLite and PostgreSQL. The encrypted
`.hfbackup` format uses AES-256-GCM and scrypt with a fresh salt and nonce per file;
the passphrase must contain 16–1024 characters. The 64 MiB payload limit fails
explicitly rather than truncating records. Backups include the project, accounts,
commerce records and audit history. Active sessions, temporary recovery grants,
login throttles and unfinished authenticator enrollment are excluded. When MFA
is enrolled, the matching deployment auth encryption key must be included inside
the encrypted payload so restored authenticators can be recovered.

Restore accepts only a fresh destination with its untouched default project and
no account or business records. All inserts commit together or roll back together;
existing records are never overwritten. Restore resets scheduled backups to
disabled and creates a new storage namespace. Schedule claims and completion
receipts persist in the database, with a 30-minute worker lease and a 15-minute
minimum retry interval. PostgreSQL replicas share the lease. The snapshot adapter
rejects unknown tables or changed columns instead of silently omitting new data.

Owners and managers can use **Collect payment** to choose an existing customer
account, select bottles and delivery details, and review an authoritative quote.
Creating the link reserves one pending order on that customer's account. Its QR
code is generated locally; copying or scanning the link does not confirm payment
or send a message. Retry the same attempt after an interruption, or recover its
link from Orders. Paid, cancelled, refunded, manual-request and subscription
orders cannot be reused as new staff payment links. Pending orders expose provider
reconciliation and confirmed checkout expiry; uncertain attempts retain stock.
The setup disclosure checks credential presence only and links to Stripe account
creation and webhook instructions. Credentials belong in protected deployment
variables, never the project. Tap to Pay guidance opens Stripe's separate mobile
app documentation; independent mobile-app payments do not automatically reconcile
these orders. Ordering remains gated until the merchant and business setup is complete.

The owner-only **Backups** workspace controls cloud backup frequency (hourly,
every 6 or 12 hours, daily, or weekly) and retention from 1 to 365 days. It displays
stored bytes, copy history, last success, next run and failures without estimating
provider prices. The newest successful copy is retained even when its age exceeds
the retention setting. Pausing automatic backups does not delete existing copies.
Sensitive backup actions require recent identity confirmation. Owners can run a
cloud backup, download a saved copy with a chosen passphrase, or download a fresh
encrypted `.hfbackup` file without a cloud bucket. Save its passphrase separately;
the download contains private records and protected recovery material. Passphrases
are cleared from the form after success and are never stored in browser storage.
Recovery uses the exported CLI against a fresh database, not a browser action that
overwrites a running site. See [backup recovery](backup-recovery.md) for the exact commands.

The `/api/builder/commands` response includes a
`hyperfocus-website-command-handoff-v1` receipt with request ID, intent, completed
commands, project hash, persisted status and the resulting draft. This website
revision authority is separate from the engine's `.hyperfocus` project pair.

### Page and member area

1. Choose **Website** in the editor. Select a section or click its text in the live preview.
2. Edit headings, text, images, links, spacing and alignment. Add or reorder
   sections in the left panel. The interactive section includes a real engine
   particle scene; replace `/demo` with a hosted engine build when ready.
3. Choose **Add member area**, customize its title, and choose **Publish**.
4. Open the site and register a member. Each member can create, edit, update the
   status of, and delete their own requests. The owner can manage all requests.
5. In page settings, expand **Set up the owner account** to create the separate
   owner login. Local account recovery can reset a password and revoke sessions.
6. Publish later content edits without changing member records. Download the
   project document for backup or **Export app** for an independent Bun service.
   **Open project** restores a downloaded document as an undoable draft change.

Drafts autosave after a pause; Ctrl+S also saves. Ctrl+Z/Shift+Ctrl+Z undo/redo
project commands outside text inputs during the current session. **Versions &
recovery** keeps up to 50 durable versions within 16 MiB, including original
photos. Reviewed restores change the draft while retaining current prices,
stock, ingredients and approvals; publishing remains a separate action. The
business workspace's **Content versions** retains up to 50 versions within
12 MiB and restores reviewed copy/photos directly to the live store without
rewinding prices, stock, orders or accounts.

Leaving with unsaved changes triggers a browser warning. Conflicts preserve the
unsaved candidate; load the latest draft, review the recovered preview, and use
or download that copy. Browser recovery is scoped to the signed-in owner and
depends on available browser storage; download a copy if storage is unavailable.
**Publish local preview** affects only the local site. In the deployed editor,
**Publish live** updates the live site with revision checks and preserves current
business settings that were not edited. Panel layout is app-user local storage and
does not enter project history. On narrow screens, switch between Sections,
Page, and Edit & AI. Source edits require restarting the managed development
surface; this experiment does not add a separate HMR watcher.

## AI editing

Choose **Ask AI** to use the embedded local runtime. It lists the currently
available agent/provider/model profiles and their reasoning choices. Describe a
page change or ask for the member request area, review the actual proposed values,
then apply the whole plan as one undoable edit. A page change invalidates a pending
proposal; regenerate it against the new state. Cancel/retry remain visible.
The UI never receives provider keys. Exported sites include the authenticated
editor but no local AI runtime; Ask AI is unavailable in remote authoring.

AI can author only registered commands, including the defined page, navigation,
collection, form and quiz extensions. It cannot invent arbitrary integrations,
payment processors, email flows, executable scripts or server code. The
command module and protected `/api/builder/commands` endpoint provide equivalent
DOM-free authoring; use the current draft revision to avoid stale writes.

The repeatable live experiment is `bun apps/engine-editor/website/experiment-ai.ts --live`.
It uses the installed Codex account for one synthetic project proposal and may
incur usage. Ordinary tests inject a runtime and do not call providers.

## Delivery and recovery

Export app downloads `site.tar.gz`: project snapshot, bundled Bun server,
member client, bundled engine demo, Dockerfile, and setup/license documentation.
Extract outside the checkout and run `bun deploy.js`; no dependency installation
is required. The default service binds to loopback. Public hosting requires an
exact HTTPS `PUBLIC_ORIGIN`, `HOST=0.0.0.0`, and `SITE_DATA_DIR` on persistent storage.
The included Dockerfile is a starting deployment recipe; Docker/Linux and public
hosting are not certified by the Windows local acceptance.

Create the first deployed owner through `bun deploy.js --issue-owner-setup` and
the token form at `/#security`; see [account security](account-security.md).
Existing owners can grant full access to another existing account from Staff.
Each full-access owner can edit and publish independently; there is no mandatory
adult approval step. Optional Manager, Fulfillment and Content roles remain
restricted and are not required for family members. Public signup never grants
owner privileges. Durable authentication limits work across replicas; Railway's
trusted `X-Real-IP` is used only with explicit `SITE_TRUST_PROXY=railway` configuration.

For an update, stop the app, replace application files and `project.json`, and
restart with the same data directory. The imported snapshot changes published
content without overwriting accounts or requests. Restarting the same artifact
preserves edits published through the remote editor; a changed deployment
snapshot is an intentional publication. Use encrypted backups and retain the
matching application files for recovery. Exports include the editor assets, but
never the running database, member credentials, sessions, or provider secrets.

When remote authoring starts on an older deployment, an untouched revision-zero
draft adopts the published site, even if an earlier initialization left an old
starter in place. Its previous snapshot remains in Versions. Repairing an already
initialized draft advances its revision so stale browser saves must reload;
edited drafts and drafts with authored version history are preserved.

## Experiments and current vision

The working proposition is a visual builder for one known stack, with complete
app recipes that expose editable data and commands to both a person and AI.
The first recipe is private member requests. More recipes need their own complete
UI, access rules, persistence, deployment, and recovery acceptance.

On 2026-09-11 a live installed Codex-account request renamed the example studio,
rewrote its page, and enabled private playtest requests in 11.7 seconds. Its four
validated commands applied atomically and undo restored the exact original project.
This was one successful task, not a model reliability benchmark; CLI token usage
was unavailable. Local evidence: `.local/site-builder/live-ai.json`.

The pure command-and-render benchmark uses 20 warmups and 100 samples at 10, 100,
and 500 sections. On Bun 1.4.2/Windows/i9-13900HX, median/p95 combined time was
0.16/0.36 ms, 0.99/3.23 ms, and 6.83/9.20 ms respectively. HTML size was 14/76/351 KB.
Power, thermal and competing-work conditions were unrecorded, so these are
diagnostic timings. They exclude browser layout and preview reload cost. The
baseline does not yet justify worker/WASM optimization. `bench` saves the full
environment report to `.local/engine-editor/website/benchmark.json`.

Next experiments, in order:

- Author a real project site and collect taste/usability feedback. The current
  section model has a few layouts, not a general nested responsive layout editor.
- Exercise the PadPilot service recipe with its real catalog and account flow.
  Use that evidence before extracting shared backend tooling.
- Compare native block authoring with an existing builder on that same page if
  layout limitations become the measured source of friction.

Current limits: pages and navigation use the registered layout and link model;
the storefront supplies its defined commerce routes. Collections, forms and quizzes
use validated fields and bindings rather than arbitrary server code. There is no
arbitrary database sync or existing-codebase import. Connected exports remain
editable through their authenticated builder and portable project document;
arbitrary generated-code round-trip is not promised.

## Family workflow and extension boundary

The [Juice Me Up family audit](family-editor-audit.md) records the original findings
and subsequent acceptance. The supported workflow uses individual full-access
accounts on shared Windows computers, phones and tablets, without a mandatory
adult approval gate. Remote authoring, durable recovery, pages/navigation and the
defined collection/form/quiz extensions are implemented; their tested boundaries
and remaining limitations belong to the current acceptance report. Optional
Content staff receive a scoped DTO and cannot change pricing, stock, legal/contact/
delivery settings or ingredient approval. These permissions do not restrict owners.

Juice Me Up source and retained release evidence now live in
[the website example](examples/juice-me-up/README.md#retained-application-files).
Live: https://juice-me-up-production.up.railway.app. Historical evidence retains
the former project directory and identifiers. Consult the example's acceptance manifest for
the current release path, artifact hash and test totals; earlier counts below are
historical records.

## Verification evidence

The 2026-09-19 storefront workflow follow-up passes 97 native tests (767 assertions)
and 25 browser-component tests (143 assertions), plus 20 tests against PostgreSQL
(152 assertions). Website TypeScript and the independent exported-app persistence
acceptance pass. The fresh editor replay passes 13 flows; the live-settings transfer
journey passes 20 checks. See [workflow improvements](workflow-improvements.md) for
scope and remaining boundaries. The preceding security release evidence is indexed by
`C:/Users/MindOverMelee/Juiced Up/verification/acceptance.json`; earlier figures below
are historical acceptance records, not the current release manifest.

Juice Me Up acceptance on 2026-09-18 uses the editor command handoff and an exported
17-product, seven-image storefront. Evidence owner: `.local/juiced-up/evidence`;
artifact hashes and setup instructions live beside the external export in
`C:/Users/MindOverMelee/Juiced Up`. The focused suite passes 73 tests with 583
assertions, plus website TypeScript/build and process policy. Browser evidence
covers desktop/phone shopping and owner operations. The full live-business brief
is not release-accepted: merchant credentials, final business decisions, external
notifications and provider/hosting acceptance remain outstanding. Existing
repository-wide PadPilot structure debt, unrelated review-store/artifact-review
style violations and a missing `apps/.local/package.json` prevent the broad editor
ship gate from passing; these are not overridden by focused website checks.

`test` runs server/model tests without DOM globals and the AI component test with
the repository's existing browser preload in a separate process. This prevents
HappyDOM request/header behavior from contaminating HTTP security acceptance.
`verify` starts managed servers with disposable state, exercises actual browser
editing/member journeys, exports and extracts an app outside the checkout, and
checks account/request survival across a revised snapshot and server restart.
Reports, screenshots and the hashed candidate are written under
`.local/engine-editor/website/evidence/<timestamp>/`. Browser layout checks include 390px;
preview iframe pointer editing is checked at the native desktop viewport.

Integrated editor acceptance passed on 2026-09-11 with candidate SHA-256
`3a25019a0c2afaeaad9f0c34321dc5b1597ee356e3134d9f7d40a5f97d782e88`
(54,152-byte compressed app). Evidence owner:
`.local/engine-editor/website/evidence/2026-09-11T13-12-56-936Z/report.json`.
It additionally covers the existing editor's Website navigation, an unsaved draft
surviving a return to the engine, and the untouched Studio default. All browser
checks passed with no console errors, horizontal overflow, or visible Windows
process windows. Isolated servers and browser processes were cleaned up.
The subsequent Sections pane correction is checked by `outline-report.json` in
the same directory: both pane and section-list overflow are zero, and long labels
use ellipsis. `studio-default-workspace-refined.png` shows the corrected candidate.

The earlier standalone experiment's 2026-09-11 acceptance passed with candidate SHA-256
`59418fe09e2773e32b769af1d722fb771433d60d8e5d06c111111dcc604fc382`
(59,286-byte compressed app). Evidence owner:
`.local/site-builder/evidence/2026-09-11T12-17-36-564Z/report.json`.
It covers desktop inline/inspector edits, member recipe activation, public engine
interaction, reduced-motion behavior, member create/edit/sign-out/sign-in, phone
layouts, and extracted-app restart/republication with retained records. Server and
browser process trees had no visible Windows windows; owned test processes were
cleaned up. Separate HTTP tests cover two-member isolation and owner access.

Failures found and closed during this experiment:

| Finding | Fix and reproduction |
| --- | --- |
| Preview selection would replace the frame during typing | Selection uses a message; browser checks direct text edits |
| Demo startup and paused bursts exceeded engine time-step bounds | Bounded particle settling; real engine regression and browser motion checks |
| Hidden pagination buttons remained visible under author CSS | Explicit hidden rule; browser checks one-page pagination |
| Populated textarea labels included their contents | Stable accessible names; browser edits and reloads member details |
| Browser username pattern rejected unescaped hyphen under Unicode v mode | Escaped pattern; clean registration/sign-in console acceptance |
| Screenshot stalled on an inactive emulated tab | Bring the owned page forward without changing viewport; phone capture passes |
| Startup failure could open or change state before required files were readable | Stage artifacts before opening/seeding storage; startup-failure regressions |
| Editor tooltip enhancement replaces native title attributes | Website iframe has a stable accessible label; integrated browser navigation uses that identity |

Focused checks pass: 39 website tests (374 assertions), 10 editor navigation/parity
and supervisor tests (239 assertions), editor and website TypeScript, and the full
editor build. Process policy passes. The repository-wide source-structure gate
still reports pre-existing PadPilot evaluator directory size debt; touched website
files have no violations. No public deployment
or release publication was performed. Live AI was checked through the real runtime
API; the AI panel itself has deterministic UI coverage rather than live browser
provider acceptance.

## Project automation and branding

Use `bun apps/engine-editor/website/cli.ts --help` for hash-checked file plans, imports and HTML/connected archives; use `delivery-cli.ts` for the same pinned Railway guide as the UI. Logo and Social preview are portable project fields. See [branding](../../../packages/branding/README.md), [delivery receipts](../../../packages/website-host/src/delivery/README.md), and [source examples](../example-workspace/README.md).
