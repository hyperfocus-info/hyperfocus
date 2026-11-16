# Public records and indirect quiz loops

These two tasks extend prior field setup and missing-destination recovery. They
do not recount those tasks.

| Task | Before failure | Current behavior |
| --- | --- | --- |
| Find and correct a public record | Forty records required scanning native disclosures; a cleared required field had no associated error until Apply rejected the whole extension draft | Existing collection editor provides search, distinct empty/no-match recovery and Add before the list. A row being edited stays mounted even if its name stops matching search. Each field uses the same value validator as the accepted project/submission boundary. |
| Correct an indirect quiz loop | Three existing questions could route back to the first; Apply named a loop without identifying participating answers | A bounded graph helper is shared by schema validation and the editor. Every participating route has an associated error; closed question summaries identify where to inspect. Correcting an edge removes resolved errors without replacing the control. |

## Ownership and repetition

The scan covered `validateValues`, extension schema graph checks, public-form
submission, Collection/Form field consumers, staged extension-panel Apply and
the shared SelectControl error contract. `validateFieldValue` is the existing
value-validation leaf, now called by both the aggregate validator and record UI.
`quizLoopRoutes` serves schema validation and local diagnostics. No schema-form
framework or alternative command validator was created. Unknown-field rejection,
complete extension validation and project/history ownership remain intact.

Search, the retained editing row and disclosures are session state. Draft values
remain staged until Apply; successful writes use `extensions.update` and Undo.
Collection records are public authored content, not private visitor responses.
Existing inspectors own resize, collapse and persistence.

Screenshot review also reproduced a shared SelectControl tooltip covering the
associated error after focus returned. The existing rejection regression failed
before the fix. Invalid selections now suppress their tooltip while keeping
their label, error association, picker and focus return. This also applies to
Website commerce choices; no caller-specific offset or new variant was added.

## Evidence and replay

- [Before report](../../.local/design-system/evidence/next25-batch5-website/before/report.json)
- [After report](../../.local/design-system/evidence/next25-batch5-website/after/report.json)
- [Obscured error before](../../.local/design-system/evidence/next25-batch5-shared/tooltip-error-before.png)
- [Quiz error after](../../.local/design-system/evidence/next25-batch5-website/after/quiz-scaled-invalid.png)
- [Record correction](../../.local/design-system/evidence/next25-batch5-website/after/records-scaled-invalid.png)

Both tasks use 1440, 820, 390 and 390px/200% root text, with touch enabled at
narrow width. Production editors operate on a disposable command-backed project.
The after runner verifies no-match/clear recovery, actual last-record editing,
retained focus, error association, loop correction, accepted data and Undo.
Captures own and close headless browsers, with Windows visibility inspection.
Root text scaling is not native browser zoom. No live publication or visitor
response is written. Before images were captured before these production edits.

```powershell
bun apps/engine-editor/website/scripts/batch5/capture.ts
bun test --conditions=browser ./apps/engine-editor/website/src/client/extensions/record-routing.test.tsx ./apps/engine-editor/website/src/client/extensions/authoring.test.tsx ./apps/engine-editor/website/src/client/extensions/recovery.test.tsx ./apps/engine-editor/website/src/extensions/extensions.test.tsx ./packages/ui/src/primitives/selection/invalid-state.test.tsx
# Server/schema tests: run from apps/engine-editor/website without browser preload.
bun test ./src/extensions/extensions.test.ts ./src/extensions/quiz-routes.test.ts
```

Keep the lanes separate. Running the HTTP test under the DOM preload replaces
request behavior; a `.ts` substring filter also selects `.tsx`. Explicit `./`
paths and the Website working directory run the intended server files. The
correct lanes pass 20 Website tests / 127 assertions, plus the shared rejection
regression. TypeScript passed; final build/gate results belong in the batch ledger.
Independent review also reproduced a length mismatch: a short value padded past
2,000 raw characters passed trimmed local validation while the record schema
rejected it. The shared leaf now checks raw length before normalization, with
regressions for both padded and whitespace-only values.

The fixture contains 40 records; the supported 200-record limit still uses ordinary
DOM rows. Search is local text matching, not a generalized query system. Full
hosted Website navigation, publishing and large-record performance need their
own acceptance. The UI explains participating loop edges, not a graphical route
editor or a suggested replacement plan.
